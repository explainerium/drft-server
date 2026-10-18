/**
 * Pure rules for stored images: accepted types, storage keys and derivative
 * sizes. No sharp, no storage, no database, so all of it is unit tested.
 */

/** Accepted upload types and the file extension each is stored under. */
export const IMAGE_TYPES = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/avif": "avif",
	"image/gif": "gif",
	"image/svg+xml": "svg",
} as const

export type ImageMime = keyof typeof IMAGE_TYPES

export const isImageMime = (value: string): value is ImageMime => Object.hasOwn(IMAGE_TYPES, value)

/**
 * The real type from sharp's `metadata().format`, never the client's claim.
 * AVIF is reported as "heif" with av1 compression by libvips (newer builds may
 * say "avif").
 */
export const mimeFromSharpFormat = (format?: string, compression?: string): ImageMime | null => {
	switch (format) {
		case "jpeg":
			return "image/jpeg"
		case "png":
			return "image/png"
		case "webp":
			return "image/webp"
		case "gif":
			return "image/gif"
		case "svg":
			return "image/svg+xml"
		case "avif":
			return "image/avif"
		case "heif":
			return compression === "av1" ? "image/avif" : null
		default:
			return null
	}
}

/**
 * WebP derivatives made at upload. R2 has no image transformation layer, so
 * every size the storefront uses must exist as a real object.
 */
export const DERIVATIVE_SIZES = [
	{ name: "thumb", width: 400 },
	{ name: "medium", width: 1024 },
	{ name: "large", width: 2048 },
] as const

export type DerivativeName = (typeof DERIVATIVE_SIZES)[number]["name"]

/**
 * Which derivatives to render for a source of `sourceWidth` pixels.
 *
 * Never upscales. Sizes the source is wider than are rendered at their target
 * width; the first size it is not wider than is rendered at the source's own
 * width (a WebP copy, no enlargement); larger sizes are skipped. So a 600px
 * image gets thumb@400 and medium@600, and no large. Clients fall back to the
 * largest derivative that exists.
 */
export const planDerivatives = (sourceWidth: number | null | undefined): { name: DerivativeName; width: number }[] => {
	if (!sourceWidth || !Number.isFinite(sourceWidth) || sourceWidth < 1) return []

	const plan: { name: DerivativeName; width: number }[] = []
	for (const size of DERIVATIVE_SIZES) {
		if (sourceWidth > size.width) {
			plan.push({ name: size.name, width: size.width })
		} else {
			plan.push({ name: size.name, width: Math.floor(sourceWidth) })
			break
		}
	}
	return plan
}

export interface DerivativeEntry {
	key: string
	width: number
	height: number
}

export type Derivatives = Partial<Record<DerivativeName, DerivativeEntry>>

/** Reads `Asset.derivatives` JSON defensively; malformed entries are dropped. */
export const readDerivatives = (json: unknown): Derivatives => {
	if (!json || typeof json !== "object" || Array.isArray(json)) return {}

	const out: Derivatives = {}
	for (const { name } of DERIVATIVE_SIZES) {
		const entry = (json as Record<string, unknown>)[name] as Partial<DerivativeEntry> | undefined
		if (
			entry &&
			typeof entry.key === "string" &&
			typeof entry.width === "number" &&
			typeof entry.height === "number"
		) {
			out[name] = { key: entry.key, width: entry.width, height: entry.height }
		}
	}
	return out
}

/** Keys the API issues: random, never derived from the uploaded filename. */
const ISSUED_KEY = /^images\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(jpg|png|webp|avif|gif|svg)$/

export const buildAssetKey = (mime: ImageMime, randomHex: string, now = new Date()): string => {
	const yyyy = now.getUTCFullYear()
	const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
	return `images/${yyyy}/${mm}/${randomHex}.${IMAGE_TYPES[mime]}`
}

export const isIssuedAssetKey = (key: string): boolean => ISSUED_KEY.test(key)

/** "images/2026/10/abc.jpg" + "thumb" → "images/2026/10/abc-thumb.webp". */
export const derivativeKey = (baseKey: string, name: DerivativeName): string =>
	baseKey.replace(/\.[a-z0-9]+$/, "") + `-${name}.webp`
