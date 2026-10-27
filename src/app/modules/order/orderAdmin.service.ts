import type { OrderStatus, Prisma } from "@prisma/client"
import { orderLabel } from "../../../domain/checkout/checkoutRules"
import { canStaffMove, staffTransitions } from "../../../domain/order/orderRules"
import { toCsv } from "../../../shared/csv"
import { env } from "../../../config"
import { sendMail } from "../../../helpers/mailer"
import { renderMail } from "../../../helpers/mailer/template"
import httpStatus from "../../../shared/httpStatus"
import { toMeta, toSkipTake } from "../../../shared/pagination"
import { prisma } from "../../../shared/prisma"
import ApiError from "../../errors/ApiError"
import { orderSelect, releaseOrder, toOrderView } from "./order.service"

interface ListQuery {
	page: number
	limit: number
	sortOrder: "asc" | "desc"
	search?: string
	status?: OrderStatus
	userId?: string
}

interface AddressSnapshot {
	firstName?: string
	lastName?: string
	countryCode?: string
}

const nameOf = (address: unknown): string => {
	const { firstName = "", lastName = "" } = (address ?? {}) as AddressSnapshot
	return `${firstName} ${lastName}`.trim()
}

/** "DRFT-10001", "10001" or a part of the email or the shipping name. */
const searchWhere = (search: string): Prisma.OrderWhereInput => {
	const number = /^(?:drft-)?(\d{1,9})$/i.exec(search)?.[1]
	if (number) return { number: Number(number) }
	return {
		OR: [
			{ email: { contains: search, mode: "insensitive" } },
			{ shippingAddress: { path: ["lastName"], string_contains: search } },
			{ shippingAddress: { path: ["firstName"], string_contains: search } },
		],
	}
}

const list = async (query: ListQuery) => {
	const where: Prisma.OrderWhereInput = {
		...(query.status ? { status: query.status } : {}),
		...(query.userId ? { userId: query.userId } : {}),
		...(query.search ? searchWhere(query.search) : {}),
	}
	const [rows, total] = await Promise.all([
		prisma.order.findMany({
			where,
			orderBy: { createdAt: query.sortOrder },
			...toSkipTake(query),
			select: {
				id: true,
				number: true,
				status: true,
				email: true,
				userId: true,
				shippingAddress: true,
				total: true,
				currency: true,
				paymentProvider: true,
				createdAt: true,
				items: { orderBy: { position: "asc" }, select: { quantity: true, productName: true } },
			},
		}),
		prisma.order.count({ where }),
	])
	const orders = rows.map((order) => ({
		id: order.id,
		number: orderLabel(order.number),
		status: order.status,
		customer: { name: nameOf(order.shippingAddress), email: order.email, isRegistered: !!order.userId },
		country: (order.shippingAddress as AddressSnapshot | null)?.countryCode ?? null,
		itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
		// The first line's product, for list rows ("Aero V3 Freeride Kite +1").
		firstProduct: order.items[0]?.productName ?? null,
		total: order.total.toFixed(2),
		currency: order.currency,
		paymentProvider: order.paymentProvider,
		createdAt: order.createdAt,
	}))
	return { orders, meta: toMeta(query, total) }
}

const EXPORT_LIMIT = 20_000

