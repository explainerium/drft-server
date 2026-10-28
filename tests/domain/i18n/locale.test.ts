import { describe, expect, it } from "vitest"
import { localize, parseLocale } from "../../../src/domain/i18n/locale"

describe("parseLocale", () => {
	it("accepts the store languages and falls back to German", () => {
		expect(parseLocale("en")).toBe("en")
		expect(parseLocale("fr")).toBe("de")
		expect(parseLocale(undefined)).toBe("de")
	})
})

describe("localize", () => {
	const row = { name: "Kite", shortDescription: "Kurz", slug: "kite" }

	it("replaces filled fields and keeps German for the rest", () => {
		expect(localize(row, { en: { name: "Kite EN", shortDescription: "  " } }, "en", ["name", "shortDescription"])).toEqual({
			name: "Kite EN",
			shortDescription: "Kurz",
			slug: "kite",
		})
	})

	it("leaves German and unknown shapes alone", () => {
		expect(localize(row, { en: { name: "Kite EN" } }, "de", ["name"])).toBe(row)
		expect(localize(row, "broken", "en", ["name"])).toBe(row)
		expect(localize(row, { en: ["x"] }, "en", ["name"])).toBe(row)
	})
})
