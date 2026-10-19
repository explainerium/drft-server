import { Router, type RequestHandler } from "express"
import { z } from "zod"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { DashboardService } from "./dashboard.service"

const summarySchema = z.object({
	query: z.object({ days: z.enum(["7", "30", "90"]).default("30").transform(Number) }),
})

const summary: RequestHandler = catchAsync(async (req, res) => {
	const data = await DashboardService.summary(req.query.days as unknown as number)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Dashboard", data })
})

// The admin dashboard home. Staff only.
const router = Router()

router.get("/summary", auth(...STAFF_ROLES), validateRequest(summarySchema), summary)

export const DashboardRoutes = router
