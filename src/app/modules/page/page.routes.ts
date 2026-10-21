import type { Prisma } from "@prisma/client"
import { Router, type RequestHandler } from "express"
import { z } from "zod"
import { resolvePublishedAt } from "../../../domain/catalog/variantRules"
import { sanitizeRichText } from "../../../domain/catalog/richText"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import sendResponse from "../../../shared/sendResponse"
import { slugify } from "../../../shared/slugify"
import ApiError from "../../errors/ApiError"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"

// Pages at the site root: /about, /warranty, /privacy, ...
//
//   GET    /                  storefront: published slugs (sitemap)
//   GET    /:slug             storefront: one published page
//   GET    /admin/list        staff: every page
//   GET    /admin/:id         staff
//   POST   /admin             staff
//   PATCH  /admin/:id         staff
//   DELETE /admin/:id         staff
//
// Admin routes are registered before "/:slug".

/** Storefront routes a page slug may not take: the URL would never reach the page. */
const RESERVED = new Set([
	"shop", "products", "cart", "checkout", "account", "login", "register", "forgot-password", "reset-password",
	"verify-email", "journal", "faq", "contact", "newsletter", "admin", "api", "media", "search",
])

const idParams = z.object({ id: z.uuid() })
const status = z.enum(["DRAFT", "PUBLISHED"])
const plain = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => v || null)

const page = z.object({
	title: z.string().trim().min(1).max(160),
	slug: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.transform((v) => slugify(v))
		.refine((v) => v.length > 0, "The slug needs at least one letter or digit")
		.refine((v) => !RESERVED.has(v), "This address is used by the store itself"),
	intro: plain(600),
	body: z
		.string()
		.max(200_000)
		.nullish()
		.transform((v) => sanitizeRichText(v)),
	// No default here: a PATCH that leaves it out must not unpublish the page.
	status: status.optional(),
	metaTitle: plain(160),
	metaDescription: plain(320),
})

const adminSelect = {
	id: true,
	slug: true,
	title: true,
	intro: true,
	body: true,
	status: true,
	publishedAt: true,
	metaTitle: true,
	metaDescription: true,
	updatedAt: true,
} satisfies Prisma.PageSelect

const assertSlugFree = async (slug: string, excludeId?: string) => {
	const taken = await prisma.page.findFirst({
		where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
		select: { id: true },
	})
	if (taken) throw new ApiError(httpStatus.CONFLICT, `The address /${slug} is already used by another page`)
}

const slugs: RequestHandler = catchAsync(async (_req, res) => {
	const rows = await prisma.page.findMany({
		where: { status: "PUBLISHED" },
		orderBy: { slug: "asc" },
		select: { slug: true, title: true, updatedAt: true },
	})
	sendResponse(res, { statusCode: httpStatus.OK, message: "Pages", data: rows })
})

const getBySlug: RequestHandler = catchAsync(async (req, res) => {
	const row = await prisma.page.findFirst({
		where: { slug: req.params.slug as string, status: "PUBLISHED" },
		select: { slug: true, title: true, intro: true, body: true, metaTitle: true, metaDescription: true, updatedAt: true },
	})
	if (!row) throw new ApiError(httpStatus.NOT_FOUND, "Page not found")
	sendResponse(res, { statusCode: httpStatus.OK, message: "Page", data: row })
})

const adminList: RequestHandler = catchAsync(async (_req, res) => {
	const rows = await prisma.page.findMany({
		orderBy: { title: "asc" },
		select: { id: true, slug: true, title: true, status: true, updatedAt: true },
	})
	sendResponse(res, { statusCode: httpStatus.OK, message: "Pages", data: rows })
})

const adminGet: RequestHandler = catchAsync(async (req, res) => {
	const row = await prisma.page.findUnique({ where: { id: req.params.id as string }, select: adminSelect })
	if (!row) throw new ApiError(httpStatus.NOT_FOUND, "Page not found")
	sendResponse(res, { statusCode: httpStatus.OK, message: "Page", data: row })
})

const create: RequestHandler = catchAsync(async (req, res) => {
	const input = req.body as z.infer<typeof page> & { status: "DRAFT" | "PUBLISHED" }
	await assertSlugFree(input.slug)
	const row = await prisma.page.create({
		data: { ...input, publishedAt: resolvePublishedAt(input.status, null) },
		select: adminSelect,
	})
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Page created", data: row })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const id = req.params.id as string
	const input = req.body as Partial<z.infer<typeof page>>
	const current = await prisma.page.findUnique({ where: { id }, select: { status: true, publishedAt: true } })
	if (!current) throw new ApiError(httpStatus.NOT_FOUND, "Page not found")
	if (input.slug) await assertSlugFree(input.slug, id)
	const row = await prisma.page.update({
		where: { id },
		data: { ...input, publishedAt: resolvePublishedAt(input.status ?? current.status, current.publishedAt) },
		select: adminSelect,
	})
	sendResponse(res, { statusCode: httpStatus.OK, message: "Page updated", data: row })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	const deleted = await prisma.page.deleteMany({ where: { id: req.params.id as string } })
	if (deleted.count === 0) throw new ApiError(httpStatus.NOT_FOUND, "Page not found")
	sendResponse(res, { statusCode: httpStatus.OK, message: "Page deleted" })
})

const router = Router()
const staff = auth(...STAFF_ROLES)
const idSchema = z.object({ params: idParams })

router.get("/admin/list", staff, adminList)
router.get("/admin/:id", staff, validateRequest(idSchema), adminGet)
router.post("/admin", staff, validateRequest(z.object({ body: page.extend({ status: status.default("DRAFT") }) })), create)
router.patch(
	"/admin/:id",
	staff,
	validateRequest(
		z.object({ params: idParams, body: page.partial().refine((b) => Object.keys(b).length > 0, "Nothing to update") })
	),
	update
)
router.delete("/admin/:id", staff, validateRequest(idSchema), remove)

router.get("/", slugs)
router.get("/:slug", validateRequest(z.object({ params: z.object({ slug: z.string().trim().min(1).max(160) }) })), getBySlug)

export const PageRoutes = router
