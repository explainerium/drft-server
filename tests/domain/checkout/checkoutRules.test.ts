import { describe, expect, it } from "vitest"
import { includedVat, orderLabel, orderTotals, shippingCents } from "../../../src/domain/checkout/checkoutRules"

describe("includedVat", () => {
	it("takes the VAT out of a gross amount", () => {
		// The Figma checkout: €2,020.00 at 21% holds €350.58 VAT.
		expect(includedVat(202000, 21)).toBe(35058)
		expect(includedVat(11900, 19)).toBe(1900)
	})

	it("is zero at a zero rate or amount", () => {
		expect(includedVat(10000, 0)).toBe(0)
		expect(includedVat(0, 21)).toBe(0)
	})
})

describe("shippingCents", () => {
	const express = { price: "9.90", freeOverThreshold: true }
	const air = { price: "24.00", freeOverThreshold: false }

	it("is free from the threshold for rates in the offer", () => {
		expect(shippingCents(express, 15000, "150.00")).toBe(0)
		expect(shippingCents(express, 14999, "150.00")).toBe(990)
	})

	it("always charges rates outside the offer", () => {
		expect(shippingCents(air, 202000, "150.00")).toBe(2400)
	})

	it("charges when the offer is off or the cart is empty", () => {
		expect(shippingCents(express, 202000, null)).toBe(990)
		expect(shippingCents(express, 0, "0.00")).toBe(990)
	})
})

describe("orderTotals", () => {
	it("adds shipping and takes VAT from the whole total", () => {
		expect(orderTotals(202000, 2400, 21)).toEqual({
			subtotal: "2020.00",
			shipping: "24.00",
			vat: { rate: 21, amount: fromGross(204400, 21) },
			total: "2044.00",
		})
	})

	it("uses the destination rate, not the total", () => {
		const de = orderTotals(11900, 0, 19)
		const nl = orderTotals(11900, 0, 21)
		expect(de.total).toBe(nl.total)
		expect(de.vat.amount).toBe("19.00")
		expect(nl.vat.amount).toBe("20.65")
	})
})

describe("orderLabel", () => {
	it("prefixes the number", () => {
		expect(orderLabel(10001)).toBe("DRFT-10001")
	})
})

function fromGross(cents: number, rate: number): string {
	return (Math.round(cents - cents / (1 + rate / 100)) / 100).toFixed(2)
}
