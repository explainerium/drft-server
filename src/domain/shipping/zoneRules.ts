/**
 * Shipping zone rules. Checkout looks a country up in the active zones, so a
 * country may sit in at most one active zone or the price it gets would
 * depend on sort order.
 */

export interface ZoneCountries {
	id: string
	name: string
	isActive: boolean
	countries: string[]
}

/** Upper case, no duplicates, sorted: how zone countries are stored. */
export const normalizeCountries = (countries: string[]): string[] =>
	[...new Set(countries.map((c) => c.trim().toUpperCase()).filter(Boolean))].sort()

/** Countries of an active zone that another active zone already has, with that zone's name. */
export const countryClashes = (
	zone: { id?: string; isActive: boolean; countries: string[] },
	others: ZoneCountries[]
): { country: string; zone: string }[] => {
	if (!zone.isActive) return []
	const taken = new Map<string, string>()
	for (const other of others) {
		if (!other.isActive || other.id === zone.id) continue
		for (const country of other.countries) taken.set(country, other.name)
	}
	return zone.countries.filter((c) => taken.has(c)).map((country) => ({ country, zone: taken.get(country)! }))
}
