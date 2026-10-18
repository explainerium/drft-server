import type { Prisma } from "@prisma/client"
import { descendantIds } from "../../../domain/catalog/categoryTree"
import { parseAttributeFilters } from "../../../domain/catalog/productFilters"
import {
	normalizeRelatedIds,
	normalizeVariants,
	resolvePublishedAt,
	type NormalizedVariant,
	type RuleResult,
} from "../../../domain/catalog/variantRules"
import { isInStock, summarizeVariants } from "../../../domain/catalog/variantSummary"
import httpStatus from "../../../shared/httpStatus"
import { toMeta, toSkipTake } from "../../../shared/pagination"
import { prisma } from "../../../shared/prisma"
import { slugify, uniqueSlug } from "../../../shared/slugify"
import ApiError from "../../errors/ApiError"
import { assetSelect, toImage, toImageOrNull } from "../media/media.view"
import type {
	ProductAdminListQuery,
	ProductInput,
	ProductListQuery,
	ProductUpdateInput,
	VariantInput,
} from "./product.validation"

// ─── Shapes ──────────────────────────────────────────────────────────────────

const money = (value: Prisma.Decimal): string => value.toFixed(2)
const moneyOrNull = (value: Prisma.Decimal | null): string | null => (value ? value.toFixed(2) : null)

const visibleCategories = {
	where: { category: { isHidden: false } },
	select: { category: { select: { id: true, name: true, slug: true } } },
} satisfies Prisma.Product$categoriesArgs

const cardSelect = {
	id: true,
	name: true,
	slug: true,
	badge: true,
	typeLabel: true,
	shortDescription: true,
	isFeatured: true,
	featuredAsset: { select: assetSelect },
	// Fallback picture when no featured image is set.
	images: { orderBy: { sortOrder: "asc" }, take: 1, select: { alt: true, asset: { select: assetSelect } } },
	variants: {
		where: { isActive: true },
		select: { price: true, compareAtPrice: true, manageStock: true, stock: true, isDefault: true },
	},
	categories: visibleCategories,
} satisfies Prisma.ProductSelect

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>

const toCard = (row: CardRow) => {
	const summary = summarizeVariants(
		row.variants.map((v) => ({
			price: money(v.price),
			compareAtPrice: moneyOrNull(v.compareAtPrice),
			manageStock: v.manageStock,
			stock: v.stock,
			isDefault: v.isDefault,
			isActive: true,
		}))
	)
	const fallback = row.images[0]

	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		badge: row.badge,
		typeLabel: row.typeLabel,
		shortDescription: row.shortDescription,
		isFeatured: row.isFeatured,
		featuredImage: row.featuredAsset
			? toImage(row.featuredAsset)
			: fallback
				? toImage(fallback.asset, fallback.alt)
				: null,
		price: { min: summary.minPrice, max: summary.maxPrice },
		compareAtPrice: summary.compareAtPrice,
		inStock: summary.inStock,
		categories: row.categories.map((c) => c.category),
	}
}

const variantSelect = {
	id: true,
	sku: true,
	price: true,
	compareAtPrice: true,
	manageStock: true,
	stock: true,
	allowBackorder: true,
	weightKg: true,
	imageAssetId: true,
	image: { select: assetSelect },
	isDefault: true,
	isActive: true,
	sortOrder: true,
	attributeValues: {
		select: {
			attributeValue: {
				select: {
					id: true,
					code: true,
					label: true,
					hexColor: true,
					sortOrder: true,
					attribute: { select: { id: true, code: true, name: true, sortOrder: true } },
				},
			},
		},
	},
} satisfies Prisma.ProductVariantSelect

type VariantRow = Prisma.ProductVariantGetPayload<{ select: typeof variantSelect }>

const attributeValuesOf = (v: VariantRow) =>
	v.attributeValues
		.map(({ attributeValue: av }) => ({
			attributeId: av.attribute.id,
			attributeCode: av.attribute.code,
			attributeName: av.attribute.name,
			attributeSortOrder: av.attribute.sortOrder,
			valueId: av.id,
			code: av.code,
			label: av.label,
			hexColor: av.hexColor,
			sortOrder: av.sortOrder,
		}))
		.sort((a, b) => a.attributeSortOrder - b.attributeSortOrder || a.attributeName.localeCompare(b.attributeName))

