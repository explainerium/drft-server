import { z } from "zod"
import { IMAGE_TYPES, type ImageMime } from "../../../domain/media/image"
import { paginationQuery } from "../../../shared/pagination"
import { UNFILED } from "./media.constant"

const idParams = z.object({ id: z.uuid() })

/** Multipart fields arrive as strings; "" means "none". */
const formFolderId = z
	.union([z.literal(""), z.uuid()])
	.optional()
	.transform((v) => v || null)

const imageMime = z.enum(Object.keys(IMAGE_TYPES) as [ImageMime, ...ImageMime[]], {
	error: "Only JPEG, PNG, WebP, AVIF, GIF and SVG images are accepted",
})

const listSchema = z.object({
	query: z.object({
		...paginationQuery,
		sortBy: z.enum(["createdAt", "originalName", "sizeBytes"]).default("createdAt"),
		folderId: z.union([z.uuid(), z.literal(UNFILED)]).optional(),
		search: z.string().trim().max(100).optional(),
		// A prefix such as "image/" or "image/svg".
		mimeType: z
			.string()
			.trim()
			.max(50)
			.regex(/^[a-z]+(\/[a-z0-9.+-]*)?$/, "Use a MIME type prefix such as image/png")
			.optional(),
	}),
})

const getSchema = z.object({ params: idParams })

const uploadSchema = z.object({
	body: z.object({
		folderId: formFolderId,
		alt: z.string().trim().max(250).optional(),
	}),
})

const updateSchema = z.object({
	params: idParams,
	body: z
		.object({
			alt: z.string().trim().max(250).nullable(),
			folderId: z.uuid().nullable(),
		})
		.partial()
		.refine((body) => Object.keys(body).length > 0, "Nothing to update"),
})

const presignSchema = z.object({
	body: z.object({
		originalName: z.string().trim().min(1).max(255),
		contentType: imageMime,
		sizeBytes: z.number().int().positive(),
	}),
})

const completeSchema = z.object({
	body: z.object({
		uploadToken: z.string().min(1).max(4000),
		folderId: z.uuid().nullable().optional(),
		alt: z.string().trim().max(250).optional(),
	}),
})

const folderBody = z.object({
	name: z.string().trim().min(1).max(100),
	parentId: z.uuid().nullable(),
	sortOrder: z.number().int().min(0).max(100_000),
})

const createFolderSchema = z.object({
	body: folderBody.partial({ parentId: true, sortOrder: true }),
})

const updateFolderSchema = z.object({
	params: idParams,
	body: folderBody.partial().refine((body) => Object.keys(body).length > 0, "Nothing to update"),
})

export const MediaValidation = {
	listSchema,
	getSchema,
	uploadSchema,
	updateSchema,
	presignSchema,
	completeSchema,
	createFolderSchema,
	updateFolderSchema,
}
