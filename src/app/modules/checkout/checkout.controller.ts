import type { Request, RequestHandler, Response } from "express"
import catchAsync from "../../../shared/catchAsync"
import { clearCartCookie, COOKIE, setCartCookie, setOrderCookie } from "../../../shared/cookies"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import type { CartContext, CartCookie } from "../cart/cart.service"
import { CheckoutService } from "./checkout.service"

const contextOf = (req: Request): CartContext => ({
	userId: req.user?.sub,
	token: req.cookies?.[COOKIE.CART] as string | undefined,
})

const applyCartCookie = (res: Response, cookie: CartCookie): void => {
	if (!cookie) return
	if ("set" in cookie) setCartCookie(res, cookie.set)
	else clearCartCookie(res)
}

const quote: RequestHandler = catchAsync(async (req, res) => {
	const result = await CheckoutService.quote(contextOf(req), req.query as { country?: string; shippingRateId?: string })
	applyCartCookie(res, result.cookie)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Checkout", data: result.quote })
})

const placeOrder: RequestHandler = catchAsync(async (req, res) => {
	const result = await CheckoutService.placeOrder(contextOf(req), req.body)
	applyCartCookie(res, result.cookie)
	setOrderCookie(res, result.token)
	// `payment` carries what the browser needs to pay (client secret, PayPal order) once a provider is connected.
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Order placed", data: { order: result.order, payment: null } })
})

const countries: RequestHandler = catchAsync(async (_req, res) => {
	sendResponse(res, { statusCode: httpStatus.OK, message: "Countries", data: await CheckoutService.shippableCountries() })
})

export const CheckoutController = { quote, placeOrder, countries }
