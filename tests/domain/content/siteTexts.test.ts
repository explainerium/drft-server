import { describe, expect, it } from "vitest"
import { saveSiteTextsSchema } from "../../../src/app/modules/siteText/siteText.routes"
import { isSiteTextKey, planSiteTextChanges, siteTextId } from "../../../src/domain/content/siteTexts"

describe("isSiteTextKey", () => {
	it("accepts storefront message paths", () => {
		expect(isSiteTextKey("home.hero.title")).toBe(true)
		expect(isSiteTextKey("layout.cart.label")).toBe(true)
		expect(isSiteTextKey("checkout.steps.2")).toBe(true)
	})

	it("refuses the admin's own texts and anything that is not a path", () => {
		expect(isSiteTextKey("admin.products.title")).toBe(false)
		expect(isSiteTextKey("title")).toBe(false)
		expect(isSiteTextKey("home..title")).toBe(false)
		expect(isSiteTextKey("home.hero title")).toBe(false)
		expect(isSiteTextKey("__proto__.polluted")).toBe(false)
		expect(isSiteTextKey(`home.${"a".repeat(200)}`)).toBe(false)
	})
})

describe("planSiteTextChanges", () => {
	const stored = new Map([
		[siteTextId("de", "home.hero.title"), "Dein Flow."],
		[siteTextId("en", "home.hero.title"), "Your flow."],
	])

	it("writes new and changed texts with one revision each", () => {
		const plan = planSiteTextChanges(stored, [
			{ key: "home.hero.title", locale: "de", value: "Dein Ride." },
			{ key: "home.about.title", locale: "en", value: "About" },
		])
		expect(plan.upserts).toEqual([
			{ key: "home.hero.title", locale: "de", value: "Dein Ride." },
			{ key: "home.about.title", locale: "en", value: "About" },
		])
		expect(plan.resets).toEqual([])
		expect(plan.revisions).toHaveLength(2)
	})

	it("skips a value that is already stored", () => {
		const plan = planSiteTextChanges(stored, [{ key: "home.hero.title", locale: "en", value: "Your flow." }])
		expect(plan).toEqual({ upserts: [], resets: [], revisions: [] })
	})

	it("resets with an empty value, and only when there is an override", () => {
		const plan = planSiteTextChanges(stored, [
			{ key: "home.hero.title", locale: "de", value: "" },
			{ key: "home.about.title", locale: "de", value: "" },
		])
		expect(plan.resets).toEqual([{ key: "home.hero.title", locale: "de" }])
		expect(plan.revisions).toEqual([{ key: "home.hero.title", locale: "de", value: null }])
	})

	it("keeps the last change when a text appears twice", () => {
		const plan = planSiteTextChanges(new Map(), [
			{ key: "shop.title", locale: "de", value: "Erst" },
			{ key: "shop.title", locale: "de", value: "Dann" },
		])
		expect(plan.upserts).toEqual([{ key: "shop.title", locale: "de", value: "Dann" }])
	})
})

describe("saveSiteTextsSchema", () => {
	const parse = (changes: unknown) => saveSiteTextsSchema.safeParse({ body: { changes } })

	it("trims values and allows an empty one (back to the default)", () => {
		const result = parse([
			{ key: "home.hero.title", locale: "de", value: "  Hallo  " },
			{ key: "home.hero.lead", locale: "en", value: "" },
		])
		expect(result.success && result.data.body.changes.map((c) => c.value)).toEqual(["Hallo", ""])
	})

	it("refuses unknown languages, admin keys, empty lists and very long texts", () => {
		expect(parse([{ key: "home.hero.title", locale: "fr", value: "x" }]).success).toBe(false)
		expect(parse([{ key: "admin.nav.products", locale: "en", value: "x" }]).success).toBe(false)
		expect(parse([]).success).toBe(false)
		expect(parse([{ key: "home.hero.title", locale: "de", value: "x".repeat(2001) }]).success).toBe(false)
	})
})
