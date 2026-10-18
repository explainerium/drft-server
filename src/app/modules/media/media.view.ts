import type { Prisma } from "@prisma/client"
import { readDerivatives } from "../../../domain/media/image"
import { storage } from "../../../helpers/storage"

/** The asset columns any public image needs. Select this wherever a catalog row embeds an image. */
export const assetSelect = {
	id: true,
	storageKey: true,
	mimeType: true,
	width: true,
	height: true,
	alt: true,
	derivatives: true,
} satisfies Prisma.AssetSelect

type AssetRow = Prisma.AssetGetPayload<{ select: typeof assetSelect }>

/**
 * An image as the storefront uses it: absolute-or-root-relative URLs for the
 * original and each WebP derivative, never storage keys. `alt` on the usage
 * (e.g. a product image) wins over the asset's own alt text.
 */
export const toImage = (asset: AssetRow, alt?: string | null) => ({
	id: asset.id,
	url: storage.publicUrl(asset.storageKey),
	mimeType: asset.mimeType,
	width: asset.width,
	height: asset.height,
	alt: alt ?? asset.alt,
	sizes: Object.fromEntries(
		Object.entries(readDerivatives(asset.derivatives)).map(([name, d]) => [
			name,
			{ url: storage.publicUrl(d.key), width: d.width, height: d.height },
		])
	),
})

export const toImageOrNull = (asset: AssetRow | null | undefined, alt?: string | null) =>
	asset ? toImage(asset, alt) : null

export type PublicImage = ReturnType<typeof toImage>
