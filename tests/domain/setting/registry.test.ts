import { describe, expect, it } from "vitest"
import { ZodError } from "zod"
import {
	applyGroupUpdate,
	isSettingGroup,
	parseStoredGroup,
	PUBLIC_SETTING_GROUPS,
	SETTING_GROUPS,
} from "../../../src/app/modules/setting/setting.registry"

describe("setting registry", () => {
	it("knows its groups and nothing inherited", () => {
		expect(isSettingGroup("store")).toBe(true)
		expect(isSettingGroup("nope")).toBe(false)
		expect(isSettingGroup("__proto__")).toBe(false)
		expect(isSettingGroup("constructor")).toBe(false)
		expect(PUBLIC_SETTING_GROUPS).toEqual(["store", "seo", "social"])
	})

	it("every default satisfies its own schema", () => {
		for (const group of Object.values(SETTING_GROUPS)) {
			expect(group.schema.safeParse(group.defaults).success).toBe(true)
		}
	})
})

describe("parseStoredGroup", () => {
	it("returns defaults when nothing is stored", () => {
		expect(parseStoredGroup("seo", undefined)).toEqual(SETTING_GROUPS.seo.defaults)
		expect(parseStoredGroup("store", "garbage")).toEqual(SETTING_GROUPS.store.defaults)
	})

	it("merges stored values over defaults", () => {
		expect(parseStoredGroup("store", { name: "DRFT Kites" })).toMatchObject({ name: "DRFT Kites", currency: "EUR" })
	})

	it("repairs an invalid field without losing the valid ones", () => {
		const value = parseStoredGroup("seo", { defaultTitle: "Kites", titleTemplate: "no placeholder" })
		expect(value).toMatchObject({ defaultTitle: "Kites", titleTemplate: "%s | DRFT" })
	})

	it("drops fields the schema no longer knows", () => {
		expect(parseStoredGroup("social", { instagram: "https://instagram.com/drft", myspace: "x" })).toEqual({
			instagram: "https://instagram.com/drft",
		})
	})
})

describe("applyGroupUpdate", () => {
	it("merges a partial update over the current value", () => {
		const next = applyGroupUpdate("store", SETTING_GROUPS.store.defaults, { email: "hello@drft.example" })
		expect(next).toEqual({ ...SETTING_GROUPS.store.defaults, email: "hello@drft.example" })
	})

	it("keeps the currency read-only", () => {
		expect(() => applyGroupUpdate("store", SETTING_GROUPS.store.defaults, { currency: "USD" })).toThrow(ZodError)
	})

	it("reports field errors under body.<field>", () => {
		try {
			applyGroupUpdate("store", SETTING_GROUPS.store.defaults, { email: "not-an-email" })
			expect.unreachable()
		} catch (error) {
			expect((error as ZodError).issues[0]?.path).toEqual(["body", "email"])
		}
	})

	it("clears social links with empty string or null and rejects non-http URLs", () => {
		const current = { instagram: "https://instagram.com/drft", youtube: "https://youtube.com/@drft" }
		expect(applyGroupUpdate("social", current, { instagram: "", youtube: null })).toEqual({})
		expect(() => applyGroupUpdate("social", {}, { tiktok: "javascript:alert(1)" })).toThrow(ZodError)
	})
})
