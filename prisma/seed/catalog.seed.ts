import "dotenv/config"
import { Prisma } from "@prisma/client"
import { prisma } from "../../src/shared/prisma"

/**
 * Sample catalog for development and demos until the client's products are
 * in: one category ("Produkte") and four products, German with English
 * translations. Idempotent: re-running updates in place (matched by slug /
 * code / SKU). Not for production: real data comes from the client.
 *
 *   npm run seed:catalog
 */

const categories = [{ slug: "produkte", name: "Produkte", sortOrder: 1, translations: { en: { name: "Products" } } }]

const attributes = [
	{
		code: "kite-size",
		name: "Kitegröße",
		values: ["7m", "9m", "10m", "12m", "14m"].map((size, i) => ({ code: size, label: `${size}²`, sortOrder: i })),
	},
	{
		code: "colorway",
		name: "Farbe",
		values: [
			{ code: "chalk-white", label: "Kreideweiß / Gletschergrau", hexColor: "#dfe3e8", sortOrder: 0 },
			{ code: "storm-graphite", label: "Sturmgraphit", hexColor: "#5b5b5d", sortOrder: 1 },
			{ code: "lagoon-teal", label: "Lagunentürkis", hexColor: "#4fc3bd", sortOrder: 2 },
		],
	},
	{
		code: "bar-size",
		name: "Bargröße",
		values: ["45cm", "52cm"].map((label, i) => ({ code: label.toLowerCase(), label, sortOrder: i })),
	},
]

interface SeedVariant {
	sku: string
	price: string
	compareAtPrice?: string
	stock: number
	values?: string[] // "<attributeCode>:<valueCode>"
}

interface SeedProduct {
	slug: string
	name: string
	badge: string
	typeLabel: string
	shortDescription: string
	description: string
	en: { badge: string; typeLabel: string; shortDescription: string; description: string }
	variants: SeedVariant[]
}

const products: SeedProduct[] = [
	{
		slug: "aero-v3-freeride-kite",
		name: "Aero V3 Freeride Kite",
		badge: "Freeride",
		typeLabel: "Freeride-Kite",
		shortDescription: "Direkte Kraftentfaltung und leichtes Barfeedback bei jedem Wind.",
		description:
			"<p>Ein leichter Drei-Strut-Kite mit großem Windbereich und einfachem Relaunch. Für alle, die entspannt und kontrolliert fahren wollen.</p>",
		en: {
			badge: "Freeride",
			typeLabel: "Freeride kite",
			shortDescription: "Direct power delivery with light, dynamic bar feedback in all winds.",
			description:
				"<p>A light three-strut kite with a wide wind range and an easy relaunch. For riders who want to ride relaxed and in control.</p>",
		},
		variants: (["9m", "7m", "10m", "12m", "14m"] as const).flatMap((size) =>
			(["chalk-white", "storm-graphite", "lagoon-teal"] as const).map((color) => ({
				sku: `DRFT-KTE-A3-${size.toUpperCase()}-${color.slice(0, 2).toUpperCase()}`,
				price: { "7m": "1420.00", "9m": "1480.00", "10m": "1540.00", "12m": "1600.00", "14m": "1660.00" }[size],
				// One sold-out combination, so the PDP's out-of-stock state has data.
				stock: size === "14m" && color === "lagoon-teal" ? 0 : 4,
				values: [`kite-size:${size}`, `colorway:${color}`],
			}))
		),
	},
	{
		slug: "apex-carbon-twintip-136",
		name: "Apex Carbon TwinTip 136",
		badge: "Carbon",
		typeLabel: "Twintip",
		shortDescription: "Leichtes Carbonboard mit viel Pop und sauberen Landungen.",
		description: "<p>Steif, leicht und reaktionsschnell: ein Twintip für Sprünge und schnelle Kurven.</p>",
		en: {
			badge: "Carbon",
			typeLabel: "Twintip",
			shortDescription: "Light carbon board with plenty of pop and clean landings.",
			description: "<p>Stiff, light and responsive: a twintip for jumps and quick turns.</p>",
		},
		variants: [{ sku: "APEX-136", price: "890.00", stock: 7 }],
	},
	{
		slug: "pocket-carbon-foil-board-110",
		name: "Pocket Carbon Foil Board 110",
		badge: "Carbon",
		typeLabel: "Foilboard",
		shortDescription: "Kompaktes Foilboard: leicht zu transportieren, wendig auf dem Wasser.",
		description: "<p>Ein kurzes Carbon-Foilboard für einfache Starts und flüssige Kurven, das in jede Boardbag passt.</p>",
		en: {
			badge: "Carbon",
			typeLabel: "Foil board",
			shortDescription: "Compact foil board: easy to travel with, agile on the water.",
			description: "<p>A short carbon foil board for easy take-offs and smooth carving that fits any board bag.</p>",
		},
		variants: [{ sku: "POCKET-110", price: "1380.00", stock: 4 }],
	},
	{
		slug: "sentry-pro-bar-system",
		name: "Sentry Pro Bar System",
		badge: "Control",
		typeLabel: "Bar",
		shortDescription: "Präzise Bar mit Sicherheitsauslösung und Autodrall-Centerline.",
		description: "<p>Klare Leinenführung, eine zuverlässige Sicherheitsauslösung und eine Centerline, die sich selbst entdrallt.</p>",
		en: {
			badge: "Control",
			typeLabel: "Control bar",
			shortDescription: "Precise bar with a safety release and an auto-untwisting center line.",
			description: "<p>Clean line management, a reliable safety release and a center line that untwists itself.</p>",
		},
		variants: [
			{ sku: "SENTRY-45", price: "540.00", stock: 12, values: ["bar-size:45cm"] },
			{ sku: "SENTRY-52", price: "540.00", stock: 15, values: ["bar-size:52cm"] },
		],
	},
]

