import type { Prisma } from "@prisma/client"
import { Router, type RequestHandler } from "express"
import { z } from "zod"
import { sendMail } from "../../../helpers/mailer"
import { renderMail } from "../../../helpers/mailer/template"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import { paginationQuery, toMeta, toSkipTake } from "../../../shared/pagination"
import { prisma } from "../../../shared/prisma"
import sendResponse from "../../../shared/sendResponse"
import ApiError from "../../errors/ApiError"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import { formLimiter } from "../../middlewares/rateLimiter"
import { env } from "../../../config"
import validateRequest from "../../middlewares/validateRequest"
import { SettingService } from "../setting/setting.service"

// The contact form.
//
//   POST   /                  storefront: a message (honeypot "website" must stay empty)
//   GET    /admin/list        staff (?unread=true&search=)
//   GET    /admin/:id         staff
//   PATCH  /admin/:id         staff { isRead }
//   DELETE /admin/:id         staff

const plain = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => v || null)

const sendSchema = z.object({
	body: z.object({
		name: z.string().trim().min(1).max(120),
		email: z.email().trim().toLowerCase().max(254),
		subject: plain(160),
		orderNumber: plain(40),
		message: z.string().trim().min(10, "Write a few more words").max(5_000),
		// Bots fill every field; people never see this one.
		website: z.string().max(200).optional(),
	}),
})
const idSchema = z.object({ params: z.object({ id: z.uuid() }) })
const listSchema = z.object({
	query: z.object({
		...paginationQuery,
		unread: z.enum(["true", "false"]).optional(),
		search: z.string().trim().max(100).optional(),
	}),
})

const send: RequestHandler = catchAsync(async (req, res) => {
	const { website, ...message } = req.body as z.infer<typeof sendSchema>["body"]
	// Looks the same to a bot, so it does not learn to skip the field.
	if (website) return sendResponse(res, { statusCode: httpStatus.CREATED, message: "Message sent" })

	await prisma.contactMessage.create({ data: message })
	const store = (await SettingService.get("store")) as { email: string; name: string }
	if (store.email) {
		await sendMail(
			renderMail({
				to: store.email,
				subject: `Contact form: ${message.subject ?? message.name}`,
				heading: message.subject ?? "New message from the contact form",
				paragraphs: [message.message],
				details: [
					{ label: "From", value: `${message.name} <${message.email}>` },
					...(message.orderNumber ? [{ label: "Order", value: message.orderNumber }] : []),
				],
				action: { label: "Open in the admin", url: `${env.PUBLIC_BASE_URL}/admin/messages` },
			})
		)
	}
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Message sent" })
})

const select = {
	id: true,
	name: true,
	email: true,
	subject: true,
	orderNumber: true,
	message: true,
	isRead: true,
	createdAt: true,
} satisfies Prisma.ContactMessageSelect

const adminList: RequestHandler = catchAsync(async (req, res) => {
	const query = req.query as unknown as { page: number; limit: number; unread?: "true" | "false"; search?: string }
	const where: Prisma.ContactMessageWhereInput = {
		...(query.unread === "true" ? { isRead: false } : {}),
		...(query.search
			? {
					OR: [
						{ name: { contains: query.search, mode: "insensitive" } },
						{ email: { contains: query.search, mode: "insensitive" } },
						{ subject: { contains: query.search, mode: "insensitive" } },
					],
				}
			: {}),
	}
	const [rows, total, unread] = await Promise.all([
		prisma.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, ...toSkipTake(query), select }),
		prisma.contactMessage.count({ where }),
		prisma.contactMessage.count({ where: { isRead: false } }),
	])
	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Messages",
		data: { messages: rows, unread },
		meta: toMeta(query, total),
	})
})

const adminGet: RequestHandler = catchAsync(async (req, res) => {
	const row = await prisma.contactMessage.findUnique({ where: { id: req.params.id as string }, select })
	if (!row) throw new ApiError(httpStatus.NOT_FOUND, "Message not found")
	sendResponse(res, { statusCode: httpStatus.OK, message: "Message", data: row })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const id = req.params.id as string
	if (!(await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } }))) {
		throw new ApiError(httpStatus.NOT_FOUND, "Message not found")
	}
	const row = await prisma.contactMessage.update({ where: { id }, data: req.body, select })
	sendResponse(res, { statusCode: httpStatus.OK, message: "Message updated", data: row })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	const deleted = await prisma.contactMessage.deleteMany({ where: { id: req.params.id as string } })
	if (deleted.count === 0) throw new ApiError(httpStatus.NOT_FOUND, "Message not found")
	sendResponse(res, { statusCode: httpStatus.OK, message: "Message deleted" })
})

const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin/list", staff, validateRequest(listSchema), adminList)
router.get("/admin/:id", staff, validateRequest(idSchema), adminGet)
router.patch(
	"/admin/:id",
	staff,
	validateRequest(idSchema.extend({ body: z.object({ isRead: z.boolean() }) })),
	update
)
router.delete("/admin/:id", staff, validateRequest(idSchema), remove)

router.post("/", formLimiter, validateRequest(sendSchema), send)

export const ContactRoutes = router
