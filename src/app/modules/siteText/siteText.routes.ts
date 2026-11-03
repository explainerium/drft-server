import { Router, type RequestHandler } from "express"
import { z } from "zod"
import { isSiteTextKey, planSiteTextChanges, SITE_TEXT_MAX_LENGTH, siteTextId } from "../../../domain/content/siteTexts"
import { LOCALES } from "../../../domain/i18n/locale"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import { currentLocale } from "../../../shared/requestContext"
import sendResponse from "../../../shared/sendResponse"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"

// Site texts: storefront strings changed in the admin. The frontend's message
// files are the defaults; these rows replace single strings, per language.
//
//   GET  /               storefront: { <key>: <text> } in the x-drft-locale language
//   GET  /admin          staff: every changed text in both languages, with who and when
//   PUT  /admin          staff: { changes: [{ key, locale, value }] }; an empty value restores the default
//   GET  /admin/history  staff: ?key= → the last 20 changes of one text, both languages

const key = z.string().trim().refine(isSiteTextKey, "Not a storefront text")

export const saveSiteTextsSchema = z.object({
	body: z.object({
		changes: z
			.array(z.object({ key, locale: z.enum(LOCALES), value: z.string().trim().max(SITE_TEXT_MAX_LENGTH) }))
			.min(1)
			.max(1200),
	}),
})

const historySchema = z.object({ query: z.object({ key }) })

const editor = { select: { firstName: true, lastName: true, email: true } } as const

const editorName = (user: { firstName: string | null; lastName: string | null; email: string } | null) =>
	user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : null

const publicTexts: RequestHandler = catchAsync(async (_req, res) => {
	const rows = await prisma.siteText.findMany({ where: { locale: currentLocale() }, select: { key: true, value: true } })
	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Site texts",
		data: Object.fromEntries(rows.map((row) => [row.key, row.value])),
	})
})

const adminList: RequestHandler = catchAsync(async (_req, res) => {
	const rows = await prisma.siteText.findMany({
		orderBy: [{ key: "asc" }, { locale: "asc" }],
		select: { key: true, locale: true, value: true, updatedAt: true, updatedBy: editor },
	})
	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Site texts",
		data: rows.map(({ updatedBy, ...row }) => ({ ...row, updatedBy: editorName(updatedBy) })),
	})
})

const save: RequestHandler = catchAsync(async (req, res) => {
	const { changes } = req.body as z.infer<typeof saveSiteTextsSchema>["body"]
	const stored = await prisma.siteText.findMany({
		where: { key: { in: [...new Set(changes.map((change) => change.key))] } },
		select: { key: true, locale: true, value: true },
	})
	const plan = planSiteTextChanges(new Map(stored.map((row) => [siteTextId(row.locale, row.key), row.value])), changes)
	const userId = req.user!.sub

	if (plan.revisions.length) {
		await prisma.$transaction([
			...plan.upserts.map(({ key, locale, value }) =>
				prisma.siteText.upsert({
					where: { key_locale: { key, locale } },
					create: { key, locale, value, updatedById: userId },
					update: { value, updatedById: userId },
				})
			),
			...(plan.resets.length ? [prisma.siteText.deleteMany({ where: { OR: plan.resets } })] : []),
			prisma.siteTextRevision.createMany({ data: plan.revisions.map((revision) => ({ ...revision, changedById: userId })) }),
		])
	}

	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: plan.revisions.length ? "Texts saved" : "Nothing changed",
		data: { saved: plan.upserts.length, reset: plan.resets.length },
	})
})

const history: RequestHandler = catchAsync(async (req, res) => {
	const { key } = req.query as unknown as { key: string }
	const rows = await prisma.siteTextRevision.findMany({
		where: { key },
		orderBy: { createdAt: "desc" },
		take: 20,
		select: { id: true, locale: true, value: true, createdAt: true, changedBy: editor },
	})
	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "Text history",
		data: rows.map(({ changedBy, ...row }) => ({ ...row, changedBy: editorName(changedBy) })),
	})
})

const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin", staff, adminList)
router.put("/admin", staff, validateRequest(saveSiteTextsSchema), save)
router.get("/admin/history", staff, validateRequest(historySchema), history)

router.get("/", publicTexts)

export const SiteTextRoutes = router
