import crypto from "crypto"

/**
 * Ties a presigned upload to its later "complete" call.
 *
 * The presign endpoint picks the key, type and size; the token carries them,
 * signed, so "complete" cannot be pointed at an arbitrary object in the bucket
 * or claim a different size. Format: base64url(JSON payload) + "." + HMAC.
 */
export interface UploadTokenPayload {
	key: string
	contentType: string
	sizeBytes: number
	originalName: string
	userId: string
	/** Unix seconds. */
	exp: number
}

const DOMAIN = "drft-media-upload:"

const mac = (secret: string, body: string) =>
	crypto.createHmac("sha256", secret).update(DOMAIN + body).digest("base64url")

export const signUploadToken = (secret: string, payload: UploadTokenPayload): string => {
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
	return `${body}.${mac(secret, body)}`
}

/** The payload when the signature is valid and not expired, otherwise null. */
export const verifyUploadToken = (secret: string, token: string, now = new Date()): UploadTokenPayload | null => {
	const [body, signature, extra] = token.split(".")
	if (!body || !signature || extra !== undefined) return null

	const expected = Buffer.from(mac(secret, body))
	const given = Buffer.from(signature)
	if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null

	let payload: UploadTokenPayload
	try {
		payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadTokenPayload
	} catch {
		return null
	}

	if (typeof payload.exp !== "number" || payload.exp * 1000 <= now.getTime()) return null
	return payload
}
