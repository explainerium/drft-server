import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import type { PaginationInput } from "../../../shared/pagination"
import { OrderService } from "../order/order.service"
import { AccountService } from "./account.service"

const updateProfile: RequestHandler = catchAsync(async (req, res) => {
	const user = await AccountService.updateProfile(req.user!.sub, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Profile updated", data: user })
})

const listAddresses: RequestHandler = catchAsync(async (req, res) => {
	const addresses = await AccountService.listAddresses(req.user!.sub)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Addresses", data: addresses })
})

const createAddress: RequestHandler = catchAsync(async (req, res) => {
	const address = await AccountService.createAddress(req.user!.sub, req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Address added", data: address })
})

const updateAddress: RequestHandler = catchAsync(async (req, res) => {
	const address = await AccountService.updateAddress(req.user!.sub, req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Address updated", data: address })
})

const deleteAddress: RequestHandler = catchAsync(async (req, res) => {
	await AccountService.deleteAddress(req.user!.sub, req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Address deleted" })
})

const listOrders: RequestHandler = catchAsync(async (req, res) => {
	const { orders, meta } = await OrderService.listForCustomer(req.user!.sub, req.query as unknown as PaginationInput)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Orders", data: orders, meta })
})

export const AccountController = {
	updateProfile,
	listAddresses,
	createAddress,
	updateAddress,
	deleteAddress,
	listOrders,
}
