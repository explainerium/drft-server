import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { AttributeService } from "./attribute.service"

const list: RequestHandler = catchAsync(async (_req, res) => {
	const data = await AttributeService.list()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Attributes", data })
})

const adminList: RequestHandler = catchAsync(async (_req, res) => {
	const data = await AttributeService.adminList()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Attributes", data })
})

const get: RequestHandler = catchAsync(async (req, res) => {
	const data = await AttributeService.get(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Attribute", data })
})

const create: RequestHandler = catchAsync(async (req, res) => {
	const data = await AttributeService.create(req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Attribute created", data })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const data = await AttributeService.update(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Attribute updated", data })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	await AttributeService.remove(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Attribute deleted" })
})

const createValue: RequestHandler = catchAsync(async (req, res) => {
	const data = await AttributeService.createValue(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Attribute value created", data })
})

const updateValue: RequestHandler = catchAsync(async (req, res) => {
	const data = await AttributeService.updateValue(req.params.valueId as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Attribute value updated", data })
})

const removeValue: RequestHandler = catchAsync(async (req, res) => {
	await AttributeService.removeValue(req.params.valueId as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Attribute value deleted" })
})

export const AttributeController = {
	list,
	adminList,
	get,
	create,
	update,
	remove,
	createValue,
	updateValue,
	removeValue,
}
