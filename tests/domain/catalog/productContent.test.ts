import { describe, expect, it } from "vitest"
import { productContentSchema, readProductContent } from "../../../src/domain/catalog/productContent"

describe("productContentSchema", () => {
	it("accepts a page with only some blocks", () => {
		expect(productContentSchema.safeParse({ inTheBox: ["Kite", "Bag"] }).success).toBe(true)
	})

	it("rejects an empty story", () => {
		const result = productContentSchema.safeParse({ story: { eyebrow: "E", title: "T", paragraphs: [] } })
		expect(result.success).toBe(false)
	})

	it("defaults story stats to an empty list", () => {
		const parsed = productContentSchema.parse({ story: { eyebrow: "E", title: "T", paragraphs: ["P"] } })
		expect(parsed.story?.stats).toEqual([])
	})

	it("only takes an asset id for the story image", () => {
		const story = { eyebrow: "E", title: "T", paragraphs: ["P"] }
		const id = "3f0c2a8e-6b1d-4c5e-9a7f-2d4b6c8e0a1b"
		expect(productContentSchema.safeParse({ story: { ...story, imageAssetId: id } }).success).toBe(true)
		expect(productContentSchema.safeParse({ story: { ...story, imageAssetId: "photo.jpg" } }).success).toBe(false)
	})
})

describe("readProductContent", () => {
	it("returns an empty object for a missing column", () => {
		expect(readProductContent(null)).toEqual({})
	})

	it("drops stored JSON that no longer fits the schema instead of throwing", () => {
		expect(readProductContent({ highlight: { title: 42 } })).toEqual({})
	})
})