/**
 * The attributes the active variants vary by, each with only the values in use.
 * This is what the PDP variant picker renders.
 */
const optionsOf = (variants: VariantRow[]) => {
	const byAttribute = new Map<
		string,
		{ id: string; code: string; name: string; sortOrder: number; values: Map<string, ReturnType<typeof attributeValuesOf>[number]> }
	>()
	for (const v of variants) {
		for (const av of attributeValuesOf(v)) {
			const entry = byAttribute.get(av.attributeId) ?? {
				id: av.attributeId,
				code: av.attributeCode,
				name: av.attributeName,
				sortOrder: av.attributeSortOrder,
				values: new Map(),
			}
			entry.values.set(av.valueId, av)
			byAttribute.set(av.attributeId, entry)
		}
	}
	return [...byAttribute.values()]
		.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
		.map(({ values, ...attribute }) => ({
			...attribute,
			values: [...values.values()]
				.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
				.map(({ valueId, code, label, hexColor }) => ({ id: valueId, code, label, hexColor })),
		}))
}

const detailSelect = {
	id: true,
	name: true,
	slug: true,
	badge: true,
	typeLabel: true,
	shortDescription: true,
	description: true,
	isFeatured: true,
	metaTitle: true,
	metaDescription: true,
	publishedAt: true,
	featuredAsset: { select: assetSelect },
	images: { orderBy: { sortOrder: "asc" }, select: { alt: true, sortOrder: true, asset: { select: assetSelect } } },
	variants: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: variantSelect },
	specs: { orderBy: { sortOrder: "asc" }, select: { id: true, group: true, label: true, value: true, sortOrder: true } },
	categories: visibleCategories,
	related: {
		where: { related: { status: "PUBLISHED" } },
		orderBy: { sortOrder: "asc" },
		select: { related: { select: cardSelect } },
	},
} satisfies Prisma.ProductSelect

const adminSelect = {
	...detailSelect,
	status: true,
	sortOrder: true,
	featuredAssetId: true,
	createdAt: true,
	updatedAt: true,
	images: { orderBy: { sortOrder: "asc" }, select: { assetId: true, alt: true, sortOrder: true, asset: { select: assetSelect } } },
	// Inactive ones too: the editor shows every variant.
	variants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: variantSelect },
	categories: { select: { category: { select: { id: true, name: true, slug: true, isHidden: true } } } },
	related: {
		orderBy: { sortOrder: "asc" },
		select: { related: { select: { id: true, name: true, slug: true, status: true } } },
	},
} satisfies Prisma.ProductSelect

const toVariant = (v: VariantRow) => ({
	id: v.id,
	sku: v.sku,
	price: money(v.price),
	compareAtPrice: moneyOrNull(v.compareAtPrice),
	weightKg: v.weightKg ? v.weightKg.toFixed(3) : null,
	isDefault: v.isDefault,
	sortOrder: v.sortOrder,
	image: toImageOrNull(v.image),
	attributes: attributeValuesOf(v).map(({ attributeId, attributeCode, attributeName, valueId, code, label, hexColor }) => ({
		attributeId,
		attributeCode,
		attributeName,
		valueId,
		code,
		label,
		hexColor,
	})),
})

const toPublicVariant = (v: VariantRow) => ({
	...toVariant(v),
	inStock: isInStock(v),
	// Untracked stock has no meaningful count.
	stock: v.manageStock ? v.stock : null,
	allowBackorder: v.allowBackorder,
})

const toAdminVariant = (v: VariantRow) => ({
	...toVariant(v),
	manageStock: v.manageStock,
	stock: v.stock,
	allowBackorder: v.allowBackorder,
	isActive: v.isActive,
	imageAssetId: v.imageAssetId,
	attributeValueIds: v.attributeValues.map((a) => a.attributeValue.id),
})

