import { describe, expect, it } from "vitest"
import { csvField, parseCsv, toCsv } from "../../src/shared/csv"

describe("csvField", () => {
	it("quotes, doubles inner quotes and defuses formulas", () => {
		expect(csvField('He said "hi"')).toBe('"He said ""hi"""')
		expect(csvField("=SUM(A1)")).toBe(`"'=SUM(A1)"`)
		expect(csvField(null)).toBe('""')
		expect(csvField(12)).toBe('"12"')
	})
})

describe("parseCsv", () => {
	it("reads quoted fields with commas, quotes and line breaks", () => {
		expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([
			["a", "b"],
			["x, y", 'say "hi"\nthere'],
		])
	})

	it("skips a BOM and blank lines and keeps empty fields", () => {
		expect(parseCsv("﻿sku,price\n\nA-1,\n")).toEqual([
			["sku", "price"],
			["A-1", ""],
		])
	})

	it("round-trips what toCsv writes", () => {
		const csv = toCsv(["name", "note"], [["Kite, 9m", 'a "b"'], ["x", null]])
		expect(parseCsv(csv)).toEqual([
			["name", "note"],
			["Kite, 9m", 'a "b"'],
			["x", ""],
		])
	})

	it("refuses a quote that is never closed", () => {
		expect(() => parseCsv('a\n"open')).toThrow()
	})
})
