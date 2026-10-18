import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { SettingService } from "./setting.service"

const getPublic: RequestHandler = catchAsync(async (_req, res) => {
	const settings = await SettingService.getPublic()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Settings", data: settings })
})

const get: RequestHandler = catchAsync(async (req, res) => {
	const value = await SettingService.get(req.params.group as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Settings", data: value })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const value = await SettingService.update(req.params.group as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Settings saved", data: value })
})

export const SettingController = { getPublic, get, update }
