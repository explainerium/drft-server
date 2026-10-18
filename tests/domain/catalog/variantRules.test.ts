import { describe, expect, it } from "vitest"
import {
	MONEY_PATTERN,
	normalizeRelatedIds,
	normalizeVariants,
	resolvePublishedAt,
	toCents,
} from "../../../src/domain/catalog/variantRules"

const variant = (overrides: Partial<Parameters<typeof normalizeVariants>[0][number]> = {}) => ({
	price: "100.00",
	attributeValueIds: [] as string[],
	...overrides,
})

// size: 9m, 10m · color: black
const attributeOf = new Map([
	["9m", "size"],
	["10m", "size"],
	["black", "color"],
])

const expectError = (result: ReturnType<typeof normalizeVariants>, match: RegExp) => {
	expect(result.ok).toBe(false)
	if (!result.ok) expect(result.error).toMatch(match)
}

describe("money", () => {
	it("accepts up to 2 decimals and rejects negatives and exponents", () => {
		for (const ok of ["0", "12", "12.5", "12.50", "9999999999.99"]) expect(MONEY_PATTERN.test(ok)).toBe(true)
		for (const bad of ["-1", "1.234", "1e5", "", ".5", "0.30000000000000004"]) expect(MONEY_PATTERN.test(bad)).toBe(false)
	})

	it("converts to integer cents", () => {
		expect(toCents("12.5")).toBe(1250)
		expect(toCents("12.05")).toBe(1205)
		expect(toCents("7")).toBe(700)
	})
})

describe("normalizeVariants", () => {
	it("needs at least one variant", () => {
		expectError(normalizeVariants([]), /at least one variant/)
	})

	it("makes the first variant the default when none is flagged", () => {
		const result = normalizeVariants([variant({ sku: "A" }), variant({ sku: "B", attributeValueIds: ["x"] })])
		expect(result.ok && result.value.map((v) => v.isDefault)).toEqual([true, false])
	})

	it("keeps the flagged default", () => {
		const result = normalizeVariants([
			variant({ attributeValueIds: ["9m"] }),
			variant({ attributeValueIds: ["10m"], isDefault: true }),
		])
		expect(result.ok && result.value.map((v) => v.isDefault)).toEqual([false, true])
	})

	it("refuses two defaults", () => {
		expectError(
			normalizeVariants([
				variant({ isDefault: true, attributeValueIds: ["9m"] }),
				variant({ isDefault: true, attributeValueIds: ["10m"] }),
			]),
			/Only one variant/
		)
	})

	it("requires compareAtPrice above price", () => {
		expectError(normalizeVariants([variant({ compareAtPrice: "100" })]), /compare-at price/)
		expectError(normalizeVariants([variant({ compareAtPrice: "99.99" })]), /compare-at price/)
		expect(normalizeVariants([variant({ compareAtPrice: "100.01" })]).ok).toBe(true)
		expect(normalizeVariants([variant({ compareAtPrice: null })]).ok).toBe(true)
	})

	it("refuses a SKU used twice in the payload", () => {
		expectError(
			normalizeVariants([variant({ sku: "K-1", attributeValueIds: ["9m"] }), variant({ sku: "K-1", attributeValueIds: ["10m"] })]),
			/SKU K-1/
		)
	})

	it("refuses two variants with the same attribute values, in any order", () => {
		expectError(
			normalizeVariants([
				variant({ attributeValueIds: ["9m", "black"] }),
				variant({ attributeValueIds: ["black", "9m"] }),
			]),
			/same attribute values/
		)
	})

	it("refuses two variants with no attribute values", () => {
		expectError(normalizeVariants([variant(), variant()]), /same attribute values/)
	})

	it("de-duplicates value ids within a variant", () => {
		const result = normalizeVariants([variant({ attributeValueIds: ["9m", "9m"] })], attributeOf)
		expect(result.ok && result.value[0]!.attributeValueIds).toEqual(["9m"])
	})

	it("refuses unknown attribute values", () => {
		expectError(normalizeVariants([variant({ attributeValueIds: ["12m"] })], attributeOf), /unknown attribute value/)
	})

	it("refuses two values of the same attribute on one variant", () => {
		expectError(normalizeVariants([variant({ attributeValueIds: ["9m", "10m"] })], attributeOf), /one value per attribute/)
	})

	it("requires every variant to use the same attributes", () => {
		expectError(
			normalizeVariants(
				[variant({ attributeValueIds: ["9m", "black"] }), variant({ attributeValueIds: ["10m"] })],
				attributeOf
			),
			/same attributes/
		)
	})

	it("keeps extra fields", () => {
		const result = normalizeVariants([variant({ sku: "A" })].map((v) => ({ ...v, stock: 4 })))
		expect(result.ok && result.value[0]).toMatchObject({ sku: "A", stock: 4, isDefault: true })
	})
})

describe("normalizeRelatedIds", () => {
	it("refuses the product itself", () => {
		expect(normalizeRelatedIds("p1", ["p2", "p1"]).ok).toBe(false)
	})

	it("de-duplicates and keeps order", () => {
		expect(normalizeRelatedIds("p1", ["p3", "p2", "p3"])).toEqual({ ok: true, value: ["p3", "p2"] })
		expect(normalizeRelatedIds(undefined, ["p1"])).toEqual({ ok: true, value: ["p1"] })
	})
})

describe("resolvePublishedAt", () => {
	const now = new Date("2026-10-18T10:00:00Z")
	const earlier = new Date("2026-01-01T00:00:00Z")

	it("stamps the first publish", () => {
		expect(resolvePublishedAt("PUBLISHED", null, now)).toBe(now)
	})

	it("keeps an existing date", () => {
		expect(resolvePublishedAt("PUBLISHED", earlier, now)).toBe(earlier)
		expect(resolvePublishedAt("ARCHIVED", earlier, now)).toBe(earlier)
	})

	it("leaves drafts unpublished", () => {
		expect(resolvePublishedAt("DRAFT", null, now)).toBeNull()
	})
})
