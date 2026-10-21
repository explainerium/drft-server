import "dotenv/config"
import fs from "fs/promises"
import path from "path"
import { readingMinutes } from "../../src/domain/content/contentRules"
import { MediaService } from "../../src/app/modules/media/media.service"
import { prisma } from "../../src/shared/prisma"

/**
 * Starting content until the client sends theirs: the footer pages, the three
 * journal posts from the home page (covers uploaded to the media library) and
 * a short FAQ. Policy and legal pages are created as DRAFT placeholders, so
 * nothing that reads like a legal promise goes live by accident.
 * Idempotent: rows are matched by slug / question and only created when missing,
 * so edits made in the admin are kept.
 *
 *   npm run seed:content   (after seed:admin)
 */

const IMAGES_DIR = path.join(__dirname, "images")

const p = (...paragraphs: string[]) => paragraphs.map((text) => `<p>${text}</p>`).join("")

const PLACEHOLDER = "<p><strong>Placeholder.</strong> Replace this page with the text from DRFT before publishing it.</p>"

const pages: { slug: string; title: string; intro: string; body: string; published: boolean }[] = [
	{
		slug: "about",
		title: "Our story",
		intro: "DRFT builds kites, boards and foils for riders who read the wind before the forecast.",
		body: p(
			"We started in a workshop on the North Sea coast, repairing canopies for friends and testing every change on the water before it went into production.",
			"Today the fleet covers freeride and big-air kites, twintips, foil boards and wings. Every product is still ridden by our team in cold, gusty European conditions before it ships."
		),
		published: true,
	},
	{
		slug: "sustainability",
		title: "Sustainability",
		intro: "Gear that lasts longer, is repaired more often and is recycled at the end.",
		body: p(
			"We design for repair first: replaceable bladders, standard valves and spare parts sold separately.",
			"Retired canopies go to our European repair partners, who turn the Dacron and ripstop into travel bags and accessories."
		),
		published: true,
	},
	{
		slug: "team-riders",
		title: "Team riders",
		intro: "The riders who test every prototype before it reaches the shop.",
		body: p("Our team rides in Brittany, Tarifa and the North Atlantic. Their feedback shapes every size and colourway."),
		published: true,
	},
	{
		slug: "retailers",
		title: "Retailers",
		intro: "Find DRFT gear in a shop near your spot.",
		body: p("A list of partner shops is coming soon. Shops interested in carrying DRFT can reach us through the contact page."),
		published: true,
	},
	{
		slug: "kite-care",
		title: "Kite care",
		intro: "A few habits that add seasons to your gear.",
		body:
			p("Rinse your kite and bar with fresh water after salt sessions and let them dry in the shade before packing.") +
			"<ul><li>Never leave an inflated kite in the sun or on sand in strong wind.</li><li>Check lines and bridles for wear before every session.</li><li>Store everything dry and loosely rolled.</li></ul>",
		published: true,
	},
	{ slug: "shipping-returns", title: "Shipping & returns", intro: "", body: PLACEHOLDER, published: false },
	{ slug: "warranty", title: "Warranty", intro: "", body: PLACEHOLDER, published: false },
	{ slug: "privacy", title: "Privacy policy", intro: "", body: PLACEHOLDER, published: false },
	{ slug: "terms", title: "Terms and conditions", intro: "", body: PLACEHOLDER, published: false },
	{ slug: "cookies", title: "Cookie policy", intro: "", body: PLACEHOLDER, published: false },
]

