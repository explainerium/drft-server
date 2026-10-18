import { describe, expect, it } from "vitest"
import { parseAttributeFilters } from "../../../src/domain/catalog/productFilters"
import { isInStock, summarizeVariants } from "../../../src/domain/catalog/variantSummary"

const v = (overrides: Partial<Parameters<typeof summarizeVariants>[0][number]> = {}) => ({
	price: "100.00",
	compareAtPrice: null,
	manageStock: true,
	stock: 1,
	isActive: true,
	isDefault: false,
	...overrides,
})

describe("isInStock", () => {
	it("needs a unit when stock is tracked", () => {
		expect(isInStock({ manageStock: true, stock: 0 })).toBe(false)
		expect(isInStock({ manageStock: true, stock: 2 })).toBe(true)
	})

	it("is always in stock when stock is not tracked", () => {
		expect(isInStock({ manageStock: false, stock: 0 })).toBe(true)
	})
})

describe("summarizeVariants", () => {
	it("returns the price range and the cheapest variant's compare-at price", () => {
		const summary = summarizeVariants([
			v({ price: "1200.00", compareAtPrice: "1400.00" }),
			v({ price: "999.00", compareAtPrice: "1099.00" }),
			v({ price: "1500.00" }),
		])
		expect(summary).toEqual({ minPrice: "999.00", maxPrice: "1500.00", compareAtPrice: "1099.00", inStock: true })
	})

	it("compares as amounts, not strings", () => {
		expect(summarizeVariants([v({ price: "9.00" }), v({ price: "10.00" })]).minPrice).toBe("9.00")
	})

	it("ignores inactive variants", () => {
		const summary = summarizeVariants([v({ price: "5.00", isActive: false }), v({ price: "50.00", stock: 0 })])
		expect(summary).toMatchObject({ minPrice: "50.00", maxPrice: "50.00", inStock: false })
	})

	it("prefers the default variant on a price tie", () => {
		const summary = summarizeVariants([
			v({ compareAtPrice: "120.00" }),
			v({ compareAtPrice: "150.00", isDefault: true }),
		])
		expect(summary.compareAtPrice).toBe("150.00")
	})

	it("returns nulls when nothing is active", () => {
		expect(summarizeVariants([v({ isActive: false })])).toEqual({
			minPrice: null,
			maxPrice: null,
			compareAtPrice: null,
			inStock: false,
		})
	})
})

describe("parseAttributeFilters", () => {
	it("reads unknown keys as attribute filters", () => {
		expect(parseAttributeFilters({ page: 2, search: "x", size: "9m, 10M", color: ["black", "white,black"] })).toEqual([
			{ code: "size", values: ["9m", "10m"] },
			{ code: "color", values: ["black", "white"] },
		])
	})

	it("skips empty values and reserved keys", () => {
		expect(parseAttributeFilters({ size: " , ", category: "kites", minPrice: "10" })).toEqual([])
	})
})
