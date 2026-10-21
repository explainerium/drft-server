import crypto from "crypto"
import type { Asset, Prisma } from "@prisma/client"
import { env } from "../../../config"
import {
	buildAssetKey,
	derivativeKey,
	isIssuedAssetKey,
	readDerivatives,
	type Derivatives,
	type ImageMime,
} from "../../../domain/media/image"
import { describeAssetUsage } from "../../../domain/media/usage"
import { signUploadToken, verifyUploadToken } from "../../../domain/media/uploadToken"
import { storage } from "../../../helpers/storage"
import httpStatus from "../../../shared/httpStatus"
import { logger } from "../../../shared/logger"
import { toMeta, toSkipTake } from "../../../shared/pagination"
import { prisma } from "../../../shared/prisma"
import ApiError from "../../errors/ApiError"
import { MAX_DIRECT_UPLOAD_BYTES, megabytes, UNFILED, UPLOAD_TOKEN_TTL_SECONDS } from "./media.constant"
import { processImage } from "./media.image"

// ── View ─────────────────────────────────────────────────────────────────────

const toView = (row: Asset) => {
	const derivatives = readDerivatives(row.derivatives)
	return {
		id: row.id,
		url: storage.publicUrl(row.storageKey),
		storageKey: row.storageKey,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes,
		width: row.width,
		height: row.height,
		originalName: row.originalName,
		alt: row.alt,
		folderId: row.folderId,
		derivatives: Object.fromEntries(
			Object.entries(derivatives).map(([name, d]) => [name, { ...d, url: storage.publicUrl(d.key) }])
		),
		uploadedById: row.uploadedById,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

const keysOf = (row: Pick<Asset, "storageKey" | "derivatives">): string[] => [
	row.storageKey,
	...Object.values(readDerivatives(row.derivatives)).map((d) => d.key),
]

/** Best effort: a stray object costs storage, a thrown error here would hide the real one. */
const deleteKeys = async (keys: string[]): Promise<void> => {
	await Promise.all(
		keys.map((key) =>
			storage.delete(key).catch((err: unknown) => logger.warn({ err, key }, "could not delete stored media object"))
		)
	)
}

const assertFolder = async (folderId: string | null | undefined): Promise<void> => {
	if (!folderId) return
	const folder = await prisma.mediaFolder.findUnique({ where: { id: folderId }, select: { id: true } })
	if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Folder not found")
}

// ── Ingest (shared by upload and complete) ───────────────────────────────────

interface IngestInput {
	key: string
	buffer: Buffer
	declared: ImageMime
	originalName: string
	folderId?: string | null
	alt?: string | null
	uploadedById: string
	/** The original is already in storage (presigned upload); overwrite only if processing changed it. */
	originalStored: boolean
}

const ingest = async (input: IngestInput) => {
	const processed = await processImage(input.buffer, input.declared)
	const written: string[] = []

	try {
		if (!input.originalStored || !processed.unchanged) {
			await storage.put(input.key, processed.body, processed.mimeType)
		}
		written.push(input.key)

		const derivatives: Derivatives = {}
		for (const d of processed.derivatives) {
			const key = derivativeKey(input.key, d.name)
			await storage.put(key, d.body, "image/webp")
			written.push(key)
			derivatives[d.name] = { key, width: d.width, height: d.height }
		}

		const row = await prisma.asset.create({
			data: {
				storageKey: input.key,
				mimeType: processed.mimeType,
				sizeBytes: processed.body.byteLength,
				width: processed.width,
				height: processed.height,
				originalName: input.originalName.slice(0, 255),
				alt: input.alt || null,
				derivatives: derivatives as Prisma.InputJsonObject,
				folderId: input.folderId ?? null,
				uploadedById: input.uploadedById,
			},
		})
		return toView(row)
	} catch (error) {
		// A duplicate storageKey means a parallel "complete" won; its files are these files.
		if ((error as { code?: string }).code === "P2002") {
			throw new ApiError(httpStatus.CONFLICT, "This upload has already been completed")
		}
		await deleteKeys(input.originalStored ? [...new Set([input.key, ...written])] : written)
		throw error
	}
}

// ── Upload through the API ───────────────────────────────────────────────────

const upload = async (
	file: { buffer: Buffer; mimetype: string; originalname: string },
	opts: { folderId?: string | null; alt?: string | null; uploadedById: string }
) => {
	await assertFolder(opts.folderId)
	const declared = file.mimetype as ImageMime
	return ingest({
		key: buildAssetKey(declared, crypto.randomBytes(16).toString("hex")),
		buffer: file.buffer,
		declared,
		originalName: file.originalname,
		folderId: opts.folderId,
		alt: opts.alt,
		uploadedById: opts.uploadedById,
		originalStored: false,
	})
}

// ── Direct-to-storage upload: presign, then complete ─────────────────────────

const presign = async (
	payload: { originalName: string; contentType: ImageMime; sizeBytes: number },
	userId: string
) => {
	if (payload.sizeBytes > MAX_DIRECT_UPLOAD_BYTES) {
		throw new ApiError(httpStatus.PAYLOAD_TOO_LARGE, `Images are limited to ${megabytes(MAX_DIRECT_UPLOAD_BYTES)}`)
	}

	const key = buildAssetKey(payload.contentType, crypto.randomBytes(16).toString("hex"))
	const upload = await storage.presignPut(key, payload.contentType, payload.sizeBytes)
	const uploadToken = signUploadToken(env.JWT_ACCESS_SECRET, {
		key,
		contentType: payload.contentType,
		sizeBytes: payload.sizeBytes,
		originalName: payload.originalName,
		userId,
		exp: Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SECONDS,
	})

	return { key, uploadToken, upload }
}

const complete = async (
	payload: { uploadToken: string; folderId?: string | null; alt?: string | null },
	userId: string
) => {
	const token = verifyUploadToken(env.JWT_ACCESS_SECRET, payload.uploadToken)
	if (!token || token.userId !== userId || !isIssuedAssetKey(token.key)) {
		throw new ApiError(httpStatus.BAD_REQUEST, "The upload token is invalid or has expired")
	}

	const existing = await prisma.asset.findUnique({ where: { storageKey: token.key }, select: { id: true } })
	if (existing) throw new ApiError(httpStatus.CONFLICT, "This upload has already been completed")

	await assertFolder(payload.folderId)

	let buffer: Buffer
	try {
		buffer = await storage.get(token.key)
	} catch {
		throw new ApiError(httpStatus.BAD_REQUEST, "The file has not been uploaded yet")
	}

	// The bucket enforces the signed Content-Length; this is the second lock.
	if (buffer.byteLength !== token.sizeBytes || buffer.byteLength > MAX_DIRECT_UPLOAD_BYTES) {
		await deleteKeys([token.key])
		throw new ApiError(httpStatus.BAD_REQUEST, "The uploaded file does not match the declared size")
	}

	return ingest({
		key: token.key,
		buffer,
		declared: token.contentType as ImageMime,
		originalName: token.originalName,
		folderId: payload.folderId,
		alt: payload.alt,
		uploadedById: userId,
		originalStored: true,
	})
}

// ── Library ──────────────────────────────────────────────────────────────────

interface ListQuery {
	page: number
	limit: number
	sortOrder: "asc" | "desc"
	sortBy: "createdAt" | "originalName" | "sizeBytes"
	folderId?: string
	search?: string
	mimeType?: string
}

const list = async (query: ListQuery) => {
	const where: Prisma.AssetWhereInput = {
		...(query.folderId ? { folderId: query.folderId === UNFILED ? null : query.folderId } : {}),
		...(query.search ? { originalName: { contains: query.search, mode: "insensitive" } } : {}),
		...(query.mimeType ? { mimeType: { startsWith: query.mimeType } } : {}),
	}

	const [rows, total] = await prisma.$transaction([
		prisma.asset.findMany({ where, orderBy: { [query.sortBy]: query.sortOrder }, ...toSkipTake(query) }),
		prisma.asset.count({ where }),
	])

	return { data: rows.map(toView), meta: toMeta(query, total) }
}

const get = async (id: string) => {
	const row = await prisma.asset.findUnique({ where: { id } })
	if (!row) throw new ApiError(httpStatus.NOT_FOUND, "Asset not found")
	return toView(row)
}

const update = async (id: string, payload: { alt?: string | null; folderId?: string | null }) => {
	const row = await prisma.asset.findUnique({ where: { id }, select: { id: true } })
	if (!row) throw new ApiError(httpStatus.NOT_FOUND, "Asset not found")
	await assertFolder(payload.folderId)

	const updated = await prisma.asset.update({
		where: { id },
		data: {
			...(payload.alt !== undefined ? { alt: payload.alt || null } : {}),
			...(payload.folderId !== undefined ? { folderId: payload.folderId } : {}),
		},
	})
	return toView(updated)
}

/**
 * Refuses (409) while anything shows the image. ProductImage rows would
 * otherwise cascade away silently and the other references fall back to null.
 */
const remove = async (id: string): Promise<void> => {
	const keys = await prisma.$transaction(async (tx) => {
		const asset = await tx.asset.findUnique({
			where: { id },
			include: {
				_count: {
					select: { productImages: true, featuredFor: true, categoryImageFor: true, variantImageFor: true, postCovers: true },
				},
				postCovers: { take: 3, select: { title: true } },
				productImages: { take: 3, select: { product: { select: { name: true } } } },
				featuredFor: { take: 3, select: { name: true } },
				categoryImageFor: { take: 3, select: { name: true } },
				variantImageFor: { take: 3, select: { sku: true, product: { select: { name: true } } } },
			},
		})
		if (!asset) throw new ApiError(httpStatus.NOT_FOUND, "Asset not found")

		// The PDP story photo lives in the product's content JSON, not in a relation.
		const stories = await tx.product.findMany({
			where: { content: { path: ["story", "imageAssetId"], equals: id } },
			select: { name: true },
			take: 50,
		})
		const seo = await tx.setting.findUnique({ where: { key: "seo" } })
		const seoValue = seo?.value as { ogImageAssetId?: unknown } | null | undefined

		const usage = describeAssetUsage({
			productGalleries: { total: asset._count.productImages, names: asset.productImages.map((p) => p.product.name) },
			featuredProducts: { total: asset._count.featuredFor, names: asset.featuredFor.map((p) => p.name) },
			categories: { total: asset._count.categoryImageFor, names: asset.categoryImageFor.map((c) => c.name) },
			variants: {
				total: asset._count.variantImageFor,
				names: asset.variantImageFor.map((v) => (v.sku ? `${v.product.name} / ${v.sku}` : v.product.name)),
			},
			productStories: { total: stories.length, names: stories.map((p) => p.name) },
			postCovers: { total: asset._count.postCovers, names: asset.postCovers.map((p) => p.title) },
			settings: seoValue?.ogImageAssetId === id ? ["SEO default share image"] : [],
		})
		if (usage) throw new ApiError(httpStatus.CONFLICT, usage)

		await tx.asset.delete({ where: { id } })
		return keysOf(asset)
	})

	// After the commit: a failed file delete must not resurrect a deleted row.
	await deleteKeys(keys)
}

export const MediaService = { upload, presign, complete, list, get, update, remove }
