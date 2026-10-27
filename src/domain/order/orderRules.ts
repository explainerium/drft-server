/**
 * Order rules for staff: which status changes they may make by hand, which
 * orders count as sales, and the daily sales series on the dashboard.
 * Kept free of Prisma so it is unit tested directly.
 */

export type OrderStatusName =
	| "PENDING_PAYMENT"
	| "PAID"
	| "PROCESSING"
	| "SHIPPED"
	| "DELIVERED"
	| "CANCELLED"
	| "REFUNDED"
	| "PARTIALLY_REFUNDED"

/**
 * Forward only. Payment and refunds are set by the payment providers, never by
 * hand, and a paid order is not cancelled here because that needs a refund.
 */
const STAFF_TRANSITIONS: Record<OrderStatusName, OrderStatusName[]> = {
	PENDING_PAYMENT: ["CANCELLED"],
	PAID: ["PROCESSING", "SHIPPED"],
	PROCESSING: ["SHIPPED"],
	SHIPPED: ["DELIVERED"],
	DELIVERED: [],
	CANCELLED: [],
	REFUNDED: [],
	PARTIALLY_REFUNDED: ["PROCESSING", "SHIPPED"],
}

export const staffTransitions = (from: OrderStatusName): OrderStatusName[] => STAFF_TRANSITIONS[from]

export const canStaffMove = (from: OrderStatusName, to: OrderStatusName): boolean => STAFF_TRANSITIONS[from].includes(to)

/** Paid at some point and not fully refunded: these count as revenue. */
export const SALE_STATUSES: OrderStatusName[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "PARTIALLY_REFUNDED"]

/** Paid and waiting to be shipped. */
export const TO_FULFIL_STATUSES: OrderStatusName[] = ["PAID", "PROCESSING", "PARTIALLY_REFUNDED"]

/** Days are counted in the shop's home time zone, not the server's. */
export const STORE_TIME_ZONE = "Europe/Amsterdam"

/** "2026-10-19" for an instant, in the given time zone. */
export const dayKey = (date: Date, timeZone = STORE_TIME_ZONE): string =>
	new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)

export interface SalePoint {
	at: Date
	totalCents: number
}

export interface DayTotal {
	date: string
	revenueCents: number
	orders: number
}

/** The calendar date `days` after (or before, when negative) a "YYYY-MM-DD" date. */
export const shiftDay = (day: string, days: number): string =>
	new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)

/** The instant a "YYYY-MM-DD" day starts in the given time zone (DST-aware). */
export const dayStart = (day: string, timeZone = STORE_TIME_ZONE): Date => {
	const midnightUtc = new Date(`${day}T00:00:00Z`).getTime()
	// How far the zone's wall clock is ahead of UTC at an instant.
	const offsetAt = (instant: number) => {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}).formatToParts(new Date(instant))
		const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
		return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant
	}
	// Twice, so a day that starts on the other side of a DST switch is right too.
	const guess = midnightUtc - offsetAt(midnightUtc)
	return new Date(midnightUtc - offsetAt(guess))
}

/**
 * One entry per day for the `days` days ending on `lastDay` (oldest first),
 * empty days included. Sales outside those days are ignored. Calendar steps,
 * so a 23- or 25-hour DST day never skips or repeats a date.
 */
export const dailySales = (sales: SalePoint[], days: number, lastDay: string, timeZone = STORE_TIME_ZONE): DayTotal[] => {
	const series = new Map<string, DayTotal>()
	for (let i = days - 1; i >= 0; i--) {
		const date = shiftDay(lastDay, -i)
		series.set(date, { date, revenueCents: 0, orders: 0 })
	}
	for (const sale of sales) {
		const day = series.get(dayKey(sale.at, timeZone))
		if (!day) continue
		day.revenueCents += sale.totalCents
		day.orders += 1
	}
	return [...series.values()]
}

export interface Fulfilment {
	/** Orders placed in the period, cancelled ones included. */
	total: number
	delivered: number
	shipped: number
	toShip: number
	awaitingPayment: number
	cancelled: number
	/** Share of paid orders that have left the warehouse (shipped or delivered), 0–100; null without paid orders. */
	shippedPercent: number | null
}

/** Where the orders placed in a period stand now. */
export const fulfilmentOf = (statuses: OrderStatusName[]): Fulfilment => {
	const count = (...wanted: OrderStatusName[]) => statuses.filter((s) => wanted.includes(s)).length
	const delivered = count("DELIVERED")
	const shipped = count("SHIPPED")
	const toShip = count(...TO_FULFIL_STATUSES)
	const paid = delivered + shipped + toShip
	return {
		total: statuses.length,
		delivered,
		shipped,
		toShip,
		awaitingPayment: count("PENDING_PAYMENT"),
		cancelled: count("CANCELLED", "REFUNDED"),
		shippedPercent: paid ? Math.round(((delivered + shipped) / paid) * 100) : null,
	}
}

/** Percentage change from the previous period, or null when there is nothing to compare with. */
export const changePercent = (current: number, previous: number): number | null =>
	previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10
