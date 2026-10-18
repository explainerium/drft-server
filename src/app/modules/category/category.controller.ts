import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { CategoryService } from "./category.service"

const tree: RequestHandler = catchAsync(async (_req, res) => {
	const data = await CategoryService.tree()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Categories", data })
})

const getBySlug: RequestHandler = catchAsync(async (req, res) => {
	const data = await CategoryService.getBySlug(req.params.slug as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Category", data })
})

const adminList: RequestHandler = catchAsync(async (_req, res) => {
	const data = await CategoryService.adminList()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Categories", data })
})

const adminGet: RequestHandler = catchAsync(async (req, res) => {
	const data = await CategoryService.adminGet(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Category", data })
})

const create: RequestHandler = catchAsync(async (req, res) => {
	const data = await CategoryService.create(req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Category created", data })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const data = await CategoryService.update(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Category updated", data })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	await CategoryService.remove(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Category deleted" })
})

export const CategoryController = { tree, getBySlug, adminList, adminGet, create, update, remove }