// ─── Storefront ──────────────────────────────────────────────────────────────

const PUBLISHED = "PUBLISHED" as const

/**
 * Published products that have at least one active variant (nothing else can
 * be bought). Price and attribute filters must be met by the same variant.
 */
const list = async (query: ProductListQuery) => {
	const { page, limit, sort, search, category, featured, minPrice, maxPrice, ...rest } = query
	const pagination = { page, limit }
	const attributeFilters = parseAttributeFilters(rest)

	let categoryIds: string[] | undefined
	if (category) {
		const nodes = await prisma.category.findMany({
			where: { isHidden: false },
			select: { id: true, parentId: true, slug: true },
		})
		const root = nodes.find((n) => n.slug === category)
		categoryIds = root ? descendantIds(root.id, nodes) : []
		if (categoryIds.length === 0) return { data: [], meta: toMeta(pagination, 0) }
	}

	const variantWhere: Prisma.ProductVariantWhereInput = {
		isActive: true,
		...(minPrice !== undefined || maxPrice !== undefined
			? {
					price: {
						...(minPrice !== undefined ? { gte: minPrice } : {}),
						...(maxPrice !== undefined ? { lte: maxPrice } : {}),
					},
				}
			: {}),
		...(attributeFilters.length
			? {
					AND: attributeFilters.map((f) => ({
						attributeValues: {
							some: { attributeValue: { code: { in: f.values }, attribute: { code: f.code } } },
						},
					})),
				}
			: {}),
	}

	const where: Prisma.ProductWhereInput = {
		status: PUBLISHED,
		variants: { some: variantWhere },
		...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
		...(featured !== undefined ? { isFeatured: featured } : {}),
		...(categoryIds ? { categories: { some: { categoryId: { in: categoryIds } } } } : {}),
	}

	if (sort === "price_asc" || sort === "price_desc") {
		// Prisma cannot order products by an aggregate of their variants, so the
		// page of ids comes from a groupBy on the variants ("from" price = cheapest
		// active variant), then the cards are loaded for those ids.
		const [groups, total] = await Promise.all([
			prisma.productVariant.groupBy({
				by: ["productId"],
				where: { isActive: true, product: where },
				_min: { price: true },
				orderBy: [{ _min: { price: sort === "price_asc" ? "asc" : "desc" } }, { productId: "asc" }],
				...toSkipTake(pagination),
			}),
			prisma.product.count({ where }),
		])
		const ids = groups.map((g) => g.productId)
		const rows = await prisma.product.findMany({ where: { id: { in: ids } }, select: cardSelect })
		const byId = new Map(rows.map((r) => [r.id, r]))
		const data = ids.flatMap((id) => {
			const row = byId.get(id)
			return row ? [toCard(row)] : []
		})
		return { data, meta: toMeta(pagination, total) }
	}

	const orderBy: Prisma.ProductOrderByWithRelationInput[] =
		sort === "name"
			? [{ name: "asc" }, { id: "asc" }]
			: sort === "featured"
				? [{ isFeatured: "desc" }, { sortOrder: "asc" }, { publishedAt: "desc" }, { id: "asc" }]
				: [{ publishedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }]

	const [rows, total] = await prisma.$transaction([
		prisma.product.findMany({ where, orderBy, select: cardSelect, ...toSkipTake(pagination) }),
		prisma.product.count({ where }),
	])

	return { data: rows.map(toCard), meta: toMeta(pagination, total) }
}

