import { fromCents } from "../cart/cartRules"
import { toCents } from "../catalog/variantRules"

/**
 * Checkout rules: shipping price, VAT inside a gross total, order totals.
 * Prices include VAT, so the destination country changes how much of the
 * total is VAT, never the total. Money is summed in cents.
 */

/** How long an unpaid order holds its stock before the cron job cancels it. */
export const RESERVATION_MINUTES = 30

/** VAT contained in a gross amount: gross − gross / (1 + rate). */
export const includedVat = (grossCents: number, ratePercent: number): number =>
	Math.round(grossCents - grossCents / (1 + ratePercent / 100))

export interface RateRule {
	price: string
	freeOverThreshold: boolean
}

/** A rate's price for this cart: free when it takes part in the free shipping offer and the cart qualifies. */
export const shippingCents = (rate: RateRule, subtotalCents: number, threshold: string | null): number =>
	rate.freeOverThreshold && threshold !== null && subtotalCents > 0 && subtotalCents >= toCents(threshold)
		? 0
		: toCents(rate.price)

export interface OrderTotals {
	subtotal: string
	shipping: string
	vat: { rate: number; amount: string }
	total: string
}

export const orderTotals = (subtotalCents: number, shipping: number, vatRate: number): OrderTotals => {
	const total = subtotalCents + shipping
	return {
		subtotal: fromCents(subtotalCents),
		shipping: fromCents(shipping),
		vat: { rate: vatRate, amount: fromCents(includedVat(total, vatRate)) },
		total: fromCents(total),
	}
}

/** "DRFT-10001", as customers see it. */
export const orderLabel = (number: number): string => `DRFT-${number}`

/** ISO 3166-1 alpha-2, upper case. */
export const COUNTRY_CODE = /^[A-Z]{2}$/
