import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { ShippingService } from "./shipping.service"

const list: RequestHandler = catchAsync(async (_req, res) => {
	const data = await ShippingService.list()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Shipping zones", data })
})

const createZone: RequestHandler = catchAsync(async (req, res) => {
	const data = await ShippingService.createZone(req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Shipping zone created", data })
})

const updateZone: RequestHandler = catchAsync(async (req, res) => {
	const data = await ShippingService.updateZone(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Shipping zone updated", data })
})

const removeZone: RequestHandler = catchAsync(async (req, res) => {
	await ShippingService.removeZone(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Shipping zone deleted" })
})

const createRate: RequestHandler = catchAsync(async (req, res) => {
	const data = await ShippingService.createRate(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Shipping rate created", data })
})

const updateRate: RequestHandler = catchAsync(async (req, res) => {
	const data = await ShippingService.updateRate(req.params.rateId as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Shipping rate updated", data })
})

const removeRate: RequestHandler = catchAsync(async (req, res) => {
	const data = await ShippingService.removeRate(req.params.rateId as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Shipping rate deleted", data })
})

export const ShippingController = { list, createZone, updateZone, removeZone, createRate, updateRate, removeRate }