/** The full product page. Drafts and archived products are a 404. */
const getBySlug = async (slug: string) => {
	const row = await prisma.product.findFirst({ where: { slug, status: PUBLISHED }, select: detailSelect })
	if (!row) throw new ApiError(httpStatus.NOT_FOUND, "Product not found")

	const summary = summarizeVariants(
		row.variants.map((v) => ({
			price: money(v.price),
			compareAtPrice: moneyOrNull(v.compareAtPrice),
			manageStock: v.manageStock,
			stock: v.stock,
			isDefault: v.isDefault,
			isActive: true,
		}))
	)

	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		badge: row.badge,
		typeLabel: row.typeLabel,
		shortDescription: row.shortDescription,
		description: row.description,
		isFeatured: row.isFeatured,
		metaTitle: row.metaTitle,
		metaDescription: row.metaDescription,
		publishedAt: row.publishedAt,
		featuredImage: toImageOrNull(row.featuredAsset),
		images: row.images.map((i) => ({ ...toImage(i.asset, i.alt), sortOrder: i.sortOrder })),
		price: { min: summary.minPrice, max: summary.maxPrice },
		compareAtPrice: summary.compareAtPrice,
		inStock: summary.inStock,
		options: optionsOf(row.variants),
		variants: row.variants.map(toPublicVariant),
		specs: row.specs,
		categories: row.categories.map((c) => c.category),
		related: row.related.map((r) => toCard(r.related)),
	}
}

// ─── Admin reads ─────────────────────────────────────────────────────────────

const adminList = async (query: ProductAdminListQuery) => {
	const where: Prisma.ProductWhereInput = {
		...(query.status ? { status: query.status } : {}),
		...(query.featured !== undefined ? { isFeatured: query.featured } : {}),
		...(query.search
			? {
					OR: [
						{ name: { contains: query.search, mode: "insensitive" } },
						{ slug: { contains: query.search, mode: "insensitive" } },
						{ variants: { some: { sku: { contains: query.search, mode: "insensitive" } } } },
					],
				}
			: {}),
	}

	const [rows, total] = await prisma.$transaction([
		prisma.product.findMany({
			where,
			orderBy: [{ [query.sortBy]: query.sortOrder }, { id: "asc" }],
			select: {
				id: true,
				name: true,
				slug: true,
				status: true,
				isFeatured: true,
				sortOrder: true,
				publishedAt: true,
				createdAt: true,
				updatedAt: true,
				featuredAsset: { select: assetSelect },
				images: { orderBy: { sortOrder: "asc" }, take: 1, select: { asset: { select: assetSelect } } },
				categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
				variants: {
					select: { price: true, compareAtPrice: true, manageStock: true, stock: true, isActive: true, isDefault: true },
				},
			},
			...toSkipTake(query),
		}),
		prisma.product.count({ where }),
	])

	const data = rows.map(({ variants, featuredAsset, images, categories, ...product }) => {
		const summary = summarizeVariants(
			variants.map((v) => ({ ...v, price: money(v.price), compareAtPrice: moneyOrNull(v.compareAtPrice) }))
		)
		return {
			...product,
			featuredImage: toImageOrNull(featuredAsset ?? images[0]?.asset),
			categories: categories.map((c) => c.category),
			price: { min: summary.minPrice, max: summary.maxPrice },
			inStock: summary.inStock,
			variantCount: variants.length,
			// Only tracked stock adds up to a meaningful number.
			totalStock: variants.reduce((sum, v) => sum + (v.manageStock ? v.stock : 0), 0),
		}
	})

	return { data, meta: toMeta(query, total) }
}

const adminGet = async (id: string) => {
	const row = await prisma.product.findUnique({ where: { id }, select: adminSelect })
	if (!row) throw new ApiError(httpStatus.NOT_FOUND, "Product not found")

	return {
		...row,
		featuredImage: toImageOrNull(row.featuredAsset),
		featuredAsset: undefined,
		images: row.images.map((i) => ({ assetId: i.assetId, alt: i.alt, sortOrder: i.sortOrder, asset: toImage(i.asset) })),
		variants: row.variants.map(toAdminVariant),
		categories: row.categories.map((c) => c.category),
		categoryIds: row.categories.map((c) => c.category.id),
		related: row.related.map((r) => r.related),
		relatedIds: row.related.map((r) => r.related.id),
	}
}

// ─── Admin writes ────────────────────────────────────────────────────────────

const unwrap = <T>(result: RuleResult<T>): T => {
	if (!result.ok) throw new ApiError(httpStatus.BAD_REQUEST, result.error)
	return result.value
}

