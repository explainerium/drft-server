import sharp from "sharp"
import { checkSvg } from "../../../domain/media/svg"
import { mimeFromSharpFormat, planDerivatives, type DerivativeName, type ImageMime } from "../../../domain/media/image"
import httpStatus from "../../../shared/httpStatus"
import ApiError from "../../errors/ApiError"
import { DERIVATIVE_QUALITY, ORIGINAL_QUALITY } from "./media.constant"

export interface ProcessedImage {
	mimeType: ImageMime
	/** What to store as the original. Same bytes as the input when `unchanged`. */
	body: Buffer
	unchanged: boolean
	width: number | null
	height: number | null
	derivatives: { name: DerivativeName; body: Buffer; width: number; height: number }[]
}

/**
 * Validates and prepares one uploaded image.
 *
 * - The type is detected by decoding, not taken from the client, and must match
 *   what the client declared.
 * - The original is re-encoded in its own format with EXIF orientation applied
 *   and all metadata (GPS, camera serials) dropped. GIFs are kept as they are.
 * - WebP derivatives per `planDerivatives` (never upscaled).
 * - SVG is checked as text and stored untouched: no sharp, no size, no derivatives.
 */
export const processImage = async (buffer: Buffer, declared: ImageMime): Promise<ProcessedImage> => {
	if (declared === "image/svg+xml") {
		const problem = checkSvg(buffer)
		if (problem) throw new ApiError(httpStatus.UNSUPPORTED_MEDIA_TYPE, problem)
		return { mimeType: declared, body: buffer, unchanged: true, width: null, height: null, derivatives: [] }
	}

	let meta: sharp.Metadata
	try {
		meta = await sharp(buffer, { animated: true }).metadata()
	} catch {
		throw new ApiError(httpStatus.BAD_REQUEST, "That file is not a readable image")
	}

	const detected = mimeFromSharpFormat(meta.format, meta.compression)
	if (!detected || detected === "image/svg+xml" || detected !== declared) {
		throw new ApiError(httpStatus.UNSUPPORTED_MEDIA_TYPE, "The file content does not match its image type")
	}

	const animated = (meta.pages ?? 1) > 1
	const frameHeight = animated ? (meta.pageHeight ?? meta.height) : meta.height
	// EXIF orientations 5–8 are rotated by 90°, so width and height swap after rotate().
	const swap = !animated && (meta.orientation ?? 1) >= 5
	const width = (swap ? frameHeight : meta.width) ?? null
	const height = (swap ? meta.width : frameHeight) ?? null

	// Fresh pipeline per output; rotate() only for stills (animations carry no EXIF).
	const pipeline = () => (animated ? sharp(buffer, { animated: true }) : sharp(buffer).rotate())

	let body = buffer
	let unchanged = true
	if (detected !== "image/gif") {
		const p = pipeline()
		if (detected === "image/jpeg") p.jpeg({ quality: ORIGINAL_QUALITY, mozjpeg: true })
		else if (detected === "image/png") p.png({ compressionLevel: 9 })
		else if (detected === "image/webp") p.webp({ quality: ORIGINAL_QUALITY })
		else p.avif({ quality: 70 })
		body = await p.toBuffer()
		unchanged = false
	}

	const derivatives: ProcessedImage["derivatives"] = []
	for (const plan of planDerivatives(width)) {
		const { data, info } = await pipeline()
			.resize({ width: plan.width, withoutEnlargement: true })
			.webp({ quality: DERIVATIVE_QUALITY })
			.toBuffer({ resolveWithObject: true })

		const outHeight =
			animated && width && height ? Math.round((height * info.width) / width) : info.height
		derivatives.push({ name: plan.name, body: data, width: info.width, height: outHeight })
	}

	return { mimeType: detected, body, unchanged, width, height, derivatives }
}
