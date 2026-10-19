import { Prisma } from "@prisma/client"
import { orderLabel } from "../../../domain/checkout/checkoutRules"
import httpStatus from "../../../shared/httpStatus"
import { toMeta, toSkipTake, type PaginationInput } from "../../../shared/pagination"
import { prisma } from "../../../shared/prisma"
import { hashToken } from "../../../shared/token"
import ApiError from "../../errors/ApiError"

export const orderSelect = {
	id: true,
	number: true,
	status: true,
	email: true,
	phone: true,
	shippingAddress: true,
	billingAddress: true,
	shippingMethod: true,
	currency: true,
	subtotal: true,
	shippingTotal: true,
	vatRate: true,
	vatTotal: true,
	total: true,
	paymentProvider: true,
	reservedUntil: true,
	paidAt: true,
	createdAt: true,
	items: {
		orderBy: { position: "asc" },
		select: {
			id: true,
			productName: true,
			productSlug: true,
			typeLabel: true,
			sku: true,
			options: true,
			imageUrl: true,
			unitPrice: true,
			quantity: true,
			lineTotal: true,
		},
	},
} satisfies Prisma.OrderSelect

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>

/** An order as its buyer sees it. */
export const toOrderView = (order: OrderRow) => ({
	id: order.id,
	number: orderLabel(order.number),
	status: order.status,
	email: order.email,
	phone: order.phone,
	shippingAddress: order.shippingAddress,
	billingAddress: order.billingAddress,
	shippingMethod: order.shippingMethod,
	currency: order.currency,
	items: order.items.map((item) => ({
		...item,
		unitPrice: item.unitPrice.toFixed(2),
		lineTotal: item.lineTotal.toFixed(2),
	})),
	totals: {
		subtotal: order.subtotal.toFixed(2),
		shipping: order.shippingTotal.toFixed(2),
		vat: { rate: order.vatRate.toNumber(), amount: order.vatTotal.toFixed(2) },
		total: order.total.toFixed(2),
	},
	paymentProvider: order.paymentProvider,
	reservedUntil: order.reservedUntil,
	paidAt: order.paidAt,
	createdAt: order.createdAt,
})

export type OrderView = ReturnType<typeof toOrderView>

export const findOrderView = async (id: string): Promise<OrderView> => {
	const order = await prisma.order.findUniqueOrThrow({ where: { id }, select: orderSelect })
	return toOrderView(order)
}

/**
 * Cancels an unpaid order and puts back the stock it took. Only acts on
 * PENDING_PAYMENT, so a payment that lands at the same moment wins and the
 * stock is never returned twice. Returns whether it cancelled.
 */
export const releaseOrder = async (
	tx: Prisma.TransactionClient,
	orderId: string,
	note: string,
	actorId?: string
): Promise<boolean> => {
	const cancelled = await tx.order.updateMany({
		where: { id: orderId, status: "PENDING_PAYMENT" },
		data: { status: "CANCELLED", cancelledAt: new Date(), reservedUntil: null },
	})
	if (cancelled.count === 0) return false

	const taken = await tx.orderItem.findMany({
		where: { orderId, stockTaken: true, variantId: { not: null } },
		select: { variantId: true, quantity: true },
	})
	for (const item of taken) {
		await tx.productVariant.update({ where: { id: item.variantId! }, data: { stock: { increment: item.quantity } } })
	}
	await tx.orderStatusHistory.create({ data: { orderId, status: "CANCELLED", note, actorId } })
	return true
}

/** Cancels every unpaid order whose reservation ran out. Returns how many. */
const expireReservations = async (now = new Date()): Promise<number> => {
	const expired = await prisma.order.findMany({
		where: { status: "PENDING_PAYMENT", reservedUntil: { lt: now } },
		select: { id: true },
		take: 200,
	})
	let count = 0
	for (const { id } of expired) {
		if (await prisma.$transaction((tx) => releaseOrder(tx, id, "Payment not completed in time"))) count++
	}
	return count
}

/**
 * An order for the person asking: its customer when signed in, or whoever
 * holds the order cookie from placing it. Anyone else gets a 404, never a 403,
 * so order ids cannot be probed.
 */
const getForBuyer = async (id: string, who: { userId?: string; token?: string }): Promise<OrderView> => {
	const order = await prisma.order.findUnique({
		where: { id },
		select: { ...orderSelect, userId: true, accessTokenHash: true },
	})
	const allowed =
		!!order && ((!!who.userId && order.userId === who.userId) || (!!who.token && order.accessTokenHash === hashToken(who.token)))
	if (!allowed) throw new ApiError(httpStatus.NOT_FOUND, "Order not found")
	return toOrderView(order)
}

/** A customer's orders, newest first, as list rows (the first few item photos, not every line). */
const listForCustomer = async (userId: string, pagination: PaginationInput) => {
	const where = { userId }
	const [rows, total] = await Promise.all([
		prisma.order.findMany({
			where,
			orderBy: { createdAt: "desc" },
			...toSkipTake(pagination),
			select: {
				id: true,
				number: true,
				status: true,
				total: true,
				currency: true,
				createdAt: true,
				items: { orderBy: { position: "asc" }, select: { productName: true, quantity: true, imageUrl: true } },
			},
		}),
		prisma.order.count({ where }),
	])
	const orders = rows.map((order) => ({
		id: order.id,
		number: orderLabel(order.number),
		status: order.status,
		total: order.total.toFixed(2),
		currency: order.currency,
		createdAt: order.createdAt,
		itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
		items: order.items.slice(0, 4),
	}))
	return { orders, meta: toMeta(pagination, total) }
}

export const OrderService = { getForBuyer, expireReservations, listForCustomer }
