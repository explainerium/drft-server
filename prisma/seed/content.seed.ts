import "dotenv/config"
import { prisma } from "../../src/shared/prisma"

/**
 * Starting pages until the client sends theirs: "Über DRFT" and the legal
 * pages linked from the footer (AGB, Datenschutz, Impressum), German with
 * English translations. The legal pages say only that their text follows:
 * nothing that reads like a legal promise goes live by accident.
 * Idempotent: pages are matched by slug and only created when missing, so
 * edits made in the admin are kept.
 *
 *   npm run seed:content
 */

const p = (...paragraphs: string[]) => paragraphs.map((text) => `<p>${text}</p>`).join("")

const FOLLOWS_DE = p("Dieser Inhalt folgt in Kürze.")
const FOLLOWS_EN = p("This content will follow shortly.")

const pages: {
	slug: string
	title: string
	intro: string | null
	body: string
	en: { title: string; intro?: string; body: string }
}[] = [
	{
		slug: "ueber-drft",
		title: "Über DRFT",
		intro: "Kitesurfen ohne Kompromisse: wenige Produkte, so gut wie möglich gemacht.",
		body: p(
			"DRFT steht für Ausrüstung, über die man auf dem Wasser nicht nachdenken muss. Wir konzentrieren uns auf wenige Produkte und entwickeln sie mit Fahrerinnen und Fahrern, die jede Woche auf dem Wasser sind.",
			"Your flow. Your ride. Your DRFT."
		),
		en: {
			title: "About DRFT",
			intro: "Kitesurfing without compromise: a few products, made as well as we can.",
			body: p(
				"DRFT stands for equipment you don’t have to think about on the water. We focus on a few products and develop them with riders who are on the water every week.",
				"Your flow. Your ride. Your DRFT."
			),
		},
	},
	{ slug: "agb", title: "AGB", intro: null, body: FOLLOWS_DE, en: { title: "Terms and conditions", body: FOLLOWS_EN } },
	{ slug: "datenschutz", title: "Datenschutz", intro: null, body: FOLLOWS_DE, en: { title: "Privacy policy", body: FOLLOWS_EN } },
	{ slug: "impressum", title: "Impressum", intro: null, body: FOLLOWS_DE, en: { title: "Imprint", body: FOLLOWS_EN } },
]

const main = async () => {
	let created = 0
	for (const page of pages) {
		if (await prisma.page.findUnique({ where: { slug: page.slug }, select: { id: true } })) continue
		await prisma.page.create({
			data: {
				slug: page.slug,
				title: page.title,
				intro: page.intro,
				body: page.body,
				translations: { en: page.en },
				status: "PUBLISHED",
				publishedAt: new Date(),
			},
		})
		created++
	}
	console.log(`Content seeded: ${created} new pages (${pages.length} checked).`)
}

main()
	.catch((err: unknown) => {
		console.error(err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