const posts = [
	{
		slug: "western-brittany-wind-window",
		title: "The Perfect Wind Window: 48 Hours in Western Brittany",
		tag: "Destinations",
		excerpt: "Chasing a rapid low-pressure system across the Finistère coastline with team riders Leo and Marion.",
		image: "journal-brittany",
		daysAgo: 6,
		body:
			p(
				"The forecast gave us a narrow window: a fast low sliding in from the Atlantic, 25 knots for a day and a half, then nothing.",
				"We loaded the van on Friday night and drove west, chasing the front along the Finistère coast."
			) +
			"<h2>Day one: the north coast</h2>" +
			p("Saturday morning brought cross-onshore wind and a steady swell. Leo rode the Aero V3 9m all session while Marion tested the new foil set in the bay.") +
			"<h2>Day two: the last of the wind</h2>" +
			p("By Sunday afternoon the wind had backed off to 15 knots. We packed up wet, tired and already planning the next trip."),
	},
	{
		slug: "hydrofoil-tuning-variable-chop",
		title: "Hydrofoil Tuning: Finding Equilibrium in Variable Chop",
		tag: "Tuning",
		excerpt: "Stabilizer angle shimming, mast placement calibration, and pitch balance adjustments for rolling swell.",
		image: "journal-tuning",
		daysAgo: 13,
		body:
			p("Chop changes how a foil feels from one minute to the next. Three small adjustments make it predictable again.") +
			"<h2>Mast position</h2>" +
			p("Move the mast forward in the track for more lift at low speed, back for control when the chop builds.") +
			"<h2>Stabilizer shims</h2>" +
			p("A small shim under the stabilizer changes pitch stability. Change one thing at a time and ride a full session before judging it."),
	},
	{
		slug: "recycling-canopy-dacron",
		title: "Circularity in Watersports: Recycling Canopy Dacron",
		tag: "Materials",
		excerpt: "How our European repair workshop partners convert decommissioned wings into technical travel luggage.",
		image: "journal-circularity",
		daysAgo: 21,
		body:
			p(
				"Every season, worn-out canopies end up in storage rooms and skips. We wanted ours to come back as something useful.",
				"Our repair partners strip the Dacron leading edges and ripstop panels, clean them and cut them into the panels of our travel bags."
			),
	},
]

const faq = [
	{ group: "Orders & shipping", question: "Where do you ship?", answer: p("We ship to every country in the European Union. Checkout lists the countries and delivery options available for your address.") },
	{ group: "Orders & shipping", question: "Are prices including VAT?", answer: p("Yes. Prices include VAT. Checkout shows how much of the total is VAT for your country.") },
	{ group: "Orders & shipping", question: "How do I follow my order?", answer: p("You get an email when your order ships, with tracking when the carrier provides it. Signed-in customers also see their orders under My account.") },
	{ group: "Products", question: "Which kite size do I need?", answer: p("It depends on your weight, the wind and your board. Each kite page lists the sizes; our team can help you choose through the contact page.") },
	{ group: "Products", question: "Can I buy spare parts?", answer: p("Yes. Valves, bladders and bridle parts are available. Contact us with your kite model and size.") },
]

const main = async () => {
	const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })
	if (!admin) {
		console.error("No admin account. Run `npm run seed:admin` first.")
		process.exit(1)
	}

	let created = 0
	for (const page of pages) {
		if (await prisma.page.findUnique({ where: { slug: page.slug }, select: { id: true } })) continue
		await prisma.page.create({
			data: {
				slug: page.slug,
				title: page.title,
				intro: page.intro || null,
				body: page.body,
				status: page.published ? "PUBLISHED" : "DRAFT",
				publishedAt: page.published ? new Date() : null,
			},
		})
		created++
	}

	for (const post of posts) {
		if (await prisma.post.findUnique({ where: { slug: post.slug }, select: { id: true } })) continue
		const originalName = `${post.image}.jpg`
		const existing = await prisma.asset.findFirst({ where: { originalName }, select: { id: true } })
		const coverAssetId =
			existing?.id ??
			(
				await MediaService.upload(
					{ buffer: await fs.readFile(path.join(IMAGES_DIR, originalName)), mimetype: "image/jpeg", originalname: originalName },
					{ alt: post.title, uploadedById: admin.id }
				)
			).id
		await prisma.post.create({
			data: {
				slug: post.slug,
				title: post.title,
				tag: post.tag,
				excerpt: post.excerpt,
				body: post.body,
				author: "DRFT Team",
				readMinutes: readingMinutes(post.body),
				coverAssetId,
				status: "PUBLISHED",
				publishedAt: new Date(Date.now() - post.daysAgo * 86_400_000),
			},
		})
		created++
	}

	for (const [sortOrder, item] of faq.entries()) {
		if (await prisma.faqItem.findFirst({ where: { question: item.question }, select: { id: true } })) continue
		await prisma.faqItem.create({ data: { ...item, sortOrder } })
		created++
	}

	console.log(`Content seeded: ${created} new rows (${pages.length} pages, ${posts.length} posts, ${faq.length} FAQ items checked).`)
}

main()
	.catch((err: unknown) => {
		console.error(err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
