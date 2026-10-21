import { describe, expect, it } from "vitest"
import { countryClashes, normalizeCountries } from "../../../src/domain/shipping/zoneRules"

const eu = { id: "eu", name: "European Union", isActive: true, countries: ["BE", "DE", "NL"] }

describe("normalizeCountries", () => {
	it("upper-cases, removes duplicates and sorts", () => {
		expect(normalizeCountries(["nl", "BE", "nl", " de "])).toEqual(["BE", "DE", "NL"])
	})
})

describe("countryClashes", () => {
	it("finds countries another active zone already ships to", () => {
		expect(countryClashes({ isActive: true, countries: ["CH", "DE"] }, [eu])).toEqual([
			{ country: "DE", zone: "European Union" },
		])
	})

	it("ignores the zone itself, inactive zones and an inactive new zone", () => {
		expect(countryClashes({ id: "eu", isActive: true, countries: ["NL"] }, [eu])).toEqual([])
		expect(countryClashes({ isActive: true, countries: ["NL"] }, [{ ...eu, isActive: false }])).toEqual([])
		expect(countryClashes({ isActive: false, countries: ["NL"] }, [eu])).toEqual([])
	})
})
