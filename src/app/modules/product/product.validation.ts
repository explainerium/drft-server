import { z } from "zod"
import { productContentSchema } from "../../../domain/catalog/productContent"
import { sanitizeRichText } from "../../../domain/catalog/richText"
import { MONEY_PATTERN } from "../../../domain/catalog/variantRules"
import { paginationQuery } from "../../../shared/pagination"

const idParams = z.object({ id: z.uuid() })

/** A number or a string, at most 2 decimals, ≥ 0. Normalised to a string so it never passes through a float again. */
const money = z
	.union([z.number(), z.string().trim()])
	.transform((v) => String(v))
	.refine((v) => MONEY_PATTERN.test(v), "Enter an amount of 0 or more with at most 2 decimals")

/** Decimal(10, 3). */
const weight = z
	.union([z.number(), z.string().trim()])
	.transform((v) => String(v))
	.refine((v) => /^\d{1,7}(\.\d{1,3})?$/.test(v), "Enter a weight of 0 or more with at most 3 decimals")

const sortOrder = z.number().int().min(0).max(1_000_000)

const status = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"])

/**
 * Optional fields on purpose: for an existing variant (`id` given) a missing
 * field means "unchanged", not "reset to the default". Defaults for new
 * variants are applied by the service.
 */
const variant = z.object({
	id: z.uuid().optional(),
	sku: z
		.string()
		.trim()
		.max(64)
		.nullish()
		.transform((v) => (v ? v : v === undefined ? undefined : null)),
	price: money,
	compareAtPrice: money.nullish(),
	stock: z.number().int().min(0).max(1_000_000).optional(),
	manageStock: z.boolean().optional(),
	allowBackorder: z.boolean().optional(),
	weightKg: weight.nullish(),
	imageAssetId: z.uuid().nullish(),
	isDefault: z.boolean().optional(),
	isActive: z.boolean().optional(),
	sortOrder: sortOrder.optional(),
	attributeValueIds: z.array(z.uuid()).max(10).optional(),
})

const image = z.object({
	assetId: z.uuid(),
	alt: z.string().trim().max(200).nullish(),
	sortOrder: sortOrder.optional(),
})

const spec = z.object({
	group: z.string().trim().max(80).nullish(),
	label: z.string().trim().min(1).max(120),
	value: z.string().trim().min(1).max(500),
	sortOrder: sortOrder.optional(),
})

/** Text in another language; empty fields fall back to the German ones. */
const productTranslation = z
	.object({
		name: z.string().trim().max(160),
		badge: z.string().trim().max(40),
		typeLabel: z.string().trim().max(60),
		shortDescription: z.string().trim().max(1_000),
		description: z
			.string()
			.max(100_000)
			.transform((v) => sanitizeRichText(v) ?? ""),
		metaTitle: z.string().trim().max(160),
		metaDescription: z.string().trim().max(320),
		content: productContentSchema,
	})
	.partial()

const uniqueAssets = (images: { assetId: string }[]) => new Set(images.map((i) => i.assetId)).size === images.length

const product = z.object({
	name: z.string().trim().min(1).max(160),
	// Derived from the name when left out.
	slug: z.string().trim().min(1).max(120).optional(),
	status: status.optional(),
	// Short label on the card image ("Freeride") and the line above the name ("Freeride kite").
	badge: z.string().trim().max(40).nullish(),
	typeLabel: z.string().trim().max(60).nullish(),
	shortDescription: z.string().trim().max(1_000).nullish(),
	// HTML from the admin editor, reduced to its own formatting before it is stored.
	description: z
		.string()
		.max(100_000)
		.nullish()
		.transform((v) => (v === undefined ? undefined : sanitizeRichText(v))),
	content: productContentSchema.nullish(),
	translations: z.object({ en: productTranslation }).partial().nullish(),
	featuredAssetId: z.uuid().nullish(),
	isFeatured: z.boolean().optional(),
	sortOrder: sortOrder.optional(),
	metaTitle: z.string().trim().max(160).nullish(),
	metaDescription: z.string().trim().max(320).nullish(),

	// Each list below, when sent, is the complete new set (replaced, not merged).
	categoryIds: z.array(z.uuid()).max(50),
	images: z.array(image).max(50).refine(uniqueAssets, "The same image is listed twice"),
	specs: z.array(spec).max(200),
	relatedIds: z.array(z.uuid()).max(24),
	// Variants left out of an update are deleted.
	variants: z.array(variant).min(1, "A product needs at least one variant").max(250),
})

const createSchema = z.object({
	body: product.extend({
		categoryIds: product.shape.categoryIds.default([]),
		images: product.shape.images.default([]),
		specs: product.shape.specs.default([]),
		relatedIds: product.shape.relatedIds.default([]),
	}),
})

const updateSchema = z.object({
	params: idParams,
	body: product.partial().refine((body) => Object.keys(body).length > 0, "Nothing to update"),
})

const idSchema = z.object({ params: idParams })

const importSchema = z.object({
	body: z.object({
		csv: z.string().min(1, "The file is empty").max(900_000, "The file is too large (900 KB at most, about 5000 rows)"),
		// false: only check and report; true: save when every row is valid.
		apply: z.boolean().default(false),
	}),
})

const slugSchema = z.object({ params: z.object({ slug: z.string().trim().min(1).max(160) }) })

const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1")

/**
 * Storefront list. Unknown keys are attribute filters (`?size=9m,10m&color=black`),
 * so the object is a catchall rather than strict.
 */
const listSchema = z.object({
	query: z
		.object({
			page: paginationQuery.page,
			limit: paginationQuery.limit,
			sort: z.enum(["featured", "newest", "price_asc", "price_desc", "name"]).default("featured"),
			search: z.string().trim().min(1).max(100).optional(),
			category: z.string().trim().min(1).max(160).optional(),
			featured: flag.optional(),
			minPrice: money.optional(),
			maxPrice: money.optional(),
		})
		.catchall(z.union([z.string().max(200), z.array(z.string().max(200)).max(20)])),
})

const adminListSchema = z.object({
	query: z.object({
		...paginationQuery,
		sortBy: z.enum(["createdAt", "updatedAt", "name", "sortOrder"]).default("createdAt"),
		search: z.string().trim().min(1).max(100).optional(),
		status: status.optional(),
		featured: flag.optional(),
	}),
})

export const ProductValidation = {
	listSchema,
	slugSchema,
	adminListSchema,
	idSchema,
	createSchema,
	updateSchema,
	importSchema,
}

export type VariantInput = z.infer<typeof variant>
export type ProductInput = z.infer<typeof createSchema>["body"]
export type ProductUpdateInput = z.infer<typeof updateSchema>["body"]
export type ProductListQuery = z.infer<typeof listSchema>["query"]
export type ProductAdminListQuery = z.infer<typeof adminListSchema>["query"]
