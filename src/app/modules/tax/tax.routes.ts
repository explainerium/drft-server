import { Router, type RequestHandler } from "express"
import { z } from "zod"
import { COUNTRY_CODE } from "../../../domain/checkout/checkoutRules"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import sendResponse from "../../../shared/sendResponse"
import ApiError from "../../errors/ApiError"
import { auth } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"

// VAT per destination country, admins only. Countries without a row use the
// default rate from settings (tax).
//
//   GET    /admin                  every rate
//   PUT    /admin/:countryCode     { rate } sets or changes it
//   DELETE /admin/:countryCode     back to the default rate

const countryParams = z.object({ countryCode: z.string().trim().toUpperCase().regex(COUNTRY_CODE) })

const putSchema = z.object({
	params: countryParams,
	body: z.object({
		rate: z
			.number()
			.min(0)
			.max(50)
			.refine((v) => Number.isInteger(Math.round(v * 100 * 1e6) / 1e6), "Use at most 2 decimals"),
	}),
})

const toRate = (row: { countryCode: string; rate: { toNumber(): number }; updatedAt: Date }) => ({
	countryCode: row.countryCode,
	rate: row.rate.toNumber(),
	updatedAt: row.updatedAt,
})

const list: RequestHandler = catchAsync(async (_req, res) => {
	const rows = await prisma.taxRate.findMany({ orderBy: { countryCode: "asc" } })
	sendResponse(res, { statusCode: httpStatus.OK, message: "VAT rates", data: rows.map(toRate) })
})

const put: RequestHandler = catchAsync(async (req, res) => {
	const countryCode = req.params.countryCode as string
	const { rate } = req.body as { rate: number }
	const row = await prisma.taxRate.upsert({ where: { countryCode }, create: { countryCode, rate }, update: { rate } })
	sendResponse(res, { statusCode: httpStatus.OK, message: "VAT rate saved", data: toRate(row) })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	const countryCode = req.params.countryCode as string
	const removed = await prisma.taxRate.deleteMany({ where: { countryCode } })
	if (removed.count === 0) throw new ApiError(httpStatus.NOT_FOUND, "No VAT rate for this country")
	sendResponse(res, { statusCode: httpStatus.OK, message: "VAT rate removed" })
})

const router = Router()

router.use(auth("ADMIN"))

router.get("/admin", list)
router.put("/admin/:countryCode", validateRequest(putSchema), put)
router.delete("/admin/:countryCode", validateRequest(z.object({ params: countryParams })), remove)

export const TaxRoutes = router
