import { fromCents } from "../../../domain/cart/cartRules"
import { toCents } from "../../../domain/catalog/variantRules"
import {
	changePercent,
	dailySales,
	dayKey,
	fulfilmentOf,
	SALE_STATUSES,
	shiftDay,
	TO_FULFIL_STATUSES,
	type DayTotal,
} from "../../../domain/order/orderRules"
import { prisma } from "../../../shared/prisma"
import { OrderAdminService } from "../order/orderAdmin.service"
import { SettingService } from "../setting/setting.service"

const DAY_MS = 86_400_000

const sumRevenue = (days: DayTotal[]) => days.reduce((sum, day) => sum + day.revenueCents, 0)
const sumOrders = (days: DayTotal[]) => days.reduce((sum, day) => sum + day.orders, 0)
const average = (revenueCents: number, orders: number) => (orders ? Math.round(revenueCents / orders) : 0)

const metric = (current: number, previous: number) => ({ current, previous, change: changePercent(current, previous) })
const moneyMetric = (current: number, previous: number) => ({
	current: fromCents(current),
	previous: fromCents(previous),
	change: changePercent(current, previous),
})

/** Tracked, sellable variants at or below the low-stock level, lowest first. */
const lowStock = async (threshold: number) => {
	const variants = await prisma.productVariant.findMany({
		where: { manageStock: true, isActive: true, stock: { lte: threshold }, product: { status: "PUBLISHED" } },
		orderBy: [{ stock: "asc" }, { updatedAt: "desc" }],
		take: 8,
		select: {
			id: true,
			sku: true,
			stock: true,
			allowBackorder: true,
			product: { select: { id: true, name: true } },
			attributeValues: { select: { attributeValue: { select: { label: true, attribute: { select: { sortOrder: true } } } } } },
		},
	})
	return variants.map((variant) => ({
		variantId: variant.id,
		productId: variant.product.id,
		productName: variant.product.name,
		options: variant.attributeValues
			.map(({ attributeValue: v }) => v)
			.sort((a, b) => a.attribute.sortOrder - b.attribute.sortOrder)
			.map((v) => v.label)
			.join(" / "),
		sku: variant.sku,
		stock: variant.stock,
		allowBackorder: variant.allowBackorder,
	}))
}

/** Best sellers by units in the given orders. */
const topProducts = async (orderIds: string[]) => {
	if (orderIds.length === 0) return []
	const groups = await prisma.orderItem.groupBy({
		by: ["productId", "productName"],
		where: { orderId: { in: orderIds } },
		_sum: { quantity: true, lineTotal: true },
		orderBy: { _sum: { quantity: "desc" } },
		take: 5,
	})
	return groups.map((group) => ({
		productId: group.productId,
		productName: group.productName,
		units: group._sum.quantity ?? 0,
		revenue: (group._sum.lineTotal ?? 0).toFixed(2),
	}))
}

/**
 * The dashboard home: sales of the last `days` days (by payment date, in the
 * store's time zone) against the days before them, the daily series, the work
 * waiting (orders to ship, unpaid orders), recent orders, low stock and best sellers.
 */
const summary = async (days: number, now = new Date()) => {
	const lastDay = dayKey(now)
	const firstDay = shiftDay(lastDay, -(days - 1))
	const previousLastDay = shiftDay(firstDay, -1)
	// A day of margin either side of the time zone; dailySales keeps only the days asked for.
	const since = new Date(now.getTime() - (2 * days + 1) * DAY_MS)

	const [sales, customers, placed, toFulfil, awaitingPayment, recent, inventory] = await Promise.all([
		prisma.order.findMany({
			where: { status: { in: SALE_STATUSES }, paidAt: { gte: since } },
			select: { id: true, paidAt: true, total: true },
		}),
		prisma.user.findMany({
			where: { role: "CUSTOMER", deletedAt: null, createdAt: { gte: since } },
			select: { createdAt: true },
		}),
		prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true } }),
		prisma.order.count({ where: { status: { in: TO_FULFIL_STATUSES } } }),
		prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
		OrderAdminService.list({ page: 1, limit: 8, sortOrder: "desc" }),
		SettingService.get("inventory") as Promise<{ lowStockThreshold: number }>,
	])

	const salePoints = sales.map((sale) => ({ at: sale.paidAt!, totalCents: toCents(sale.total.toFixed(2)) }))
	const signups = customers.map((customer) => ({ at: customer.createdAt, totalCents: 0 }))

	const current = dailySales(salePoints, days, lastDay)
	const previous = dailySales(salePoints, days, previousLastDay)
	const revenue = sumRevenue(current)
	const previousRevenue = sumRevenue(previous)
	const orders = sumOrders(current)
	const previousOrders = sumOrders(previous)

	const periodSales = sales.filter((sale) => dayKey(sale.paidAt!) >= firstDay).map((sale) => sale.id)
	const [lowStockItems, bestSellers] = await Promise.all([lowStock(inventory.lowStockThreshold), topProducts(periodSales)])

	return {
		period: { days, from: firstDay, to: lastDay },
		revenue: moneyMetric(revenue, previousRevenue),
		orders: metric(orders, previousOrders),
		averageOrderValue: moneyMetric(average(revenue, orders), average(previousRevenue, previousOrders)),
		newCustomers: metric(sumOrders(dailySales(signups, days, lastDay)), sumOrders(dailySales(signups, days, previousLastDay))),
		series: current.map((day) => ({ date: day.date, revenue: fromCents(day.revenueCents), orders: day.orders })),
		fulfilment: fulfilmentOf(placed.filter((o) => dayKey(o.createdAt) >= firstDay).map((o) => o.status)),
		toFulfil,
		awaitingPayment,
		recentOrders: recent.orders,
		lowStock: { threshold: inventory.lowStockThreshold, items: lowStockItems },
		topProducts: bestSellers,
	}
}

export const DashboardService = { summary }
