import { toCents } from "../catalog/variantRules"

/**
 * Cart rules: how many of a variant fit in the cart, and the cart summary.
 * Money comes in as "12.00" strings and is summed in cents.
 */

/** Per line, whatever the stock: a kite shop does not sell 40 kites in one order. */
export const MAX_LINE_QUANTITY = 10

export interface StockRule {
	manageStock: boolean
	stock: number
	allowBackorder: boolean
}

/** The most of one variant a cart may hold: the line cap, or less when tracked stock runs out. */
export const maxQuantity = (v: StockRule): number =>
	!v.manageStock || v.allowBackorder ? MAX_LINE_QUANTITY : Math.max(0, Math.min(v.stock, MAX_LINE_QUANTITY))

export const fromCents = (cents: number): string => (cents / 100).toFixed(2)

export interface SummaryLine {
	unitPrice: string
	quantity: number
	/** Lines that cannot be bought right now (unpublished, inactive, sold out) are left out of the totals. */
	isAvailable: boolean
	maxQuantity: number
}

export interface CartPricing {
	freeShippingThreshold: string | null
	vatRate: number
}

export interface CartSummary {
	itemCount: number
	subtotal: string
	freeShipping: { threshold: string | null; remaining: string | null; qualified: boolean }
	/** VAT included in the subtotal at the estimate rate; the real figure needs the destination country. */
	vat: { rate: number; amount: string }
}

export const summarizeCart = (lines: SummaryLine[], pricing: CartPricing): CartSummary => {
	let itemCount = 0
	let subtotal = 0
	for (const line of lines) {
		if (!line.isAvailable) continue
		const quantity = Math.min(line.quantity, line.maxQuantity)
		itemCount += quantity
		subtotal += toCents(line.unitPrice) * quantity
	}

	const threshold = pricing.freeShippingThreshold === null ? null : toCents(pricing.freeShippingThreshold)
	const vat = Math.round(subtotal - subtotal / (1 + pricing.vatRate / 100))

	return {
		itemCount,
		subtotal: fromCents(subtotal),
		freeShipping: {
			threshold: pricing.freeShippingThreshold,
			remaining: threshold === null ? null : fromCents(Math.max(0, threshold - subtotal)),
			qualified: threshold !== null && subtotal > 0 && subtotal >= threshold,
		},
		vat: { rate: pricing.vatRate, amount: fromCents(vat) },
	}
}

/** Guest cart lines merged into the customer's cart: same variant adds up, capped at the line limit. */
export const mergeLines = (
	target: { variantId: string; quantity: number }[],
	incoming: { variantId: string; quantity: number }[]
): { variantId: string; quantity: number }[] => {
	const merged = new Map(target.map((line) => [line.variantId, line.quantity]))
	for (const line of incoming) {
		merged.set(line.variantId, Math.min((merged.get(line.variantId) ?? 0) + line.quantity, MAX_LINE_QUANTITY))
	}
	return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }))
}
