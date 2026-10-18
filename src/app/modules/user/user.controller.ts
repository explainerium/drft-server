import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { UserService } from "./user.service"

const actorOf = (req: Parameters<RequestHandler>[0]) => ({ id: req.user!.sub, role: req.user!.role })

const list: RequestHandler = catchAsync(async (req, res) => {
	const { data, meta } = await UserService.list(req.query as never)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Users", data, meta })
})

const get: RequestHandler = catchAsync(async (req, res) => {
	const user = await UserService.get(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "User", data: user })
})

const createStaff: RequestHandler = catchAsync(async (req, res) => {
	const user = await UserService.createStaff(req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Staff account created", data: user })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const user = await UserService.update(actorOf(req), req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "User updated", data: user })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	await UserService.remove(actorOf(req), req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "User deleted" })
})

export const UserController = { list, get, createStaff, update, remove }
