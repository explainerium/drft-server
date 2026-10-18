import type { Prisma } from "@prisma/client"
import { ancestorsOf, buildTree, findInTree, wouldCreateCycle } from "../../../domain/catalog/categoryTree"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import { slugify, uniqueSlug } from "../../../shared/slugify"
import ApiError from "../../errors/ApiError"
import type { CategoryInput } from "./category.validation"

/** The asset fields every catalog response carries. Shared with the product module. */
export const assetSelect = {
	id: true,
	storageKey: true,
	mimeType: true,
	width: true,
	height: true,
	alt: true,
	derivatives: true,
} satisfies Prisma.AssetSelect

const publicSelect = {
	id: true,
	parentId: true,
	name: true,
	slug: true,
	description: true,
	sortOrder: true,
	metaTitle: true,
	metaDescription: true,
	image: { select: assetSelect },
} satisfies Prisma.CategorySelect

const adminInclude = {
	image: { select: assetSelect },
	_count: { select: { products: true, children: true } },
} satisfies Prisma.CategoryInclude

const loadVisible = () =>
	prisma.category.findMany({ where: { isHidden: false }, select: publicSelect, orderBy: { sortOrder: "asc" } })

// ─── Storefront ──────────────────────────────────────────────────────────────

/** Visible categories as a nested tree. A hidden category hides its whole branch. */
const tree = async () => buildTree(await loadVisible())

/** One visible category with its (visible) subtree and breadcrumb trail. */
const getBySlug = async (slug: string) => {
	const visible = await loadVisible()
	const node = findInTree(buildTree(visible), (c) => c.slug === slug)
	if (!node) throw new ApiError(httpStatus.NOT_FOUND, "Category not found")

	const breadcrumbs = ancestorsOf(node.id, visible).map(({ id, name, slug }) => ({ id, name, slug }))
	return { ...node, breadcrumbs }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/** Flat, hidden ones included. The admin builds its own tree / parent picker from parentId. */
const adminList = () =>
	prisma.category.findMany({ include: adminInclude, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })

const adminGet = async (id: string) => {
	const category = await prisma.category.findUnique({ where: { id }, include: adminInclude })
	if (!category) throw new ApiError(httpStatus.NOT_FOUND, "Category not found")
	return category
}

/** An explicit slug must be free; a derived one gets a numeric suffix until it is. */
const resolveSlug = async (payload: { name?: string; slug?: string }, excludeId?: string) => {
	const isTaken = async (slug: string) =>
		(await prisma.category.findFirst({
			where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
			select: { id: true },
		})) !== null

	if (payload.slug) {
		const slug = slugify(payload.slug)
		if (!slug) throw new ApiError(httpStatus.BAD_REQUEST, "The slug needs at least one letter or digit")
		if (await isTaken(slug)) throw new ApiError(httpStatus.CONFLICT, `The slug "${slug}" is already used`)
		return slug
	}
	return uniqueSlug(payload.name ?? "category", isTaken)
}

const assertParent = async (id: string | undefined, parentId: string | null | undefined) => {
	if (!parentId) return
	const nodes = await prisma.category.findMany({ select: { id: true, parentId: true } })
	if (!nodes.some((n) => n.id === parentId)) throw new ApiError(httpStatus.BAD_REQUEST, "Parent category not found")
	if (id && wouldCreateCycle(id, parentId, nodes)) {
		throw new ApiError(httpStatus.BAD_REQUEST, "A category cannot be placed under itself or one of its subcategories")
	}
}

const assertImage = async (imageAssetId: string | null | undefined) => {
	if (!imageAssetId) return
	const asset = await prisma.asset.findUnique({ where: { id: imageAssetId }, select: { id: true } })
	if (!asset) throw new ApiError(httpStatus.BAD_REQUEST, "Image not found")
}

const create = async (payload: CategoryInput) => {
	await assertParent(undefined, payload.parentId)
	await assertImage(payload.imageAssetId)

	const created = await prisma.category.create({
		data: { ...payload, slug: await resolveSlug(payload) },
	})
	return adminGet(created.id)
}

/** Renaming keeps the slug (URLs stay stable); send `slug` to change it. */
const update = async (id: string, payload: Partial<CategoryInput>) => {
	await adminGet(id)
	await assertParent(id, payload.parentId)
	await assertImage(payload.imageAssetId)

	const { slug, ...rest } = payload
	await prisma.category.update({
		where: { id },
		data: { ...rest, ...(slug !== undefined ? { slug: await resolveSlug({ slug }, id) } : {}) },
	})
	return adminGet(id)
}

/**
 * Refused while it has subcategories: deleting would silently re-root them.
 * Products are only unlinked (the join rows cascade); the products stay.
 */
const remove = async (id: string) => {
	const category = await adminGet(id)
	if (category._count.children > 0) {
		throw new ApiError(httpStatus.CONFLICT, "Move or delete the subcategories first")
	}
	await prisma.category.delete({ where: { id } })
}

export const CategoryService = { tree, getBySlug, adminList, adminGet, create, update, remove }
