import "dotenv/config"
import { prisma } from "../../src/shared/prisma"

/**
 * Sample catalog for development, taken from the product names and prices in
 * the Figma design. Idempotent: re-running updates in place (matched by slug /
 * code / SKU). Not for production — real data comes from the client.
 *
 *   npm run seed:catalog
 */

const categories = [
	{ slug: "kites", name: "Kites", sortOrder: 1 },
	{ slug: "boards", name: "Boards", sortOrder: 2 },
	{ slug: "twintips", name: "Twintips", sortOrder: 1, parent: "boards" },
	{ slug: "foil-boards", name: "Foil Boards", sortOrder: 2, parent: "boards" },
	{ slug: "foils-wings", name: "Foils & Wings", sortOrder: 3 },
	{ slug: "control-bars", name: "Control Bars", sortOrder: 4 },
	{ slug: "harnesses", name: "Harnesses", sortOrder: 5 },
	{ slug: "accessories", name: "Accessories", sortOrder: 6 },
]

const attributes = [
	{
		code: "kite-size",
		name: "Kite Size",
		values: ["7m", "9m", "10m", "12m"].map((label, i) => ({ code: label.toLowerCase(), label, sortOrder: i })),
	},
	{
		code: "bar-size",
		name: "Bar Size",
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
	shortDescription: string
	categories: string[]
	isFeatured?: boolean
	variants: SeedVariant[]
	specs?: { group?: string; label: string; value: string }[]
}

const products: SeedProduct[] = [
	{
		slug: "aero-v3-freeride-kite",
		name: "Aero V3 Freeride Kite",
		shortDescription: "High-aspect freeride kite with intuitive sheet-and-go power delivery.",
		categories: ["kites"],
		isFeatured: true,
		variants: [
			{ sku: "AERO3-07", price: "1480.00", stock: 6, values: ["kite-size:7m"] },
			{ sku: "AERO3-09", price: "1540.00", stock: 10, values: ["kite-size:9m"] },
			{ sku: "AERO3-10", price: "1580.00", stock: 8, values: ["kite-size:10m"] },
			{ sku: "AERO3-12", price: "1640.00", stock: 4, values: ["kite-size:12m"] },
		],
		specs: [
			{ group: "Construction", label: "Canopy", value: "Ripstop polyester, 4-panel" },
			{ group: "Construction", label: "Struts", value: "3 struts" },
			{ group: "Performance", label: "Wind range", value: "12–30 kn (9m)" },
			{ group: "Performance", label: "Discipline", value: "Freeride, Big Air" },
		],
	},
	{
		slug: "pulse-5-strut-big-air-kite",
		name: "Pulse 5-Strut Big Air Kite",
		shortDescription: "Five-strut stability for massive hangtime.",
		categories: ["kites"],
		isFeatured: true,
		variants: [
			{ sku: "PULSE-09", price: "1620.00", stock: 5, values: ["kite-size:9m"] },
			{ sku: "PULSE-10", price: "1680.00", stock: 5, values: ["kite-size:10m"] },
			{ sku: "PULSE-12", price: "1740.00", stock: 3, values: ["kite-size:12m"] },
		],
	},
	{
		slug: "sentry-pro-bar-system",
		name: "Sentry Pro Bar System",
		shortDescription: "Carbon-composite bar with auto-untwisting ceramic swivel and click-in safety release.",
		categories: ["control-bars"],
		variants: [
			{ sku: "SENTRY-45", price: "540.00", stock: 12, values: ["bar-size:45cm"] },
			{ sku: "SENTRY-52", price: "540.00", stock: 15, values: ["bar-size:52cm"] },
		],
	},
	{
		slug: "apex-carbon-twintip-136",
		name: "Apex Carbon TwinTip 136",
		shortDescription: "Paulownia wood core with biaxial carbon weave for explosive pop and smooth landings.",
		categories: ["boards", "twintips"],
		isFeatured: true,
		variants: [{ sku: "APEX-136", price: "890.00", stock: 7 }],
	},
	{
		slug: "pocket-carbon-foil-board-110",
		name: "Pocket Carbon Foil Board 110",
		shortDescription: "Compact full-carbon foil board for early lift and easy carving.",
		categories: ["boards", "foil-boards"],
		variants: [{ sku: "POCKET-110", price: "1380.00", stock: 4 }],
	},
	{
		slug: "glide-hydrofoil-850-set",
		name: "Glide Hydrofoil 850 Set",
		shortDescription: "Complete hydrofoil set with an 850 cm² front wing.",
		categories: ["foils-wings"],
		variants: [{ sku: "GLIDE-850", price: "1750.00", compareAtPrice: "1890.00", stock: 3 }],
	},
	{
		slug: "nomad-travel-boardbag",
		name: "Nomad Travel Boardbag",
		shortDescription: "Reinforced 145 cm travel bag for boards and kites.",
		categories: ["accessories"],
		variants: [{ sku: "NOMAD-145", price: "240.00", stock: 20 }],
	},
	{
		slug: "dual-action-kite-pump",
		name: "Dual-Action Kite Pump",
		shortDescription: "High-volume 2.9 L pump that inflates on both strokes.",
		categories: ["accessories"],
		variants: [{ sku: "PUMP-DA", price: "65.00", stock: 40 }],
	},
]

const main = async () => {
	// Categories: parents first (array order), so parentId lookups succeed.
	const categoryId = new Map<string, string>()
	for (const c of categories) {
		const data = {
			name: c.name,
			sortOrder: c.sortOrder,
			parentId: c.parent ? categoryId.get(c.parent)! : null,
		}
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
				update: { label: v.label, sortOrder: v.sortOrder },
			})
			valueId.set(`${a.code}:${v.code}`, row.id)
		}
	}

	for (const [index, p] of products.entries()) {
		await prisma.$transaction(async (tx) => {
			const base = {
				name: p.name,
				shortDescription: p.shortDescription,
				status: "PUBLISHED" as const,
				publishedAt: new Date(),
				isFeatured: !!p.isFeatured,
				sortOrder: index,
			}
			const product = await tx.product.upsert({ where: { slug: p.slug }, create: { slug: p.slug, ...base }, update: base })

			// Replace children wholesale: simplest way to stay idempotent.
			await tx.productCategory.deleteMany({ where: { productId: product.id } })
			await tx.productSpec.deleteMany({ where: { productId: product.id } })
			await tx.productVariant.deleteMany({ where: { productId: product.id } })

			await tx.productCategory.createMany({
				data: p.categories.map((slug, i) => ({ productId: product.id, categoryId: categoryId.get(slug)!, sortOrder: i })),
			})

			if (p.specs) {
				await tx.productSpec.createMany({
					data: p.specs.map((s, i) => ({ productId: product.id, ...s, sortOrder: i })),
				})
			}

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
		})
	}

	// "Complete your setup" on the Aero PDP, as in the design.
	const bySlug = async (slug: string) => (await prisma.product.findUniqueOrThrow({ where: { slug } })).id
	const aero = await bySlug("aero-v3-freeride-kite")
	await prisma.relatedProduct.deleteMany({ where: { productId: aero } })
	const related = ["sentry-pro-bar-system", "apex-carbon-twintip-136", "nomad-travel-boardbag"]
	for (const [i, slug] of related.entries()) {
		await prisma.relatedProduct.create({ data: { productId: aero, relatedId: await bySlug(slug), sortOrder: i } })
	}

	console.log(`Seeded ${categories.length} categories, ${attributes.length} attributes, ${products.length} products.`)
}

main()
	.catch((err: unknown) => {
		console.error(err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
