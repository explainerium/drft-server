import { describe, expect, it } from "vitest"
import {
	buildAssetKey,
	derivativeKey,
	isIssuedAssetKey,
	mimeFromSharpFormat,
	planDerivatives,
	readDerivatives,
} from "../../../src/domain/media/image"

describe("planDerivatives", () => {
	it("renders every size for a large source", () => {
		expect(planDerivatives(4000)).toEqual([
			{ name: "thumb", width: 400 },
			{ name: "medium", width: 1024 },
			{ name: "large", width: 2048 },
		])
	})

	it("never upscales: the first size the source does not exceed is rendered at native width", () => {
		expect(planDerivatives(600)).toEqual([
			{ name: "thumb", width: 400 },
			{ name: "medium", width: 600 },
		])
	})

	it("an exact match is rendered once, at that width", () => {
		expect(planDerivatives(1024)).toEqual([
			{ name: "thumb", width: 400 },
			{ name: "medium", width: 1024 },
		])
	})

	it("a tiny source gets only a native-size thumb", () => {
		expect(planDerivatives(120)).toEqual([{ name: "thumb", width: 120 }])
	})

	it("no width, no derivatives", () => {
		expect(planDerivatives(null)).toEqual([])
		expect(planDerivatives(0)).toEqual([])
	})
})

describe("mimeFromSharpFormat", () => {
	it("maps sharp formats to MIME types", () => {
		expect(mimeFromSharpFormat("jpeg")).toBe("image/jpeg")
		expect(mimeFromSharpFormat("heif", "av1")).toBe("image/avif")
		expect(mimeFromSharpFormat("heif", "hevc")).toBeNull()
		expect(mimeFromSharpFormat("tiff")).toBeNull()
	})
})

describe("storage keys", () => {
	const hex = "0123456789abcdef0123456789abcdef"

	it("builds dated random keys the complete endpoint accepts", () => {
		const key = buildAssetKey("image/png", hex, new Date("2026-03-05T00:00:00Z"))
		expect(key).toBe(`images/2026/03/${hex}.png`)
		expect(isIssuedAssetKey(key)).toBe(true)
	})

	it("rejects keys the API did not issue", () => {
		expect(isIssuedAssetKey("../etc/passwd")).toBe(false)
		expect(isIssuedAssetKey(`images/2026/03/${hex}.php`)).toBe(false)
		expect(isIssuedAssetKey(`invoices/2026/03/${hex}.png`)).toBe(false)
	})

	it("derivative keys are WebP siblings", () => {
		expect(derivativeKey(`images/2026/03/${hex}.jpg`, "thumb")).toBe(`images/2026/03/${hex}-thumb.webp`)
	})
})

describe("readDerivatives", () => {
	it("keeps well-formed entries and drops the rest", () => {
		expect(
			readDerivatives({
				thumb: { key: "a", width: 400, height: 300 },
				medium: { key: "b" },
				bogus: { key: "c", width: 1, height: 1 },
			})
		).toEqual({ thumb: { key: "a", width: 400, height: 300 } })
		expect(readDerivatives(null)).toEqual({})
		expect(readDerivatives([1, 2])).toEqual({})
	})
})
