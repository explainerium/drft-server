import type { PaymentProvider, Prisma } from "@prisma/client"
import { env } from "../../../config"
import { summarizeCart } from "../../../domain/cart/cartRules"
import { toCents } from "../../../domain/catalog/variantRules"
import { orderTotals, RESERVATION_MINUTES, shippingCents } from "../../../domain/checkout/checkoutRules"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import { currentLocale } from "../../../shared/requestContext"
import { generateToken, hashToken } from "../../../shared/token"
import ApiError from "../../errors/ApiError"
import { AccountService } from "../account/account.service"
import { cartPricing, CartService, type CartContext, type CartCookie, type CartLine } from "../cart/cart.service"
import { findOrderView, releaseOrder } from "../order/order.service"
import { enabledPaymentProviders } from "../payment/payment.providers"
import type { PlaceOrderInput } from "./checkout.validation"

// ── Shipping and tax lookups ─────────────────────────────────────────────────

/** Countries with an active zone that has at least one active rate. */
const shippableCountries = async (): Promise<string[]> => {
	const zones = await prisma.shippingZone.findMany({
		where: { isActive: true, rates: { some: { isActive: true } } },
		select: { countries: true },
	})
	return [...new Set(zones.flatMap((z) => z.countries))].sort()
}

const ratesFor = async (countryCode: string) => {
	const zone = await prisma.shippingZone.findFirst({
		where: { isActive: true, countries: { has: countryCode } },
		orderBy: { sortOrder: "asc" },
		select: {
			rates: {
				where: { isActive: true },
				orderBy: { sortOrder: "asc" },
				select: { id: true, name: true, description: true, price: true, freeOverThreshold: true },
			},
		},
	})
	return (zone?.rates ?? []).map((r) => ({ ...r, price: r.price.toFixed(2) }))
}

const vatRateFor = async (countryCode: string | null, fallback: number): Promise<number> => {
	if (!countryCode) return fallback
	const row = await prisma.taxRate.findUnique({ where: { countryCode }, select: { rate: true } })
	return row ? row.rate.toNumber() : fallback
}

// ── Quote ────────────────────────────────────────────────────────────────────

/** Lines that stop the order: no longer sold, or more in the cart than can be bought. */
const blockingLines = (items: CartLine[]) => items.filter((i) => !i.isAvailable || i.quantity > i.maxQuantity)

const buildQuote = async (items: CartLine[], countryCode: string | null, requestedRateId: string | null) => {
	const [countries, pricing] = await Promise.all([shippableCountries(), cartPricing()])
	const country = countryCode && countries.includes(countryCode) ? countryCode : null
	const summary = summarizeCart(items, pricing)
	const subtotal = toCents(summary.subtotal)

	const rates = (country ? await ratesFor(country) : []).map((r) => {
		const cents = shippingCents(r, subtotal, pricing.freeShippingThreshold)
		return {
			id: r.id,
			name: r.name,
			description: r.description,
			price: (cents / 100).toFixed(2),
			regularPrice: r.price,
			isFree: cents === 0,
		}
	})
	const selected = rates.find((r) => r.id === requestedRateId) ?? rates[0] ?? null
	const vatRate = await vatRateFor(country, pricing.vatRate)
	const totals = orderTotals(subtotal, selected ? toCents(selected.price) : 0, vatRate)

	return {
		countries,
		country,
		items,
		blocked: items.length === 0 || blockingLines(items).length > 0,
		itemCount: summary.itemCount,
		freeShipping: summary.freeShipping,
		rates,
		shippingRateId: selected?.id ?? null,
		// Shipping is null until a country with rates is chosen; the total then leaves it out.
		totals: { ...totals, shipping: selected ? totals.shipping : null },
		paymentProviders: enabledPaymentProviders(),
	}
}

export type CheckoutQuote = Awaited<ReturnType<typeof buildQuote>>

const quote = async (ctx: CartContext, query: { country?: string; shippingRateId?: string }) => {
	const { items, cookie } = await CartService.lines(ctx)
	return { quote: await buildQuote(items, query.country ?? null, query.shippingRateId ?? null), cookie }
}

// ── Placing the order ────────────────────────────────────────────────────────

const variantLabel = (line: CartLine) => `${line.product.name}${line.options.length ? ` (${line.options.map((o) => o.value).join(", ")})` : ""}`

const choosePaymentProvider = (requested: PaymentProvider | null | undefined): PaymentProvider | null => {
	const enabled = enabledPaymentProviders()
	if (enabled.length === 0) {
		// Development can walk through checkout before any keys exist; a live store cannot take unpaid orders.
		if (env.NODE_ENV === "production") throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, "Payments are not available right now")
		return null
	}
	if (!requested || !enabled.includes(requested)) throw new ApiError(httpStatus.BAD_REQUEST, "Choose a payment method")
	return requested
}

