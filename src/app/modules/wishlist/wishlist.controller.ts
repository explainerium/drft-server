import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { WishlistService } from "./wishlist.service"

const list: RequestHandler = catchAsync(async (req, res) => {
	sendResponse(res, { statusCode: httpStatus.OK, message: "Wishlist", data: await WishlistService.list(req.user!.sub) })
})

const add: RequestHandler = catchAsync(async (req, res) => {
	const items = await WishlistService.add(req.user!.sub, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Saved to your wishlist", data: items })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	const items = await WishlistService.remove(req.user!.sub, req.params.productId as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Removed from your wishlist", data: items })
})

export const WishlistController = { list, add, remove }
