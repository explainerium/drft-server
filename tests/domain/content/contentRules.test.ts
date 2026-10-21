import { describe, expect, it } from "vitest"
import { groupFaq, readingMinutes } from "../../../src/domain/content/contentRules"

describe("readingMinutes", () => {
	it("counts words without tags, at 200 a minute, rounded up", () => {
		const words = (n: number) => Array.from({ length: n }, () => "wind").join(" ")
		expect(readingMinutes(`<p>${words(200)}</p>`)).toBe(1)
		expect(readingMinutes(`<h2>Title</h2><p>${words(400)}</p>`)).toBe(3)
	})

	it("is at least a minute", () => {
		expect(readingMinutes(null)).toBe(1)
		expect(readingMinutes("<p></p>")).toBe(1)
	})
})

describe("groupFaq", () => {
	const item = (group: string | null, question: string, sortOrder: number) => ({ group, question, answer: "", sortOrder })

	it("keeps the order of first appearance and puts ungrouped items last", () => {
		const grouped = groupFaq([
			item("Shipping", "When?", 0),
			item(null, "Who?", 1),
			item("Products", "Which size?", 2),
			item("Shipping", "Where?", 3),
		])
		expect(grouped.map((g) => [g.group, g.items.map((i) => i.question)])).toEqual([
			["Shipping", ["When?", "Where?"]],
			["Products", ["Which size?"]],
			[null, ["Who?"]],
		])
	})
})