const unique = (ids: (string | null | undefined)[]): string[] => [...new Set(ids.filter((id): id is string => !!id))]

/** An explicit slug must be free; a derived one gets a numeric suffix until it is. */
const resolveSlug = async (payload: { name?: string; slug?: string }, excludeId?: string) => {
	const isTaken = async (slug: string) =>
		(await prisma.product.findFirst({
			where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
			select: { id: true },
		})) !== null

	if (payload.slug) {
		const slug = slugify(payload.slug)
		if (!slug) throw new ApiError(httpStatus.BAD_REQUEST, "The slug needs at least one letter or digit")
		if (await isTaken(slug)) throw new ApiError(httpStatus.CONFLICT, `The slug "${slug}" is already used`)
		return slug
	}
	return uniqueSlug(payload.name ?? "product", isTaken)
}

/**
 * Checked up front so the admin gets a 400 naming the problem instead of a
 * foreign-key error from the middle of the transaction.
 */
const assertReferences = async (refs: {
	categoryIds?: string[]
	relatedIds?: string[]
	assetIds: (string | null | undefined)[]
}) => {
	const categoryIds = unique(refs.categoryIds ?? [])
	const relatedIds = unique(refs.relatedIds ?? [])
	const assetIds = unique(refs.assetIds)

	const [categories, related, assets] = await Promise.all([
		categoryIds.length ? prisma.category.count({ where: { id: { in: categoryIds } } }) : 0,
		relatedIds.length ? prisma.product.count({ where: { id: { in: relatedIds } } }) : 0,
		assetIds.length ? prisma.asset.count({ where: { id: { in: assetIds } } }) : 0,
	])

	if (categories !== categoryIds.length) throw new ApiError(httpStatus.BAD_REQUEST, "One or more categories do not exist")
	if (related !== relatedIds.length) throw new ApiError(httpStatus.BAD_REQUEST, "One or more related products do not exist")
	if (assets !== assetIds.length) throw new ApiError(httpStatus.BAD_REQUEST, "One or more images do not exist")
}

type ExistingVariant = {
	id: string
	sku: string | null
	compareAtPrice: Prisma.Decimal | null
	isDefault: boolean
	attributeValues: { attributeValueId: string }[]
}

type MergedVariant = Omit<VariantInput, "sku" | "attributeValueIds" | "isDefault"> & {
	sku: string | null
	isDefault: boolean
	attributeValueIds: string[]
}

type PreparedVariant = NormalizedVariant<MergedVariant>

/**
 * Fills fields an update left out from the stored variant (a missing field
 * means "unchanged"), then runs the variant rules on the complete list.
 */
const prepareVariants = async (
	inputs: VariantInput[],
	existing: ExistingVariant[] = [],
	productId?: string
): Promise<PreparedVariant[]> => {
	const existingById = new Map(existing.map((v) => [v.id, v]))
	const seenIds = new Set<string>()
	// When the payload names a default, unflagged variants are not the default,
	// whatever they were before.
	const namesDefault = inputs.some((v) => v.isDefault === true)

	const merged: MergedVariant[] = inputs.map((v) => {
		const current = v.id ? existingById.get(v.id) : undefined
		if (v.id) {
			if (!current) throw new ApiError(httpStatus.BAD_REQUEST, `Variant ${v.id} does not belong to this product`)
			if (seenIds.has(v.id)) throw new ApiError(httpStatus.BAD_REQUEST, `Variant ${v.id} is listed twice`)
			seenIds.add(v.id)
		}
		return {
			...v,
			sku: v.sku !== undefined ? v.sku : (current?.sku ?? null),
			compareAtPrice: v.compareAtPrice !== undefined ? v.compareAtPrice : moneyOrNull(current?.compareAtPrice ?? null),
			isDefault: namesDefault ? v.isDefault === true : (v.isDefault ?? current?.isDefault ?? false),
			attributeValueIds: v.attributeValueIds ?? current?.attributeValues.map((a) => a.attributeValueId) ?? [],
		}
	})

	const valueIds = unique(merged.flatMap((v) => v.attributeValueIds))
	const values = valueIds.length
		? await prisma.attributeValue.findMany({ where: { id: { in: valueIds } }, select: { id: true, attributeId: true } })
		: []
	const variants = unwrap(normalizeVariants(merged, new Map(values.map((v) => [v.id, v.attributeId]))))

	const skus = unique(variants.map((v) => v.sku))
	if (skus.length) {
		const clash = await prisma.productVariant.findFirst({
			where: { sku: { in: skus }, ...(productId ? { productId: { not: productId } } : {}) },
			select: { sku: true, product: { select: { name: true } } },
		})
		if (clash) throw new ApiError(httpStatus.CONFLICT, `SKU ${clash.sku} is already used by "${clash.product.name}"`)
	}

	return variants
}

