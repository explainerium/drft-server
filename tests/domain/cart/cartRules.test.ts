import { describe, expect, it } from "vitest"
import { MAX_LINE_QUANTITY, maxQuantity, mergeLines, summarizeCart } from "../../../src/domain/cart/cartRules"

describe("maxQuantity", () => {
	it("caps untracked and backorderable stock at the line limit", () => {
		expect(maxQuantity({ manageStock: false, stock: 0, allowBackorder: false })).toBe(MAX_LINE_QUANTITY)
		expect(maxQuantity({ manageStock: true, stock: 0, allowBackorder: true })).toBe(MAX_LINE_QUANTITY)
	})

	it("follows tracked stock, never below zero", () => {
		expect(maxQuantity({ manageStock: true, stock: 3, allowBackorder: false })).toBe(3)
		expect(maxQuantity({ manageStock: true, stock: 50, allowBackorder: false })).toBe(MAX_LINE_QUANTITY)
		expect(maxQuantity({ manageStock: true, stock: -2, allowBackorder: false })).toBe(0)
	})
})

describe("summarizeCart", () => {
	const pricing = { freeShippingThreshold: "150.00", vatRate: 21 }
	const line = (unitPrice: string, quantity: number, extra: Partial<{ isAvailable: boolean; maxQuantity: number }> = {}) => ({
		unitPrice,
		quantity,
		isAvailable: true,
		maxQuantity: 10,
		...extra,
	})

	it("adds up lines in cents and estimates the included VAT", () => {
		const summary = summarizeCart([line("1480.00", 1), line("540.00", 1)], pricing)
		expect(summary.itemCount).toBe(2)
		expect(summary.subtotal).toBe("2020.00")
		expect(summary.vat).toEqual({ rate: 21, amount: "350.58" })
		expect(summary.freeShipping).toEqual({ threshold: "150.00", remaining: "0.00", qualified: true })
	})

	it("reports what is left to free shipping", () => {
		const summary = summarizeCart([line("65.00", 2)], pricing)
		expect(summary.freeShipping).toEqual({ threshold: "150.00", remaining: "20.00", qualified: false })
	})

	it("skips unavailable lines and counts no more than the stock allows", () => {
		const summary = summarizeCart(
			[line("10.00", 5, { maxQuantity: 2 }), line("99.00", 1, { isAvailable: false })],
			pricing
		)
		expect(summary.itemCount).toBe(2)
		expect(summary.subtotal).toBe("20.00")
	})

	it("an empty cart never qualifies, and a null threshold turns the offer off", () => {
		expect(summarizeCart([], pricing).freeShipping.qualified).toBe(false)
		expect(summarizeCart([line("500.00", 1)], { freeShippingThreshold: null, vatRate: 21 }).freeShipping).toEqual({
			threshold: null,
			remaining: null,
			qualified: false,
		})
	})
})

describe("mergeLines", () => {
	it("adds quantities of the same variant up to the line limit and keeps the rest", () => {
		const merged = mergeLines(
			[
				{ variantId: "a", quantity: 2 },
				{ variantId: "b", quantity: 9 },
			],
			[
				{ variantId: "b", quantity: 5 },
				{ variantId: "c", quantity: 1 },
			]
		)
		expect(merged).toEqual([
			{ variantId: "a", quantity: 2 },
			{ variantId: "b", quantity: MAX_LINE_QUANTITY },
			{ variantId: "c", quantity: 1 },
		])
	})
})
