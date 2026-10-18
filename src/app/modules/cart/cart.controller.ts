import type { Request, RequestHandler, Response } from "express"
import catchAsync from "../../../shared/catchAsync"
import { clearCartCookie, COOKIE, setCartCookie } from "../../../shared/cookies"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { CartService, type CartContext, type CartCookie } from "./cart.service"

const contextOf = (req: Request): CartContext => ({
	userId: req.user?.sub,
	token: req.cookies?.[COOKIE.CART] as string | undefined,
})

const applyCookie = (res: Response, cookie: CartCookie): void => {
	if (!cookie) return
	if ("set" in cookie) setCartCookie(res, cookie.set)
	else clearCartCookie(res)
}

const reply = (res: Response, result: { cart: unknown; cookie: CartCookie }, message: string, status = httpStatus.OK) => {
	applyCookie(res, result.cookie)
	sendResponse(res, { statusCode: status, message, data: result.cart })
}

const get: RequestHandler = catchAsync(async (req, res) => {
	reply(res, await CartService.get(contextOf(req)), "Cart")
})

const addItem: RequestHandler = catchAsync(async (req, res) => {
	reply(res, await CartService.addItem(contextOf(req), req.body), "Added to cart")
})

const updateItem: RequestHandler = catchAsync(async (req, res) => {
	const result = await CartService.updateItem(contextOf(req), req.params.itemId as string, req.body.quantity)
	reply(res, result, "Cart updated")
})

const removeItem: RequestHandler = catchAsync(async (req, res) => {
	reply(res, await CartService.removeItem(contextOf(req), req.params.itemId as string), "Removed from cart")
})

export const CartController = { get, addItem, updateItem, removeItem }
