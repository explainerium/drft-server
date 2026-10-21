import { Router, type RequestHandler } from "express"
import { z } from "zod"
import { sanitizeRichText } from "../../../domain/catalog/richText"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import { paginationQuery } from "../../../shared/pagination"
import sendResponse from "../../../shared/sendResponse"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { PostService } from "./post.service"

// The journal.
//
//   GET    /                  storefront: published posts, newest first (?tag=)
//   GET    /tags              storefront: tags in use, with post counts
//   GET    /:slug             storefront: one post and three more
//   GET    /admin/list        staff: every status (?search=&status=)
//   GET    /admin/:id         staff
//   POST   /admin             staff
//   PATCH  /admin/:id         staff
//   DELETE /admin/:id         staff
//
// Admin routes and /tags are registered before "/:slug".

const idParams = z.object({ id: z.uuid() })
const status = z.enum(["DRAFT", "PUBLISHED"])
const plain = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => v || null)

const post = z.object({
	title: z.string().trim().min(1).max(160),
	slug: z.string().trim().min(1).max(120).optional(),
	excerpt: plain(400),
	body: z
		.string()
		.max(200_000)
		.nullish()
		.transform((v) => sanitizeRichText(v)),
	tag: plain(40),
	author: plain(80),
	coverAssetId: z.uuid().nullish().transform((v) => v ?? null),
	// No defaults here: a PATCH that leaves a field out must not reset it.
	status: status.optional(),
	publishedAt: z.coerce.date().nullish(),
	metaTitle: plain(160),
	metaDescription: plain(320),
})

const listSchema = z.object({
	query: z.object({ page: paginationQuery.page, limit: paginationQuery.limit, tag: z.string().trim().max(40).optional() }),
})
const adminListSchema = z.object({
	query: z.object({ ...paginationQuery, search: z.string().trim().max(100).optional(), status: status.optional() }),
})
const slugSchema = z.object({ params: z.object({ slug: z.string().trim().min(1).max(160) }) })
const idSchema = z.object({ params: idParams })
const createSchema = z.object({ body: post.extend({ status: status.default("DRAFT") }) })
const updateSchema = z.object({
	params: idParams,
	body: post
		.partial()
		.refine((body) => Object.keys(body).length > 0, "Nothing to update"),
})

const list: RequestHandler = catchAsync(async (req, res) => {
	const { data, meta } = await PostService.list(req.query as never)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Posts", data, meta })
})

const tags: RequestHandler = catchAsync(async (_req, res) => {
	const data = await PostService.tags()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Tags", data })
})

const getBySlug: RequestHandler = catchAsync(async (req, res) => {
	const data = await PostService.getBySlug(req.params.slug as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Post", data })
})

const adminList: RequestHandler = catchAsync(async (req, res) => {
	const { data, meta } = await PostService.adminList(req.query as never)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Posts", data, meta })
})

const adminGet: RequestHandler = catchAsync(async (req, res) => {
	const data = await PostService.adminGet(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Post", data })
})

const create: RequestHandler = catchAsync(async (req, res) => {
	const data = await PostService.create(req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Post created", data })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const data = await PostService.update(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Post updated", data })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	await PostService.remove(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Post deleted" })
})

const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin/list", staff, validateRequest(adminListSchema), adminList)
router.get("/admin/:id", staff, validateRequest(idSchema), adminGet)
router.post("/admin", staff, validateRequest(createSchema), create)
router.patch("/admin/:id", staff, validateRequest(updateSchema), update)
router.delete("/admin/:id", staff, validateRequest(idSchema), remove)

router.get("/", validateRequest(listSchema), list)
router.get("/tags", tags)
router.get("/:slug", validateRequest(slugSchema), getBySlug)

export const PostRoutes = router
