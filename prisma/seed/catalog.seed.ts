import "dotenv/config"
import { Prisma } from "@prisma/client"
import type { ProductContent } from "../../src/domain/catalog/productContent"
import { prisma } from "../../src/shared/prisma"

/**
 * Sample catalog for development: the 12 products, labels and prices of the
 * Figma Shop page (in its order; the first six are its "highlighted" products),
 * plus a pump. Idempotent: re-running updates in place (matched by slug /
 * code / SKU). Not for production — real data comes from the client.
 *
 *   npm run seed:catalog
 */

const categories = [
	{ slug: "kites", name: "Kites", sortOrder: 1 },
	{ slug: "boards", name: "Boards", sortOrder: 2 },
	{ slug: "twintips", name: "Twintips", sortOrder: 1, parent: "boards" },
	{ slug: "foil-boards", name: "Foil Boards", sortOrder: 2, parent: "boards" },
	{ slug: "directionals", name: "Directionals", sortOrder: 3, parent: "boards" },
	{ slug: "foils-wings", name: "Foils & Wings", sortOrder: 3 },
	{ slug: "control-bars", name: "Control Bars", sortOrder: 4 },
	{ slug: "harnesses", name: "Harnesses", sortOrder: 5 },
	{ slug: "accessories", name: "Accessories", sortOrder: 6 },
]