const main = async () => {
	const categoryId = new Map<string, string>()
	for (const c of categories) {
		const data = { name: c.name, sortOrder: c.sortOrder, parentId: null, translations: c.translations }
		const row = await prisma.category.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: data })
		categoryId.set(c.slug, row.id)
	}

	const valueId = new Map<string, string>()
	for (const a of attributes) {
		const attr = await prisma.attribute.upsert({
			where: { code: a.code },
			create: { code: a.code, name: a.name },
			update: { name: a.name },
		})
		for (const v of a.values) {
			const row = await prisma.attributeValue.upsert({
				where: { attributeId_code: { attributeId: attr.id, code: v.code } },
				create: { attributeId: attr.id, ...v },
				update: { label: v.label, sortOrder: v.sortOrder, hexColor: "hexColor" in v ? v.hexColor : null },
			})
			valueId.set(`${a.code}:${v.code}`, row.id)
		}
	}

	for (const [index, p] of products.entries()) {
		await prisma.$transaction(
			async (tx) => {
				const base = {
					name: p.name,
					badge: p.badge,
					typeLabel: p.typeLabel,
					shortDescription: p.shortDescription,
					description: p.description,
					translations: { en: p.en },
					content: Prisma.DbNull,
					status: "PUBLISHED" as const,
					publishedAt: new Date(),
					isFeatured: true,
					sortOrder: index,
				}
				const product = await tx.product.upsert({ where: { slug: p.slug }, create: { slug: p.slug, ...base }, update: base })

				// Replace children wholesale: simplest way to stay idempotent.
				await tx.productCategory.deleteMany({ where: { productId: product.id } })
				await tx.productSpec.deleteMany({ where: { productId: product.id } })
				await tx.productVariant.deleteMany({ where: { productId: product.id } })

				await tx.productCategory.create({ data: { productId: product.id, categoryId: categoryId.get("produkte")! } })

				for (const [i, v] of p.variants.entries()) {
					await tx.productVariant.create({
						data: {
							productId: product.id,
							sku: v.sku,
							price: v.price,
							compareAtPrice: v.compareAtPrice ?? null,
							stock: v.stock,
							isDefault: i === 0,
							sortOrder: i,
							attributeValues: {
								create: (v.values ?? []).map((key) => ({ attributeValueId: valueId.get(key)! })),
							},
						},
					})
				}
			},
			// Many round trips; a remote database needs more than the 5 s default.
			{ timeout: 60_000 }
		)
	}

	// "Passend dazu" on the kite page.
	const bySlug = async (slug: string) => (await prisma.product.findUniqueOrThrow({ where: { slug } })).id
	const aero = await bySlug("aero-v3-freeride-kite")
	await prisma.relatedProduct.deleteMany({ where: { productId: aero } })
	for (const [i, slug] of ["sentry-pro-bar-system", "apex-carbon-twintip-136"].entries()) {
		await prisma.relatedProduct.create({ data: { productId: aero, relatedId: await bySlug(slug), sortOrder: i } })
	}

	console.log(`Seeded ${categories.length} category, ${attributes.length} attributes, ${products.length} products.`)
}

main()
	.catch((err: unknown) => {
		console.error(err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
