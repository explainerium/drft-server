import type { OrderStatus } from "@prisma/client"
import type { RequestHandler } from "express"
import { dayKey, dayStart, shiftDay } from "../../../domain/order/orderRules"
import catchAsync from "../../../shared/catchAsync"
import { COOKIE } from "../../../shared/cookies"
import { sendCsv } from "../../../shared/csv"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { OrderAdminService } from "./orderAdmin.service"
import { OrderService } from "./order.service"

const getOne: RequestHandler = catchAsync(async (req, res) => {
	const order = await OrderService.getForBuyer(req.params.id as string, {
		userId: req.user?.sub,
		token: req.cookies?.[COOKIE.ORDER] as string | undefined,
	})
	sendResponse(res, { statusCode: httpStatus.OK, message: "Order", data: order })
})

const adminList: RequestHandler = catchAsync(async (req, res) => {
	const { orders, meta } = await OrderAdminService.list(req.query as never)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Orders", data: orders, meta })
})

const adminExport: RequestHandler = catchAsync(async (req, res) => {
	const { status, from, to } = req.query as { status?: OrderStatus; from?: string; to?: string }
	const csv = await OrderAdminService.exportCsv({
		status,
		from: from ? dayStart(from) : undefined,
		to: to ? dayStart(shiftDay(to, 1)) : undefined,
	})
	sendCsv(res, `drft-orders${from || to ? `-${from ?? "start"}-to-${to ?? dayKey(new Date())}` : ""}.csv`, csv)
})

const adminCounts: RequestHandler = catchAsync(async (_req, res) => {
	const counts = await OrderAdminService.statusCounts()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Orders per status", data: counts })
})

const adminGet: RequestHandler = catchAsync(async (req, res) => {
	const order = await OrderAdminService.get(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Order", data: order })
})

const changeStatus: RequestHandler = catchAsync(async (req, res) => {
	const order = await OrderAdminService.changeStatus(req.user!.sub, req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Order status updated", data: order })
})

const updateTracking: RequestHandler = catchAsync(async (req, res) => {
	const order = await OrderAdminService.updateTracking(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Tracking updated", data: order })
})

const addNote: RequestHandler = catchAsync(async (req, res) => {
	const order = await OrderAdminService.addNote(req.user!.sub, req.params.id as string, req.body.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Note added", data: order })
})

export const OrderController = {
	getOne,
	adminList,
	adminCounts,
	adminExport,
	adminGet,
	changeStatus,
	updateTracking,
	addNote,
}