/** Orders as CSV for accounting: one row per order, newest first, optionally by status and date range. */
const exportCsv = async (query: { status?: OrderStatus; from?: Date; to?: Date }) => {
	const rows = await prisma.order.findMany({
		where: {
			...(query.status ? { status: query.status } : {}),
			...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } } : {}),
		},
		orderBy: { createdAt: "desc" },
		take: EXPORT_LIMIT,
		select: {
			number: true,
			status: true,
			email: true,
			shippingAddress: true,
			shippingMethod: true,
			currency: true,
			subtotal: true,
			shippingTotal: true,
			vatRate: true,
			vatTotal: true,
			total: true,
			paymentProvider: true,
			createdAt: true,
			paidAt: true,
			shippedAt: true,
			trackingCarrier: true,
			trackingNumber: true,
			items: { orderBy: { position: "asc" }, select: { quantity: true, productName: true, sku: true } },
		},
	})
	return toCsv(
		[
			"order",
			"created_at",
			"status",
			"email",
			"name",
			"country",
			"items",
			"products",
			"shipping_method",
			"currency",
			"subtotal",
			"shipping",
			"vat_rate",
			"vat",
			"total",
			"payment",
			"paid_at",
			"shipped_at",
			"carrier",
			"tracking_number",
		],
		rows.map((o) => [
			orderLabel(o.number),
			o.createdAt.toISOString(),
			o.status,
			o.email,
			nameOf(o.shippingAddress),
			(o.shippingAddress as AddressSnapshot | null)?.countryCode ?? null,
			o.items.reduce((sum, item) => sum + item.quantity, 0),
			o.items.map((i) => `${i.quantity}× ${i.productName}${i.sku ? ` (${i.sku})` : ""}`).join("; "),
			o.shippingMethod,
			o.currency,
			o.subtotal.toFixed(2),
			o.shippingTotal.toFixed(2),
			o.vatRate.toFixed(2),
			o.vatTotal.toFixed(2),
			o.total.toFixed(2),
			o.paymentProvider,
			o.paidAt?.toISOString(),
			o.shippedAt?.toISOString(),
			o.trackingCarrier,
			o.trackingNumber,
		])
	)
}

/** How many orders are in each status, for the filter tabs. */
const statusCounts = async (): Promise<Record<OrderStatus, number>> => {
	const groups = await prisma.order.groupBy({ by: ["status"], _count: { _all: true } })
	const counts = {
		PENDING_PAYMENT: 0,
		PAID: 0,
		PROCESSING: 0,
		SHIPPED: 0,
		DELIVERED: 0,
		CANCELLED: 0,
		REFUNDED: 0,
		PARTIALLY_REFUNDED: 0,
	} satisfies Record<OrderStatus, number>
	for (const group of groups) counts[group.status] = group._count._all
	return counts
}

const staffName = (user: { firstName: string | null; lastName: string | null; email: string } | null) =>
	user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email : null

const personSelect = { firstName: true, lastName: true, email: true } as const

/** Everything staff need on the order page. */
const get = async (id: string) => {
	const order = await prisma.order.findUnique({
		where: { id },
		select: {
			...orderSelect,
			userId: true,
			marketingOptIn: true,
			cancelledAt: true,
			shippedAt: true,
			deliveredAt: true,
			trackingCarrier: true,
			trackingNumber: true,
			trackingUrl: true,
			user: { select: { id: true, ...personSelect, deletedAt: true, _count: { select: { orders: true } } } },
			history: {
				orderBy: { createdAt: "asc" },
				select: { id: true, status: true, note: true, createdAt: true, actor: { select: personSelect } },
			},
			notes: {
				orderBy: { createdAt: "desc" },
				select: { id: true, body: true, createdAt: true, author: { select: personSelect } },
			},
		},
	})
	if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found")

	const account = order.user && !order.user.deletedAt ? order.user : null
	return {
		...toOrderView(order),
		marketingOptIn: order.marketingOptIn,
		cancelledAt: order.cancelledAt,
		shippedAt: order.shippedAt,
		deliveredAt: order.deliveredAt,
		tracking: order.trackingNumber
			? { carrier: order.trackingCarrier, number: order.trackingNumber, url: order.trackingUrl }
			: null,
		customer: {
			name: nameOf(order.shippingAddress),
			email: order.email,
			account: account ? { id: account.id, name: staffName(account), orderCount: account._count.orders } : null,
		},
		history: order.history.map((entry) => ({
			id: entry.id,
			status: entry.status,
			note: entry.note,
			createdAt: entry.createdAt,
			by: staffName(entry.actor),
		})),
		notes: order.notes.map((note) => ({
			id: note.id,
			body: note.body,
			createdAt: note.createdAt,
			by: staffName(note.author),
		})),
		nextStatuses: staffTransitions(order.status),
	}
}

interface Tracking {
	trackingCarrier?: string | null
	trackingNumber?: string | null
	trackingUrl?: string | null
}

interface StatusChange extends Tracking {
	status: OrderStatus
	note?: string | null
	notifyCustomer: boolean
}

