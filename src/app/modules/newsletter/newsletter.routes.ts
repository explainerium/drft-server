import type { Prisma, SubscriberStatus } from "@prisma/client"
import { Router, type RequestHandler } from "express"
import { z } from "zod"
import { env } from "../../../config"
import { sendMail } from "../../../helpers/mailer"
import { renderMail } from "../../../helpers/mailer/template"
import catchAsync from "../../../shared/catchAsync"
import { sendCsv, toCsv } from "../../../shared/csv"
import httpStatus from "../../../shared/httpStatus"
import { paginationQuery, toMeta, toSkipTake } from "../../../shared/pagination"
import { prisma } from "../../../shared/prisma"
import sendResponse from "../../../shared/sendResponse"
import { generateToken, hashToken } from "../../../shared/token"
import ApiError from "../../errors/ApiError"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import { formLimiter } from "../../middlewares/rateLimiter"
import validateRequest from "../../middlewares/validateRequest"

// The newsletter list, with double opt-in.
//
//   POST   /                  sign up { email, source } → confirmation mail; the same answer whatever the state,
//                             so the form never reveals who is on the list
//   POST   /confirm           { token } from the mail → subscribed, welcome mail with the unsubscribe link
//   POST   /unsubscribe       { token }
//   GET    /admin/list        staff (?status=&search=)
//   GET    /admin/export      staff: subscribed addresses as CSV
//   DELETE /admin/:id         staff

const STATUSES = ["PENDING", "SUBSCRIBED", "UNSUBSCRIBED"] as const

const signUpSchema = z.object({
	body: z.object({
		email: z.email().trim().toLowerCase().max(254),
		source: z.string().trim().max(40).optional(),
	}),
})
const tokenSchema = z.object({ body: z.object({ token: z.string().trim().min(20).max(200) }) })
const listSchema = z.object({
	query: z.object({ ...paginationQuery, status: z.enum(STATUSES).optional(), search: z.string().trim().max(100).optional() }),
})

const link = (path: string, token: string) => `${env.PUBLIC_BASE_URL}${path}?token=${token}`

const signUp: RequestHandler = catchAsync(async (req, res) => {
	const { email, source } = req.body as { email: string; source?: string }
	const existing = await prisma.newsletterSubscriber.findUnique({ where: { email }, select: { status: true } })

	if (existing?.status !== "SUBSCRIBED") {
		const token = generateToken()
		await prisma.newsletterSubscriber.upsert({
			where: { email },
			create: { email, source, tokenHash: hashToken(token) },
			update: { status: "PENDING", tokenHash: hashToken(token), ...(source ? { source } : {}) },
		})
		await sendMail(
			renderMail({
				to: email,
				subject: "Confirm your DRFT newsletter subscription",
				preheader: "One click to start getting DRFT dispatches.",
				heading: "Confirm your subscription",
				paragraphs: ["Confirm that you want DRFT dispatches, new gear and riding notes by email."],
				action: { label: "Yes, subscribe me", url: link("/newsletter/confirm", token) },
				after: ["If you did not sign up, ignore this email and nothing will be sent."],
			})
		)
	}
	sendResponse(res, { statusCode: httpStatus.ACCEPTED, message: "Check your inbox to confirm" })
})

const findByToken = async (token: string) => {
	const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { tokenHash: hashToken(token) } })
	if (!subscriber) throw new ApiError(httpStatus.NOT_FOUND, "This link is no longer valid")
	return subscriber
}

const confirm: RequestHandler = catchAsync(async (req, res) => {
	const subscriber = await findByToken((req.body as { token: string }).token)
	if (subscriber.status !== "SUBSCRIBED") {
		await prisma.newsletterSubscriber.update({
			where: { id: subscriber.id },
			data: { status: "SUBSCRIBED", confirmedAt: new Date(), unsubscribedAt: null },
		})
		await sendMail(
			renderMail({
				to: subscriber.email,
				subject: "You're on the DRFT list",
				heading: "You're subscribed",
				paragraphs: ["Thanks for confirming. You'll hear from us when there is something worth reading."],
				footnote: `You get DRFT newsletters because you signed up. Unsubscribe any time: ${link("/newsletter/unsubscribe", (req.body as { token: string }).token)}`,
			})
		)
	}
	sendResponse(res, { statusCode: httpStatus.OK, message: "Subscription confirmed" })
})

const unsubscribe: RequestHandler = catchAsync(async (req, res) => {
	const subscriber = await findByToken((req.body as { token: string }).token)
	if (subscriber.status !== "UNSUBSCRIBED") {
		await prisma.newsletterSubscriber.update({
			where: { id: subscriber.id },
			data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
		})
	}
	sendResponse(res, { statusCode: httpStatus.OK, message: "Unsubscribed" })
})

const adminList: RequestHandler = catchAsync(async (req, res) => {
	const query = req.query as unknown as { page: number; limit: number; status?: SubscriberStatus; search?: string }
	const where: Prisma.NewsletterSubscriberWhereInput = {
		...(query.status ? { status: query.status } : {}),
		...(query.search ? { email: { contains: query.search, mode: "insensitive" } } : {}),
	}
	const [rows, total, counts] = await Promise.all([
		prisma.newsletterSubscriber.findMany({
			where,
			orderBy: { createdAt: "desc" },
			...toSkipTake(query),
			select: { id: true, email: true, status: true, source: true, confirmedAt: true, unsubscribedAt: true, createdAt: true },
		}),
		prisma.newsletterSubscriber.count({ where }),
		prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
	])
	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Subscribers",
		data: {
			subscribers: rows,
			counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count._all ?? 0])),
		},
		meta: toMeta(query, total),
	})
})

const exportCsv: RequestHandler = catchAsync(async (_req, res) => {
	const rows = await prisma.newsletterSubscriber.findMany({
		where: { status: "SUBSCRIBED" },
		orderBy: { confirmedAt: "asc" },
		select: { email: true, source: true, confirmedAt: true },
	})
	const csv = toCsv(
		["email", "source", "confirmed_at"],
		rows.map((r) => [r.email, r.source, r.confirmedAt?.toISOString()])
	)
	sendCsv(res, "drft-newsletter.csv", csv)
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	const deleted = await prisma.newsletterSubscriber.deleteMany({ where: { id: req.params.id as string } })
	if (deleted.count === 0) throw new ApiError(httpStatus.NOT_FOUND, "Subscriber not found")
	sendResponse(res, { statusCode: httpStatus.OK, message: "Subscriber removed" })
})

const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin/list", staff, validateRequest(listSchema), adminList)
router.get("/admin/export", staff, exportCsv)
router.delete("/admin/:id", staff, validateRequest(z.object({ params: z.object({ id: z.uuid() }) })), remove)

router.post("/", formLimiter, validateRequest(signUpSchema), signUp)
router.post("/confirm", formLimiter, validateRequest(tokenSchema), confirm)
router.post("/unsubscribe", formLimiter, validateRequest(tokenSchema), unsubscribe)

export const NewsletterRoutes = router