const newVariantData = (v: PreparedVariant, index: number) => ({
	sku: v.sku,
	price: v.price,
	compareAtPrice: v.compareAtPrice ?? null,
	stock: v.stock ?? 0,
	manageStock: v.manageStock ?? true,
	allowBackorder: v.allowBackorder ?? false,
	weightKg: v.weightKg ?? null,
	imageAssetId: v.imageAssetId ?? null,
	isDefault: v.isDefault,
	isActive: v.isActive ?? true,
	sortOrder: v.sortOrder ?? index,
	attributeValues: { create: v.attributeValueIds.map((attributeValueId) => ({ attributeValueId })) },
})

/** Undefined fields are left as they are. The payload order becomes the sort order unless given. */
const variantPatch = (v: PreparedVariant, index: number) => ({
	sku: v.sku,
	price: v.price,
	compareAtPrice: v.compareAtPrice ?? null,
	stock: v.stock,
	manageStock: v.manageStock,
	allowBackorder: v.allowBackorder,
	weightKg: v.weightKg,
	imageAssetId: v.imageAssetId,
	isDefault: v.isDefault,
	isActive: v.isActive,
	sortOrder: v.sortOrder ?? index,
	attributeValues: {
		deleteMany: {},
		create: v.attributeValueIds.map((attributeValueId) => ({ attributeValueId })),
	},
})

/** Removed variants are deleted, listed ones updated, new ones created. */
const syncVariants = async (
	tx: Prisma.TransactionClient,
	productId: string,
	existing: ExistingVariant[],
	variants: PreparedVariant[]
) => {
	const keepIds = unique(variants.map((v) => v.id))
	await tx.productVariant.deleteMany({ where: { productId, id: { notIn: keepIds } } })

	// SKUs can move between variants of this product (a swap, or a renamed
	// variant handing its old SKU to a new one). Release the changing ones
	// first so the unique index never sees a duplicate mid-save.
	const currentSku = new Map(existing.map((v) => [v.id, v.sku]))
	const changing = variants.flatMap((v) =>
		v.id && currentSku.get(v.id) !== null && currentSku.get(v.id) !== v.sku ? [v.id] : []
	)
	if (changing.length) await tx.productVariant.updateMany({ where: { id: { in: changing } }, data: { sku: null } })

	for (const [index, v] of variants.entries()) {
		if (v.id) await tx.productVariant.update({ where: { id: v.id }, data: variantPatch(v, index) })
		else await tx.productVariant.create({ data: { ...newVariantData(v, index), productId } })
	}
}

/** Each list that is given replaces the stored set; the array order is the default sort order. */
const writeLists = async (
	tx: Prisma.TransactionClient,
	productId: string,
	lists: Pick<Partial<ProductInput>, "categoryIds" | "images" | "specs" | "relatedIds">
) => {
	if (lists.categoryIds) {
		await tx.productCategory.deleteMany({ where: { productId } })
		await tx.productCategory.createMany({
			data: unique(lists.categoryIds).map((categoryId) => ({ productId, categoryId })),
		})
	}
	if (lists.images) {
		await tx.productImage.deleteMany({ where: { productId } })
		await tx.productImage.createMany({
			data: lists.images.map((image, i) => ({
				productId,
				assetId: image.assetId,
				alt: image.alt ?? null,
				sortOrder: image.sortOrder ?? i,
			})),
		})
	}
	if (lists.specs) {
		await tx.productSpec.deleteMany({ where: { productId } })
		await tx.productSpec.createMany({
			data: lists.specs.map((spec, i) => ({
				productId,
				group: spec.group ?? null,
				label: spec.label,
				value: spec.value,
				sortOrder: spec.sortOrder ?? i,
			})),
		})
	}
	if (lists.relatedIds) {
		await tx.relatedProduct.deleteMany({ where: { productId } })
		await tx.relatedProduct.createMany({
			data: lists.relatedIds.map((relatedId, i) => ({ productId, relatedId, sortOrder: i })),
		})
	}
}