const attributes = [
	{
		code: "kite-size",
		name: "Kite Size",
		values: ["7m", "9m", "10m", "12m", "14m"].map((size, i) => ({ code: size, label: `${size}²`, sortOrder: i })),
	},
	{
		code: "colorway",
		name: "Colorway",
		values: [
			{ code: "chalk-white", label: "Chalk White / Glacier Slate", hexColor: "#dfe3e8", sortOrder: 0 },
			{ code: "storm-graphite", label: "Storm Graphite", hexColor: "#5b5b5d", sortOrder: 1 },
			{ code: "lagoon-teal", label: "Lagoon Teal", hexColor: "#4fc3bd", sortOrder: 2 },
		],
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
	badge: string
	typeLabel: string
	shortDescription: string
	description?: string
	categories: string[]
	isFeatured?: boolean
	content?: ProductContent
	variants: SeedVariant[]
	specs?: { group?: string; label: string; value: string }[]
}

const products: SeedProduct[] = [
	{
		slug: "aero-v3-freeride-kite",
		name: "Aero V3 Freeride Kite",
		badge: "Freeride",
		typeLabel: "Freeride kite",
		shortDescription: "Intuitive sheet-and-go power delivery with light, dynamic bar feedback in all winds.",
		description:
			"<p>Intuitive sheet-and-go power delivery with a lightweight three-strut frame and dynamic bar feedback across all wind gradients. Built for riders who demand expansive wind ranges and effortless aerodynamic relaunch.</p>",
		categories: ["kites"],
		isFeatured: true,
		// Every size in every colorway. The first one (9m², Chalk White) is the default, as in the design.
		variants: (["9m", "7m", "10m", "12m", "14m"] as const).flatMap((size) =>
			(["chalk-white", "storm-graphite", "lagoon-teal"] as const).map((color) => ({
				sku: `DRFT-KTE-A3-${size.toUpperCase()}-${color.slice(0, 2).toUpperCase()}`,
				price: { "7m": "1420.00", "9m": "1480.00", "10m": "1540.00", "12m": "1600.00", "14m": "1660.00" }[size],
				// One sold-out combination, so the PDP's out-of-stock state has data.
				stock: size === "14m" && color === "lagoon-teal" ? 0 : 4,
				values: [`kite-size:${size}`, `colorway:${color}`],
			}))
		),
		specs: [
			{ label: "Wind Range (9m² Standard)", value: "16 – 28 Knots (8 – 14 m/s)" },
			{ label: "Airframe Construction", value: "3-Strut Inflatable Geometric Skeleton" },
			{ label: "Aspect Ratio", value: "Moderate-High (4.8)" },
			{ label: "Canopy Material", value: "Teijin TechnoForce Quad-Tex (Japan)" },
			{ label: "Inflation Valve System", value: "Rapid High-Flow Max-Valve (9mm Single-Point)" },
			{ label: "Bridle Configuration", value: "Pulleyless 4-Line Direct Low-Stretch Dyneema" },
			{ label: "Recommended Control System", value: "DRFT Sentry Pro 52cm (22m + 2m Extensions)" },
			{ label: "Dry Flying Weight", value: "2.85 kg (9m Canopy only)" },
		],
		content: {
			profile: "High-aspect profile",
			highlight: {
				title: "Precision-Engineered Freeflight",
				body: "Constructed with custom Teijin TechnoForce fibers and laser-aligned three-strut frame geometry for instantaneous steering feedback and progressive lift.",
			},
			story: {
				eyebrow: "Design intent & rider perspective",
				title: "Engineered for pure freeride flight and instant bar feel.",
				paragraphs: [
					"Developed across the unpredictable tidal bays of the North Sea and breezy Tarifa straits, the Aero V3 was conceived to bridge the gap between high-altitude float and effortless everyday handling. Rather than forcing riders into hyper-technical trim management, the third-generation canopy responds instinctively to single-hand bar inputs.",
					"The swept wingtips yield immediate water relaunch, while the stiffened transverse profile eliminates canopy flutter at upper wind thresholds. Whether launching lofty, floaty jumps or carving quiet swell on an offshore evening, the feedback through your harness remains predictable, clean, and silent.",
				],
				stats: [
					{ value: "4.8", label: "Aspect Ratio for Hangtime" },
					{ value: "-18%", label: "Bar Pressure Fatigue" },
					{ value: "< 3s", label: "Instant Water Relaunch" },
				],
				quote: {
					label: "Tested in Nazaré & Cold Hawaii",
					text: "The most balanced sheet-in response we have ever calibrated.",
					author: "DRFT Atelier Test Team, 2025",
				},
			},
			features: {
				eyebrow: "Material science & aerodynamics",
				title: "Engineered without compromise.",
				intro:
					"Every seam, seam reinforcement, and bridling juncture is assembled to withstand high UV exposure and aggressive saltwater shear.",
				items: [
					{
						label: "01 / Frame Architecture",
						title: "Tri-Strut Airframe",
						body: "Optimized weight distribution offering uncompromised stability in turbulent gust conditions. Reduced skeleton drag allows the canopy to slice cleanly upwind without back-stalling.",
						footnote: "High-Pressure Dacron 175g",
						footnoteValue: "9.5 PSI Max",
					},
					{
						label: "02 / Dynamic Rigging",
						title: "Reactive Bridle Geometry",
						body: "Pulleyless, direct-feeling bridle system engineered for instant power cutoff and zero lag. Pre-stretched Dyneema lines guarantee the kite retains factory calibration season after season.",
						footnote: "Zero Pulleys / Low Drag",
						footnoteValue: "Cousin Dyneema Line",
					},
					{
						label: "03 / Surface Integrity",
						title: "Teijin Quad-Tex Canopy",
						body: "High-tenacity Japanese woven ripstop ensuring minimal diagonal stretch over seasons of intense saltwater use. Delivers crisp bar impulses and exceptional UV resistance.",
						footnote: "4x4 Matrix Ripstop",
						footnoteValue: "Made in Japan",
					},
				],
			},
			inTheBox: [
				"Aero V3 High-Performance Kite Canopy",
				"Ergonomic Compression Carry Backpack with board straps",
				"Emergency Atelier Repair Kit (Bladder patches, Dacron tape)",
				"Quick-Start Tuning & Safety Manual + Bladder pump adapter",
			],
		},
	},
	{
		slug: "pocket-carbon-foil-board-110",
		name: "Pocket Carbon Foil Board 110",
		badge: "Carbon Series",
		typeLabel: "Foil board",
		shortDescription: "Compact performance foil board for travel convenience and fluid, agile carving.",
		categories: ["boards", "foil-boards"],
		isFeatured: true,
		variants: [{ sku: "POCKET-110", price: "1380.00", stock: 4 }],
	},
	{
		slug: "apex-carbon-twintip-136",
		name: "Apex Carbon TwinTip 136",
		badge: "High Modulus",
		typeLabel: "Twintip",
		shortDescription: "Ultra-responsive lightweight carbon construction delivering explosive pop and clean landings.",
		categories: ["boards", "twintips"],
		isFeatured: true,
		variants: [{ sku: "APEX-136", price: "890.00", stock: 7 }],
	},
	{
		slug: "pulse-5-strut-big-air-kite",
		name: "Pulse 5-Strut Big Air Kite",
		badge: "Big Air",
		typeLabel: "Big air kite",
		shortDescription: "High-aspect boosting profile engineered for raw vertical lift and exceptional hangtime.",
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
		badge: "Control",
		typeLabel: "Control system",
		shortDescription: "Precision line management with push-away safety release and a frictionless autotwist center line.",
		categories: ["control-bars"],
		isFeatured: true,
		variants: [
			{ sku: "SENTRY-45", price: "540.00", stock: 12, values: ["bar-size:45cm"] },
			{ sku: "SENTRY-52", price: "540.00", stock: 15, values: ["bar-size:52cm"] },
		],
	},
	{
		slug: "glide-hydrofoil-850-set",
		name: "Glide Hydrofoil 850 Set",
		badge: "Hydrofoil",
		typeLabel: "Hydrofoil set",
		shortDescription: "High-modulus carbon mast and mid-aspect front wing for effortless glide and early lift.",
		categories: ["foils-wings"],
		isFeatured: true,
		variants: [{ sku: "GLIDE-850", price: "1750.00", compareAtPrice: "1890.00", stock: 3 }],
	},
	{
		slug: "vantage-carbon-foil-mast-85",
		name: "Vantage Carbon Foil Mast 85cm",
		badge: "Mast",
		typeLabel: "Carbon mast",
		shortDescription: "Ultra-stiff HM carbon construction delivering zero parasitic flex and immediate reactive steering.",
		categories: ["foils-wings"],
		variants: [{ sku: "VANTAGE-85", price: "720.00", stock: 6 }],
	},
	{
		slug: "nomad-travel-boardbag",
		name: "Nomad Travel Boardbag",
		badge: "Travel",
		typeLabel: "Luggage & bags",
		shortDescription: "High-density foam protection tailored for two complete kites, board, and foil travel setup.",
		categories: ["accessories"],
		variants: [{ sku: "NOMAD-145", price: "240.00", stock: 20 }],
	},
	{
		slug: "velocity-short-board-5-2",
		name: "Velocity Short Board 5'2\"",
		badge: "Wave",
		typeLabel: "Directional",
		shortDescription: "Dedicated modern wave outline featuring an integrated full-deck traction pad and thruster fins.",
		categories: ["boards", "directionals"],
		variants: [{ sku: "VELOCITY-52", price: "920.00", stock: 3 }],
	},
	{
		slug: "core-hardshell-harness",
		name: "Core Hardshell Harness",
		badge: "Support",
		typeLabel: "Harness",
		shortDescription: "Ergonomic lumbar support with an adaptive composite load distribution plate for zero rib pressure.",
		categories: ["harnesses"],
		variants: [{ sku: "CORE-HS", price: "340.00", stock: 9 }],
	},
	{
		slug: "drift-hydrofoil-front-wing-950",
		name: "Drift Hydrofoil Front Wing 950",
		badge: "Hydrofoil",
		typeLabel: "Front wing",
		shortDescription: "Low-stall speed carving front wing offering forgiving stability for light wind discovery.",
		categories: ["foils-wings"],
		variants: [{ sku: "DRIFT-950", price: "680.00", stock: 5 }],
	},
	{
		slug: "pro-neoprene-impact-vest",
		name: "Pro Neoprene Impact Vest",
		badge: "Protection",
		typeLabel: "Apparel",
		shortDescription: "Flexible 4-way stretch protection tailored specifically for seamless waist harness overlap.",
		categories: ["accessories"],
		variants: [{ sku: "IMPACT-VEST", price: "180.00", stock: 14 }],
	},
	{
		slug: "dual-action-kite-pump",
		name: "Dual-Action Kite Pump",
		badge: "Essential",
		typeLabel: "Pump",
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
				update: { label: v.label, sortOrder: v.sortOrder, hexColor: "hexColor" in v ? v.hexColor : null },
			})
			valueId.set(`${a.code}:${v.code}`, row.id)
		}
	}

	for (const [index, p] of products.entries()) {
		await prisma.$transaction(async (tx) => {
			const base = {
				name: p.name,
				badge: p.badge,
				typeLabel: p.typeLabel,
				shortDescription: p.shortDescription,
				description: p.description ?? null,
				content: p.content ?? Prisma.DbNull,
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
