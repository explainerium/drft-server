import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { ProductService } from "./product.service"

const list: RequestHandler = catchAsync(async (req, res) => {
	const { data, meta } = await ProductService.list(req.query as never)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Products", data, meta })
})

const getBySlug: RequestHandler = catchAsync(async (req, res) => {
	const data = await ProductService.getBySlug(req.params.slug as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Product", data })
})

const adminList: RequestHandler = catchAsync(async (req, res) => {
	const { data, meta } = await ProductService.adminList(req.query as never)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Products", data, meta })
})

const adminGet: RequestHandler = catchAsync(async (req, res) => {
	const data = await ProductService.adminGet(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Product", data })
})

const create: RequestHandler = catchAsync(async (req, res) => {
	const data = await ProductService.create(req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Product created", data })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const data = await ProductService.update(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Product updated", data })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	await ProductService.remove(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Product deleted" })
})

export const ProductController = { list, getBySlug, adminList, adminGet, create, update, remove }
