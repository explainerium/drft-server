import { describe, expect, it } from "vitest"
import { describeAssetUsage, type AssetUsage } from "../../../src/domain/media/usage"

const none = { total: 0, names: [] }
const unused: AssetUsage = {
	productGalleries: none,
	featuredProducts: none,
	categories: none,
	variants: none,
	productStories: none,
	postCovers: none,
	settings: [],
}

describe("describeAssetUsage", () => {
	it("returns null for an unused asset", () => {
		expect(describeAssetUsage(unused)).toBeNull()
	})

	it("names where the asset is used", () => {
		const message = describeAssetUsage({
			...unused,
			productGalleries: { total: 5, names: ["Aero V3", "Flow 9", "Rig X"] },
			categories: { total: 1, names: ["Kites"] },
			settings: ["SEO default share image"],
		})
		expect(message).toBe(
			"This image is still used by the gallery of 5 products (Aero V3, Flow 9, Rig X and 2 more); " +
				"1 category (Kites); the SEO default share image setting. Remove it there first."
		)
	})

	it("handles featured products and variants", () => {
		const message = describeAssetUsage({
			...unused,
			featuredProducts: { total: 1, names: ["Aero V3"] },
			variants: { total: 2, names: ["Aero V3 / AV3-9", "Aero V3 / AV3-12"] },
		})
		expect(message).toContain("the featured image of 1 product (Aero V3)")
		expect(message).toContain("2 variants (Aero V3 / AV3-9, Aero V3 / AV3-12)")
	})

	it("counts the story photo of a product page", () => {
		const message = describeAssetUsage({ ...unused, productStories: { total: 1, names: ["Aero V3"] } })
		expect(message).toBe("This image is still used by the story photo of 1 product (Aero V3). Remove it there first.")
	})
})
