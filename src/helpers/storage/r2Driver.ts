import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "../../config"
import type { StorageDriver } from "./types"

/**
 * Cloudflare R2 through its S3 API.
 *
 * The client is created on first use, so a deployment that never touches
 * storage does not need the credentials to boot (env.ts still insists on them
 * in production when STORAGE_DRIVER=r2).
 *
 * Browser uploads with presigned URLs need a CORS rule on the bucket allowing
 * PUT from the storefront origin with the Content-Type header.
 */
const PRESIGN_TTL_SECONDS = 10 * 60

let client: S3Client | null = null

const s3 = (): S3Client => {
	if (client) return client

	const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env
	if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
		throw new Error("STORAGE_DRIVER=r2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY")
	}

	client = new S3Client({
		region: "auto",
		endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
	})
	return client
}

const bucket = (): string => {
	if (!env.R2_BUCKET) throw new Error("STORAGE_DRIVER=r2 needs R2_BUCKET")
	return env.R2_BUCKET
}

export const r2Driver: StorageDriver = {
	name: "r2",

	async put(key, body, contentType) {
		await s3().send(
			new PutObjectCommand({
				Bucket: bucket(),
				Key: key,
				Body: body,
				ContentType: contentType,
				// Keys are random and never reused, so the object can be cached forever.
				CacheControl: "public, max-age=31536000, immutable",
			})
		)
	},

	async get(key) {
		const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
		if (!result.Body) throw new Error(`Storage returned no body for ${key}`)
		return Buffer.from(await result.Body.transformToByteArray())
	},

	async delete(key) {
		await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
	},

	publicUrl(key) {
		// The bucket's custom domain (or r2.dev URL); env.ts requires it in production.
		return `${(env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "")}/${key}`
	},

	async presignPut(key, contentType, sizeBytes) {
		const command = new PutObjectCommand({
			Bucket: bucket(),
			Key: key,
			ContentType: contentType,
			ContentLength: sizeBytes,
		})
		const url = await getSignedUrl(s3(), command, {
			expiresIn: PRESIGN_TTL_SECONDS,
			// Both headers are signed, so the browser cannot swap the type or size.
			signableHeaders: new Set(["content-type", "content-length"]),
		})
		return {
			url,
			method: "PUT",
			// Content-Length is set by the browser from the body; it is listed so
			// non-browser clients know it must match.
			headers: { "Content-Type": contentType, "Content-Length": String(sizeBytes) },
			expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000),
		}
	},
}
