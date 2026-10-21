import type { ContentStatus, Prisma } from "@prisma/client"
import { resolvePublishedAt } from "../../../domain/catalog/variantRules"
import { readingMinutes } from "../../../domain/content/contentRules"
import httpStatus from "../../../shared/httpStatus"
import { toMeta, toSkipTake, type PaginationInput } from "../../../shared/pagination"
import { prisma } from "../../../shared/prisma"
import { slugify, uniqueSlug } from "../../../shared/slugify"
import ApiError from "../../errors/ApiError"
import { assetSelect, toImageOrNull } from "../media/media.view"

export interface PostInput {
	title: string
	slug?: string
	excerpt: string | null
	body: string | null
	tag: string | null
	author: string | null
	coverAssetId: string | null
	status: ContentStatus
	publishedAt?: Date | null
	metaTitle: string | null
	metaDescription: string | null
}

const cardSelect = {
	id: true,
	slug: true,
	title: true,
	excerpt: true,
	tag: true,
	author: true,
	readMinutes: true,
	publishedAt: true,
	cover: { select: assetSelect },
} satisfies Prisma.PostSelect

type CardRow = Prisma.PostGetPayload<{ select: typeof cardSelect }>

const toCard = ({ cover, ...post }: CardRow) => ({ ...post, cover: toImageOrNull(cover) })

/** Published and not dated in the future. */
const visible = (now = new Date()): Prisma.PostWhereInput => ({ status: "PUBLISHED", publishedAt: { lte: now } })

// ── Storefront ───────────────────────────────────────────────────────────────

const list = async (query: PaginationInput & { tag?: string }) => {
	const where: Prisma.PostWhereInput = { ...visible(), ...(query.tag ? { tag: query.tag } : {}) }
	const [rows, total] = await Promise.all([
		prisma.post.findMany({ where, orderBy: { publishedAt: "desc" }, select: cardSelect, ...toSkipTake(query) }),
		prisma.post.count({ where }),
	])
	return { data: rows.map(toCard), meta: toMeta(query, total) }
}

/** Tags on visible posts with how many posts carry each, most used first. */
const tags = async () => {
	const rows = await prisma.post.groupBy({
		by: ["tag"],
		where: { ...visible(), tag: { not: null } },
		_count: { _all: true },
	})
	return rows
		.map((row) => ({ tag: row.tag as string, count: row._count._all }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** One post, with up to three more to read next. */
const getBySlug = async (slug: string) => {
	const post = await prisma.post.findFirst({
		where: { slug, ...visible() },
		select: { ...cardSelect, body: true, metaTitle: true, metaDescription: true, updatedAt: true },
	})
	if (!post) throw new ApiError(httpStatus.NOT_FOUND, "Post not found")
	const more = await prisma.post.findMany({
		where: { ...visible(), id: { not: post.id } },
		orderBy: { publishedAt: "desc" },
		take: 3,
		select: cardSelect,
	})
	return { ...toCard(post), body: post.body, metaTitle: post.metaTitle, metaDescription: post.metaDescription, updatedAt: post.updatedAt, more: more.map(toCard) }
}

// ── Admin ────────────────────────────────────────────────────────────────────

const adminList = async (query: PaginationInput & { search?: string; status?: ContentStatus }) => {
	const where: Prisma.PostWhereInput = {
		...(query.status ? { status: query.status } : {}),
		...(query.search ? { title: { contains: query.search, mode: "insensitive" } } : {}),
	}
	const [rows, total] = await Promise.all([
		prisma.post.findMany({
			where,
			orderBy: [{ updatedAt: "desc" }],
			select: { ...cardSelect, status: true, updatedAt: true },
			...toSkipTake(query),
		}),
		prisma.post.count({ where }),
	])
	return { data: rows.map((row) => ({ ...toCard(row), status: row.status, updatedAt: row.updatedAt })), meta: toMeta(query, total) }
}

const adminGet = async (id: string) => {
	const post = await prisma.post.findUnique({
		where: { id },
		select: { ...cardSelect, body: true, status: true, coverAssetId: true, metaTitle: true, metaDescription: true, updatedAt: true },
	})
	if (!post) throw new ApiError(httpStatus.NOT_FOUND, "Post not found")
	return { ...post, cover: toImageOrNull(post.cover) }
}

const resolveSlug = async (input: { title?: string; slug?: string }, excludeId?: string) => {
	const isTaken = async (slug: string) =>
		(await prisma.post.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } })) !== null
	if (input.slug) {
		const slug = slugify(input.slug)
		if (!slug) throw new ApiError(httpStatus.BAD_REQUEST, "The slug needs at least one letter or digit")
		if (await isTaken(slug)) throw new ApiError(httpStatus.CONFLICT, `The slug "${slug}" is already used`)
		return slug
	}
	return uniqueSlug(input.title ?? "post", isTaken)
}

const assertCover = async (coverAssetId: string | null | undefined) => {
	if (!coverAssetId) return
	if (!(await prisma.asset.findUnique({ where: { id: coverAssetId }, select: { id: true } }))) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Cover image not found")
	}
}

const create = async (input: PostInput) => {
	await assertCover(input.coverAssetId)
	const { publishedAt, ...rest } = input
	const post = await prisma.post.create({
		data: {
			...rest,
			slug: await resolveSlug(input),
			readMinutes: readingMinutes(input.body),
			publishedAt: publishedAt ?? resolvePublishedAt(input.status, null),
		},
		select: { id: true },
	})
	return adminGet(post.id)
}

/** Renaming keeps the slug (links stay stable); send `slug` to change it. */
const update = async (id: string, input: Partial<PostInput>) => {
	const current = await prisma.post.findUnique({ where: { id }, select: { status: true, publishedAt: true } })
	if (!current) throw new ApiError(httpStatus.NOT_FOUND, "Post not found")
	await assertCover(input.coverAssetId)
	const { slug, publishedAt, ...rest } = input
	await prisma.post.update({
		where: { id },
		data: {
			...rest,
			...(slug !== undefined ? { slug: await resolveSlug({ slug }, id) } : {}),
			...(input.body !== undefined ? { readMinutes: readingMinutes(input.body) } : {}),
			// A date given wins; otherwise the first publish stamps today (an empty date never hides a live post).
			publishedAt: publishedAt ?? resolvePublishedAt(input.status ?? current.status, current.publishedAt),
		},
	})
	return adminGet(id)
}

const remove = async (id: string) => {
	const deleted = await prisma.post.deleteMany({ where: { id } })
	if (deleted.count === 0) throw new ApiError(httpStatus.NOT_FOUND, "Post not found")
}

export const PostService = { list, tags, getBySlug, adminList, adminGet, create, update, remove }
