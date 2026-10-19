import crypto from "crypto"
import { Router, type RequestHandler } from "express"
import { env } from "../../../config"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import sendResponse from "../../../shared/sendResponse"
import ApiError from "../../errors/ApiError"
import { OrderService } from "../order/order.service"

// Guest carts untouched this long are deleted (the cart cookie lives as long).
const GUEST_CART_DAYS = 60

const sameSecret = (given: string, expected: string): boolean => {
	const a = Buffer.from(given)
	const b = Buffer.from(expected)
	return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Vercel Cron calls with "Authorization: Bearer <CRON_SECRET>". Without a secret configured the route does not exist. */
const cronAuth: RequestHandler = (req, _res, next) => {
	if (!env.CRON_SECRET) return next(new ApiError(httpStatus.NOT_FOUND, "Not found"))
	const header = req.headers.authorization ?? ""
	if (!header.startsWith("Bearer ") || !sameSecret(header.slice(7), env.CRON_SECRET)) {
		return next(new ApiError(httpStatus.UNAUTHORIZED, "Authentication required"))
	}
	next()
}

const run: RequestHandler = catchAsync(async (_req, res) => {
	const expiredOrders = await OrderService.expireReservations()
	const staleCarts = await prisma.cart.deleteMany({
		where: { token: { not: null }, updatedAt: { lt: new Date(Date.now() - GUEST_CART_DAYS * 86_400_000) } },
	})
	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Cron run",
		data: { expiredOrders, staleCarts: staleCarts.count },
	})
})

const router = Router()

router.get("/run", cronAuth, run)

export const CronRoutes = router
