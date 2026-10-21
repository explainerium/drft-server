import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "../../config"
import type { StorageDriver } from "./types"

/**
 * Any S3-compatible bucket: Neon Object Storage in production, Cloudflare R2
 * works the same way (endpoint https://<account>.r2.cloudflarestorage.com,
 * region "auto", plus S3_PUBLIC_URL for its public domain).
 *
 * The client is created on first use, so a deployment that never touches
 * storage does not need the credentials to boot (env.ts still insists on them
 * in production when STORAGE_DRIVER=s3).
 *
 * Browser uploads with presigned URLs need a CORS rule on the bucket allowing
 * PUT from the storefront origin with the Content-Type header.
 */
const PRESIGN_TTL_SECONDS = 10 * 60

let client: S3Client | null = null

const s3 = (): S3Client => {
	if (client) return client

	const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env
	if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
		throw new Error("STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY")
	}

	client = new S3Client({
		region: env.S3_REGION,
		endpoint: S3_ENDPOINT,
		credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
		// Neon only understands path-style URLs (endpoint/bucket/key); R2 accepts them too.
		forcePathStyle: true,
		// Otherwise the SDK adds checksum parameters to presigned PUTs that the browser cannot match.
		requestChecksumCalculation: "WHEN_REQUIRED",
	})
	return client
}

const bucket = (): string => {
	if (!env.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET")
	return env.S3_BUCKET
}

/** S3_PUBLIC_URL when set (a CDN or custom domain), else the bucket's path-style URL (a public Neon bucket). */
const publicBase = (): string =>
	(env.S3_PUBLIC_URL ?? `${(env.S3_ENDPOINT ?? "").replace(/\/+$/, "")}/${env.S3_BUCKET ?? ""}`).replace(/\/+$/, "")

export const s3Driver: StorageDriver = {
	name: "s3",

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
		return `${publicBase()}/${key}`
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
