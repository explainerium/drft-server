import "dotenv/config"
import { prisma } from "../../src/shared/prisma"

/**
 * Starting shipping and VAT setup until the client confirms theirs: one EU
 * zone with the two methods from the Figma checkout, and the standard VAT
 * rate of every EU country (check them before launch; admins can edit them).
 * Idempotent: re-running updates in place (zone and rates matched by name).
 *
 *   npm run seed:checkout
 */

const EU_VAT: Record<string, number> = {
	AT: 20, BE: 21, BG: 20, HR: 25, CY: 19, CZ: 21, DK: 25, EE: 24, FI: 25.5,
	FR: 20, DE: 19, GR: 24, HU: 27, IE: 23, IT: 22, LV: 21, LT: 21, LU: 17,
	MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SK: 23, SI: 22, ES: 21, SE: 25,
}

const ZONE = "European Union"

const rates = [
	{
		name: "DRFT Carbon-Neutral Express",
		description: "Estimated 2–3 business days · Offset carbon transit & real-time tracking",
		// Not in the design (it shows the free case); a placeholder until the client sets it.
		price: "9.90",
		freeOverThreshold: true,
	},
	{
		name: "Priority Air Delivery",
		description: "Next business day delivery before 12:00 · Dedicated courier handoff",
		price: "24.00",
		freeOverThreshold: false,
	},
]

async function main() {
	const countries = Object.keys(EU_VAT).sort()
	const existing = await prisma.shippingZone.findFirst({ where: { name: ZONE }, select: { id: true } })
	const zone = existing
		? await prisma.shippingZone.update({ where: { id: existing.id }, data: { countries }, select: { id: true } })
		: await prisma.shippingZone.create({ data: { name: ZONE, countries }, select: { id: true } })

	for (const [sortOrder, rate] of rates.entries()) {
		const found = await prisma.shippingRate.findFirst({ where: { zoneId: zone.id, name: rate.name }, select: { id: true } })
		if (found) await prisma.shippingRate.update({ where: { id: found.id }, data: { ...rate, sortOrder } })
		else await prisma.shippingRate.create({ data: { ...rate, sortOrder, zoneId: zone.id } })
	}

	for (const [countryCode, rate] of Object.entries(EU_VAT)) {
		await prisma.taxRate.upsert({ where: { countryCode }, create: { countryCode, rate }, update: { rate } })
	}

	console.log(`Seeded 1 shipping zone (${countries.length} countries), ${rates.length} rates, ${countries.length} VAT rates.`)
}

main()
	.catch((err: unknown) => {
		console.error(err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
