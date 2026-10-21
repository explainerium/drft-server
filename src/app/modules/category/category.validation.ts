import { z } from "zod"

const idParams = z.object({ id: z.uuid() })

const category = z.object({
	name: z.string().trim().min(1).max(120),
	// Derived from the name when left out.
	slug: z.string().trim().min(1).max(120).optional(),
	parentId: z.uuid().nullish(),
	// Plain text: the shop header shows it as a paragraph.
	description: z.string().trim().max(2_000).nullish(),
	imageAssetId: z.uuid().nullish(),
	sortOrder: z.number().int().min(0).max(1_000_000).optional(),
	isHidden: z.boolean().optional(),
	metaTitle: z.string().trim().max(160).nullish(),
	metaDescription: z.string().trim().max(320).nullish(),
})

const slugSchema = z.object({ params: z.object({ slug: z.string().trim().min(1).max(160) }) })

const idSchema = z.object({ params: idParams })

const createSchema = z.object({ body: category })

const updateSchema = z.object({
	params: idParams,
	body: category.partial().refine((body) => Object.keys(body).length > 0, "Nothing to update"),
})

export const CategoryValidation = { slugSchema, idSchema, createSchema, updateSchema }
export type CategoryInput = z.infer<typeof category>