/**
 * Takes stock for every tracked line. Without backorders the decrement only
 * happens while enough is left, so two buyers can never take the last unit.
 */
const takeStock = async (tx: Prisma.TransactionClient, items: CartLine[]) => {
	const variants = await tx.productVariant.findMany({
		where: { id: { in: items.map((i) => i.variantId) } },
		select: { id: true, manageStock: true, allowBackorder: true },
	})
	const byId = new Map(variants.map((v) => [v.id, v]))
	const taken = new Set<string>()

	for (const line of items) {
		const variant = byId.get(line.variantId)
		if (!variant?.manageStock) continue
		const updated = await tx.productVariant.updateMany({
			where: { id: variant.id, ...(variant.allowBackorder ? {} : { stock: { gte: line.quantity } }) },
			data: { stock: { decrement: line.quantity } },
		})
		if (updated.count === 0) {
			throw new ApiError(httpStatus.CONFLICT, `${variantLabel(line)} just sold out. Please update your cart.`)
		}
		taken.add(line.id)
	}
	return taken
}

/** Adds the shipping address to the customer's address book unless the same address is already there. */
const saveToAddressBook = async (userId: string, address: PlaceOrderInput["shippingAddress"]) => {
	const same = await prisma.address.findFirst({
		where: {
			userId,
			firstName: address.firstName,
			lastName: address.lastName,
			street1: address.street1,
			postcode: address.postcode,
			countryCode: address.countryCode,
		},
		select: { id: true },
	})
	if (!same) await AccountService.createAddress(userId, address)
}

const placeOrder = async (ctx: CartContext, input: PlaceOrderInput) => {
	const { cartId, items, cookie } = await CartService.lines(ctx)
	if (!cartId || items.length === 0) throw new ApiError(httpStatus.CONFLICT, "Your cart is empty")
	if (blockingLines(items).length > 0) {
		throw new ApiError(httpStatus.CONFLICT, "Some items in your cart are no longer available. Please review your cart.")
	}

	const country = input.shippingAddress.countryCode
	const q = await buildQuote(items, country, input.shippingRateId)
	if (q.country !== country) throw new ApiError(httpStatus.BAD_REQUEST, "We do not ship to this country yet")
	const rate = q.rates.find((r) => r.id === input.shippingRateId)
	if (!rate) throw new ApiError(httpStatus.BAD_REQUEST, "Choose a shipping method")
	const paymentProvider = choosePaymentProvider(input.paymentProvider)

	const { saveAddress, billingAddress, shippingAddress, ...contact } = input
	const token = generateToken()

	const orderId = await prisma.$transaction(async (tx) => {
		// Going through checkout again replaces the earlier unpaid order from this cart.
		const earlier = await tx.order.findMany({ where: { cartId, status: "PENDING_PAYMENT" }, select: { id: true } })
		for (const { id } of earlier) await releaseOrder(tx, id, "Replaced by a new checkout")

		const taken = await takeStock(tx, items)
		const order = await tx.order.create({
			data: {
				userId: ctx.userId ?? null,
				cartId,
				accessTokenHash: hashToken(token),
				locale: currentLocale(),
				email: contact.email,
				phone: shippingAddress.phone,
				marketingOptIn: contact.marketingOptIn,
				shippingAddress,
				billingAddress: billingAddress ?? shippingAddress,
				shippingMethod: rate.name,
				subtotal: q.totals.subtotal,
				shippingTotal: rate.price,
				vatRate: q.totals.vat.rate,
				vatTotal: q.totals.vat.amount,
				total: q.totals.total,
				paymentProvider,
				reservedUntil: new Date(Date.now() + RESERVATION_MINUTES * 60_000),
				items: {
					create: items.map((line, position) => ({
						position,
						variantId: line.variantId,
						productId: line.product.id,
						productName: line.product.name,
						productSlug: line.product.slug,
						typeLabel: line.product.typeLabel,
						sku: line.sku,
						options: line.options,
						imageUrl: line.image?.sizes.thumb?.url ?? line.image?.url ?? null,
						unitPrice: line.unitPrice,
						quantity: line.quantity,
						lineTotal: line.lineTotal,
						stockTaken: taken.has(line.id),
					})),
				},
				history: { create: { status: "PENDING_PAYMENT", note: "Order placed" } },
			},
			select: { id: true },
		})

		return order.id
	})

	if (saveAddress && ctx.userId) await saveToAddressBook(ctx.userId, shippingAddress)

	return { order: await findOrderView(orderId), token, cookie: cookie as CartCookie }
}

export const CheckoutService = { quote, placeOrder, shippableCountries }
