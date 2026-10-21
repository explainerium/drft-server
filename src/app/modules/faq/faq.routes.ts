import { Router, type RequestHandler } from "express"
import { z } from "zod"
import { sanitizeRichText } from "../../../domain/catalog/richText"
import { groupFaq } from "../../../domain/content/contentRules"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import sendResponse from "../../../shared/sendResponse"
import ApiError from "../../errors/ApiError"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"

// The FAQ page.
//
//   GET    /                 storefront: published questions by group
//   GET    /admin/list       staff: every question, in order
//   POST   /admin            staff
//   PATCH  /admin/:id        staff
//   DELETE /admin/:id        staff

const idParams = z.object({ id: z.uuid() })

const item = z.object({
	group: z
		.string()
		.trim()
		.max(80)
		.nullish()
		.transform((v) => v || null),
	question: z.string().trim().min(1).max(300),
	answer: z
		.string()
		.max(20_000)
		.transform((v) => sanitizeRichText(v))
		.refine((v): v is string => v !== null, "Write an answer"),
	// No defaults here: a PATCH that leaves them out must not reset them.
	isPublished: z.boolean().optional(),
	sortOrder: z.number().int().min(0).max(100_000).optional(),
})

const select = { id: true, group: true, question: true, answer: true, isPublished: true, sortOrder: true } as const
const order = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }]

const list: RequestHandler = catchAsync(async (_req, res) => {
	const rows = await prisma.faqItem.findMany({ where: { isPublished: true }, orderBy: order, select })
	sendResponse(res, { statusCode: httpStatus.OK, message: "FAQ", data: groupFaq(rows) })
})

const adminList: RequestHandler = catchAsync(async (_req, res) => {
	const rows = await prisma.faqItem.findMany({ orderBy: order, select })
	sendResponse(res, { statusCode: httpStatus.OK, message: "FAQ", data: rows })
})

const create: RequestHandler = catchAsync(async (req, res) => {
	const input = req.body as { isPublished: boolean; sortOrder?: number }
	// New questions go last unless an order is given.
	const last = await prisma.faqItem.aggregate({ _max: { sortOrder: true } })
	const row = await prisma.faqItem.create({
		data: { ...req.body, sortOrder: input.sortOrder ?? (last._max.sortOrder ?? -1) + 1 },
		select,
	})
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Question added", data: row })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const id = req.params.id as string
	if (!(await prisma.faqItem.findUnique({ where: { id }, select: { id: true } }))) {
		throw new ApiError(httpStatus.NOT_FOUND, "Question not found")
	}
	const row = await prisma.faqItem.update({ where: { id }, data: req.body, select })
	sendResponse(res, { statusCode: httpStatus.OK, message: "Question updated", data: row })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	const deleted = await prisma.faqItem.deleteMany({ where: { id: req.params.id as string } })
	if (deleted.count === 0) throw new ApiError(httpStatus.NOT_FOUND, "Question not found")
	sendResponse(res, { statusCode: httpStatus.OK, message: "Question deleted" })
})

const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin/list", staff, adminList)
router.post(
	"/admin",
	staff,
	validateRequest(z.object({ body: item.extend({ isPublished: z.boolean().default(true) }) })),
	create
)
router.patch(
	"/admin/:id",
	staff,
	validateRequest(
		z.object({ params: idParams, body: item.partial().refine((b) => Object.keys(b).length > 0, "Nothing to update") })
	),
	update
)
router.delete("/admin/:id", staff, validateRequest(z.object({ params: idParams })), remove)

router.get("/", list)

export const FaqRoutes = router
