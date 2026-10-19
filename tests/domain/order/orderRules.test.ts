import { describe, expect, it } from "vitest"
import {
	canStaffMove,
	changePercent,
	dailySales,
	dayKey,
	shiftDay,
	staffTransitions,
} from "../../../src/domain/order/orderRules"

describe("staff status changes", () => {
	it("moves a paid order forward to shipping", () => {
		expect(staffTransitions("PAID")).toEqual(["PROCESSING", "SHIPPED"])
		expect(canStaffMove("PROCESSING", "SHIPPED")).toBe(true)
		expect(canStaffMove("SHIPPED", "DELIVERED")).toBe(true)
	})

	it("only cancels an unpaid order", () => {
		expect(canStaffMove("PENDING_PAYMENT", "CANCELLED")).toBe(true)
		expect(canStaffMove("PAID", "CANCELLED")).toBe(false)
	})

	it("never marks payment or refunds by hand, and never goes back", () => {
		expect(canStaffMove("PENDING_PAYMENT", "PAID")).toBe(false)
		expect(canStaffMove("DELIVERED", "REFUNDED")).toBe(false)
		expect(canStaffMove("SHIPPED", "PROCESSING")).toBe(false)
		expect(staffTransitions("CANCELLED")).toEqual([])
	})
})

describe("days in the store time zone", () => {
	it("uses the Amsterdam date, not UTC", () => {
		// 23:30 UTC on 19 Oct is 01:30 on 20 Oct in Amsterdam (CEST).
		expect(dayKey(new Date("2026-10-19T23:30:00Z"))).toBe("2026-10-20")
		expect(dayKey(new Date("2026-10-19T21:30:00Z"))).toBe("2026-10-19")
	})

	it("shifts calendar dates across months and DST", () => {
		expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31")
		expect(shiftDay("2026-03-29", 1)).toBe("2026-03-30")
	})
})

describe("dailySales", () => {
	it("returns every day, oldest first, with the sales of each", () => {
		const series = dailySales(
			[
				{ at: new Date("2026-10-19T10:00:00Z"), totalCents: 2000 },
				{ at: new Date("2026-10-19T12:00:00Z"), totalCents: 500 },
				{ at: new Date("2026-10-17T10:00:00Z"), totalCents: 1000 },
				{ at: new Date("2026-10-01T10:00:00Z"), totalCents: 9999 },
			],
			3,
			"2026-10-19"
		)
		expect(series).toEqual([
			{ date: "2026-10-17", revenueCents: 1000, orders: 1 },
			{ date: "2026-10-18", revenueCents: 0, orders: 0 },
			{ date: "2026-10-19", revenueCents: 2500, orders: 2 },
		])
	})

	it("has no gap or repeat over the October DST change", () => {
		const dates = dailySales([], 4, "2026-10-26").map((d) => d.date)
		expect(dates).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"])
	})
})

describe("changePercent", () => {
	it("compares with the previous period", () => {
		expect(changePercent(150, 100)).toBe(50)
		expect(changePercent(50, 200)).toBe(-75)
		expect(changePercent(10, 0)).toBeNull()
	})
})