const notify = async (orderId: string, status: OrderStatus) => {
	if (status !== "SHIPPED" && status !== "CANCELLED") return
	const order = await prisma.order.findUniqueOrThrow({
		where: { id: orderId },
		select: {
			number: true,
			email: true,
			userId: true,
			shippingAddress: true,
			trackingCarrier: true,
			trackingNumber: true,
			trackingUrl: true,
		},
	})
	const label = orderLabel(order.number)
	const { firstName } = order.shippingAddress as AddressSnapshot
	const greeting = `Hi${firstName ? ` ${firstName}` : ""},`
	// Guests see an order only with the cookie from placing it, so only customers get a link.
	const orderLink = order.userId ? `${env.PUBLIC_BASE_URL}/account/orders/${orderId}` : null

	await sendMail(
		status === "SHIPPED"
			? renderMail({
					to: order.email,
					subject: `Your DRFT order ${label} is on its way`,
					preheader: `Order ${label} has left our warehouse.`,
					heading: "Your order is on its way",
					paragraphs: [greeting, `Order ${label} has shipped.`],
					details: [
						{ label: "Order", value: label },
						...(order.trackingCarrier ? [{ label: "Carrier", value: order.trackingCarrier }] : []),
						...(order.trackingNumber ? [{ label: "Tracking number", value: order.trackingNumber }] : []),
					],
					action: order.trackingUrl
						? { label: "Track your parcel", url: order.trackingUrl }
						: orderLink
							? { label: "View your order", url: orderLink }
							: undefined,
					after: order.trackingUrl && orderLink ? [`Order details: ${orderLink}`] : [],
				})
			: renderMail({
					to: order.email,
					subject: `Your DRFT order ${label} was cancelled`,
					heading: "Your order was cancelled",
					paragraphs: [greeting, `Order ${label} was cancelled before payment. Nothing was charged.`],
					details: [{ label: "Order", value: label }],
				})
	)
}

/**
 * A status change made by staff. Only the moves in the order rules are
 * allowed, and each one only applies if the order is still in the status the
 * page showed, so two people (or a payment) changing it at once never both win.
 */
const changeStatus = async (actorId: string, id: string, change: StatusChange) => {
	const order = await prisma.order.findUnique({ where: { id }, select: { status: true } })
	if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found")
	if (!canStaffMove(order.status, change.status)) {
		throw new ApiError(httpStatus.CONFLICT, `An order that is ${order.status} cannot be set to ${change.status}`)
	}

	const note = change.note || null
	const applied = await prisma.$transaction(async (tx) => {
		if (change.status === "CANCELLED") return releaseOrder(tx, id, note ?? "Cancelled by staff", actorId)

		const now = new Date()
		const updated = await tx.order.updateMany({
			where: { id, status: order.status },
			data: {
				status: change.status,
				...(change.status === "SHIPPED"
					? {
							shippedAt: now,
							trackingCarrier: change.trackingCarrier || null,
							trackingNumber: change.trackingNumber || null,
							trackingUrl: change.trackingUrl || null,
						}
					: {}),
				...(change.status === "DELIVERED" ? { deliveredAt: now } : {}),
			},
		})
		if (updated.count === 0) return false
		await tx.orderStatusHistory.create({ data: { orderId: id, status: change.status, note, actorId } })
		return true
	})
	if (!applied) throw new ApiError(httpStatus.CONFLICT, "The order changed in the meantime. Reload it and try again.")

	if (change.notifyCustomer) await notify(id, change.status)
	return get(id)
}

/** Corrects the tracking details of an order that has shipped (no mail). */
const updateTracking = async (id: string, tracking: Tracking) => {
	const order = await prisma.order.findUnique({ where: { id }, select: { status: true } })
	if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found")
	if (order.status !== "SHIPPED" && order.status !== "DELIVERED") {
		throw new ApiError(httpStatus.CONFLICT, "Tracking can be added once the order has shipped")
	}
	await prisma.order.update({
		where: { id },
		data: {
			trackingCarrier: tracking.trackingCarrier || null,
			trackingNumber: tracking.trackingNumber || null,
			trackingUrl: tracking.trackingUrl || null,
		},
	})
	return get(id)
}

const addNote = async (authorId: string, id: string, body: string) => {
	const order = await prisma.order.findUnique({ where: { id }, select: { id: true } })
	if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found")
	await prisma.orderNote.create({ data: { orderId: id, authorId, body } })
	return get(id)
}

export const OrderAdminService = { list, statusCounts, exportCsv, get, changeStatus, updateTracking, addNote }
