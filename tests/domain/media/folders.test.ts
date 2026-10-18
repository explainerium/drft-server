import { describe, expect, it } from "vitest"
import { wouldCreateCycle } from "../../../src/domain/media/folders"

// root ─ a ─ b ─ c,   x (separate root)
const parentOf = new Map<string, string | null>([
	["root", null],
	["a", "root"],
	["b", "a"],
	["c", "b"],
	["x", null],
])

describe("wouldCreateCycle", () => {
	it("allows moving to the top level", () => {
		expect(wouldCreateCycle("b", null, parentOf)).toBe(false)
	})

	it("allows moving into an unrelated branch", () => {
		expect(wouldCreateCycle("b", "x", parentOf)).toBe(false)
		expect(wouldCreateCycle("c", "root", parentOf)).toBe(false)
	})

	it("refuses a folder as its own parent", () => {
		expect(wouldCreateCycle("a", "a", parentOf)).toBe(true)
	})

	it("refuses moving a folder under its descendant", () => {
		expect(wouldCreateCycle("a", "c", parentOf)).toBe(true)
		expect(wouldCreateCycle("root", "b", parentOf)).toBe(true)
	})

	it("treats an existing loop in the data as a cycle instead of spinning forever", () => {
		const broken = new Map<string, string | null>([
			["p", "q"],
			["q", "p"],
			["z", null],
		])
		expect(wouldCreateCycle("z", "p", broken)).toBe(true)
	})
})
