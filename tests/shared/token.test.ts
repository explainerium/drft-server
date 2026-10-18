import { describe, expect, it } from "vitest"
import { durationToMs, generateToken, hashToken } from "../../src/shared/token"
import { slugify, uniqueSlug } from "../../src/shared/slugify"

describe("token", () => {
	it("generates distinct 96-char hex tokens", () => {
		const a = generateToken()
		expect(a).toMatch(/^[0-9a-f]{96}$/)
		expect(generateToken()).not.toBe(a)
	})

	it("hashes deterministically and never returns the input", () => {
		expect(hashToken("abc")).toBe(hashToken("abc"))
		expect(hashToken("abc")).not.toBe("abc")
	})

	it.each([
		["45s", 45_000],
		["15m", 900_000],
		["1h", 3_600_000],
		["30d", 2_592_000_000],
	])("durationToMs(%s)", (input, ms) => {
		expect(durationToMs(input)).toBe(ms)
	})

	it("rejects malformed durations", () => {
		expect(() => durationToMs("15 minutes")).toThrow()
	})
})

describe("slugify", () => {
	it("lowercases, strips symbols and hyphenates", () => {
		expect(slugify("Aero V3 Freeride Kite!")).toBe("aero-v3-freeride-kite")
		expect(slugify("Ünïcödé & Co.")).toBe("unicode-and-co")
	})

	it("appends a counter until the slug is free", async () => {
		const taken = new Set(["aero", "aero-2"])
		expect(await uniqueSlug("Aero", async (s) => taken.has(s))).toBe("aero-3")
	})
})