const assetIdsOf = (payload: Partial<ProductInput>, variants: PreparedVariant[] = []) => [
	payload.featuredAssetId,
	...(payload.images ?? []).map((i) => i.assetId),
	...variants.map((v) => v.imageAssetId),
]

const TX_OPTIONS = { timeout: 15_000 }

// TODO(M5): sanitize rich text (description) before it is stored.
const create = async (payload: ProductInput) => {
	const { categoryIds, images, specs, relatedIds: rawRelated, variants: rawVariants, slug: rawSlug, ...base } = payload

	const variants = await prepareVariants(rawVariants)
	const relatedIds = unwrap(normalizeRelatedIds(undefined, rawRelated))
	await assertReferences({ categoryIds, relatedIds, assetIds: assetIdsOf(payload, variants) })
	const slug = await resolveSlug({ name: payload.name, slug: rawSlug })
	const status = payload.status ?? "DRAFT"

	const product = await prisma.$transaction(async (tx) => {
		const created = await tx.product.create({
			data: { ...base, slug, status, publishedAt: resolvePublishedAt(status, null) },
		})
		await writeLists(tx, created.id, { categoryIds, images, specs, relatedIds })
		for (const [index, v] of variants.entries()) {
			await tx.productVariant.create({ data: { ...newVariantData(v, index), productId: created.id } })
		}
		return created
	}, TX_OPTIONS)

	return adminGet(product.id)
}

/** Renaming keeps the slug (URLs stay stable); send `slug` to change it. */
const update = async (id: string, payload: ProductUpdateInput) => {
	const existing = await prisma.product.findUnique({
		where: { id },
		select: {
			status: true,
			publishedAt: true,
			variants: {
				select: {
					id: true,
					sku: true,
					compareAtPrice: true,
					isDefault: true,
					attributeValues: { select: { attributeValueId: true } },
				},
			},
		},
	})
	if (!existing) throw new ApiError(httpStatus.NOT_FOUND, "Product not found")

	const { categoryIds, images, specs, relatedIds: rawRelated, variants: rawVariants, slug: rawSlug, ...base } = payload

	const variants = rawVariants ? await prepareVariants(rawVariants, existing.variants, id) : undefined
	const relatedIds = rawRelated ? unwrap(normalizeRelatedIds(id, rawRelated)) : undefined
	await assertReferences({ categoryIds, relatedIds, assetIds: assetIdsOf(payload, variants) })
	const slug = rawSlug !== undefined ? await resolveSlug({ slug: rawSlug }, id) : undefined
	const publishedAt = resolvePublishedAt(payload.status ?? existing.status, existing.publishedAt)

	await prisma.$transaction(async (tx) => {
		await tx.product.update({ where: { id }, data: { ...base, ...(slug ? { slug } : {}), publishedAt } })
		await writeLists(tx, id, { categoryIds, images, specs, relatedIds })
		if (variants) await syncVariants(tx, id, existing.variants, variants)
	}, TX_OPTIONS)

	return adminGet(id)
}

/** Variants, images, specs and links cascade with the product. */
const remove = async (id: string) => {
	const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
	if (!product) throw new ApiError(httpStatus.NOT_FOUND, "Product not found")
	await prisma.product.delete({ where: { id } })
}

export const ProductService = { list, getBySlug, adminList, adminGet, create, update, remove }
