import "dotenv/config"
import fs from "fs/promises"
import path from "path"
import { Prisma } from "@prisma/client"
import { MediaService } from "../../src/app/modules/media/media.service"
import { prisma } from "../../src/shared/prisma"

/**
 * Sample product and category photos (Unsplash License, sources in
 * images/credits.json), uploaded through the media library (so they get the
 * WebP derivatives) and linked to the seeded catalog. Idempotent: a file
 * already in the library (same name) is reused. Run after `seed:admin` and `seed:catalog`; `seed:catalog` resets the
 * product content, so run this again after it.
 *
 *   npm run seed:media
 */

const IMAGES_DIR = path.join(__dirname, "images")

// slug → card image + PDP gallery (the card image is the gallery when there is none)
const products: Record<string, { featured: string; gallery?: string[] }> = {
	"aero-v3-freeride-kite": {
		featured: "aero-v3-freeride-kite",
		gallery: ["aero-v3-freeride-kite-1", "aero-v3-freeride-kite-2", "aero-v3-freeride-kite-3", "aero-v3-freeride-kite-4"],
	},
	"pocket-carbon-foil-board-110": { featured: "pocket-carbon-foil-board-110" },
	"apex-carbon-twintip-136": {
		featured: "apex-carbon-twintip-136",
		gallery: ["apex-carbon-twintip-136", "apex-carbon-twintip-136-2"],
	},
	"pulse-5-strut-big-air-kite": { featured: "pulse-5-strut-big-air-kite" },
	"sentry-pro-bar-system": {
		featured: "sentry-pro-bar-system",
		gallery: ["sentry-pro-bar-system", "sentry-pro-bar-system-2"],
	},
	"glide-hydrofoil-850-set": { featured: "glide-hydrofoil-850-set" },
	"vantage-carbon-foil-mast-85": { featured: "vantage-carbon-foil-mast-85" },
	"nomad-travel-boardbag": { featured: "nomad-travel-boardbag" },
	"velocity-short-board-5-2": { featured: "velocity-short-board-5-2" },
	"core-hardshell-harness": { featured: "core-hardshell-harness" },
	"drift-hydrofoil-front-wing-950": { featured: "drift-hydrofoil-front-wing-950" },
	"pro-neoprene-impact-vest": { featured: "pro-neoprene-impact-vest" },
	"dual-action-kite-pump": { featured: "dual-action-kite-pump" },
}

const categories: Record<string, string> = {
	kites: "category-kites",
	"foils-wings": "category-foils-wings",
	twintips: "category-twintips",
	boards: "category-boards",
	"foil-boards": "category-foil-boards",
	directionals: "category-directionals",
	"control-bars": "category-control-bars",
	harnesses: "category-harnesses",
	accessories: "category-accessories",
}

// The rider photo behind the Aero V3 story quote.
const STORY_IMAGES: Record<string, string> = { "aero-v3-freeride-kite": "aero-v3-freeride-kite-story" }

const main = async () => {
	const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })
	if (!admin) {
		console.error("No admin account. Run `npm run seed:admin` first.")
		process.exit(1)
	}

	const assetIds = new Map<string, string>()
	const assetFor = async (name: string, alt: string): Promise<string> => {
		const cached = assetIds.get(name)
		if (cached) return cached
		const originalName = `${name}.jpg`
		const existing = await prisma.asset.findFirst({ where: { originalName }, select: { id: true } })
		const upload = async () => {
			const buffer = await fs.readFile(path.join(IMAGES_DIR, originalName))
			const asset = await MediaService.upload(
				{ buffer, mimetype: "image/jpeg", originalname: originalName },
				{ alt, uploadedById: admin.id }
			)
			return asset.id
		}
		const id = existing?.id ?? (await upload())
		assetIds.set(name, id)
		return id
	}

	for (const [slug, images] of Object.entries(products)) {
		const product = await prisma.product.findUnique({ where: { slug }, select: { id: true, name: true, content: true } })
		if (!product) {
			console.warn(`Skipped ${slug}: not in the catalog (run seed:catalog).`)
			continue
		}
		const featuredAssetId = await assetFor(images.featured, product.name)
		const gallery = []
		for (const name of images.gallery ?? []) gallery.push(await assetFor(name, product.name))

		const storyImage = STORY_IMAGES[slug]
		const content =
			storyImage && product.content && typeof product.content === "object" && "story" in product.content
				? {
						...product.content,
						story: {
							...(product.content.story as Prisma.JsonObject),
							imageAssetId: await assetFor(storyImage, `${product.name} rider`),
						},
					}
				: undefined

		await prisma.$transaction([
			prisma.product.update({
				where: { id: product.id },
				data: { featuredAssetId, ...(content ? { content: content as Prisma.InputJsonObject } : {}) },
			}),
			prisma.productImage.deleteMany({ where: { productId: product.id } }),
			prisma.productImage.createMany({
				data: (gallery.length ? gallery : [featuredAssetId]).map((assetId, sortOrder) => ({
					productId: product.id,
					assetId,
					sortOrder,
				})),
			}),
		])
	}

	for (const [slug, name] of Object.entries(categories)) {
		const category = await prisma.category.findUnique({ where: { slug }, select: { id: true, name: true } })
		if (!category) continue
		const imageAssetId = await assetFor(name, category.name)
		await prisma.category.update({ where: { id: category.id }, data: { imageAssetId } })
	}

	const counts = `${Object.keys(products).length} products and ${Object.keys(categories).length} categories`
	console.log(`Linked ${assetIds.size} images to ${counts}.`)
}

main()
	.catch((err: unknown) => {
		console.error(err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
