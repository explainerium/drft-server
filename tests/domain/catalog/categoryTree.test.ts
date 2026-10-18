import { describe, expect, it } from "vitest"
import {
	ancestorsOf,
	buildTree,
	countProductsPerCategory,
	descendantIds,
	findInTree,
	wouldCreateCycle,
} from "../../../src/domain/catalog/categoryTree"

// kites ─┬─ foil ── race
//        └─ lei
// boards
const nodes = [
	{ id: "kites", parentId: null, name: "Kites", sortOrder: 0 },
	{ id: "foil", parentId: "kites", name: "Foil", sortOrder: 1 },
	{ id: "lei", parentId: "kites", name: "LEI", sortOrder: 0 },
	{ id: "race", parentId: "foil", name: "Race", sortOrder: 0 },
	{ id: "boards", parentId: null, name: "Boards", sortOrder: 0 },
]

describe("wouldCreateCycle", () => {
	it("allows moving to the root", () => {
		expect(wouldCreateCycle("foil", null, nodes)).toBe(false)
	})

	it("allows moving under an unrelated branch", () => {
		expect(wouldCreateCycle("foil", "boards", nodes)).toBe(false)
		expect(wouldCreateCycle("race", "lei", nodes)).toBe(false)
	})

	it("refuses a category as its own parent", () => {
		expect(wouldCreateCycle("foil", "foil", nodes)).toBe(true)
	})

	it("refuses moving under a descendant", () => {
		expect(wouldCreateCycle("kites", "foil", nodes)).toBe(true)
		expect(wouldCreateCycle("kites", "race", nodes)).toBe(true)
	})

	it("treats already-looped data as a cycle instead of spinning forever", () => {
		const looped = [
			{ id: "a", parentId: "b" },
			{ id: "b", parentId: "a" },
		]
		expect(wouldCreateCycle("c", "a", looped)).toBe(true)
	})
})

describe("descendantIds", () => {
	it("returns the category and everything below it", () => {
		expect(descendantIds("kites", nodes).sort()).toEqual(["foil", "kites", "lei", "race"])
		expect(descendantIds("race", nodes)).toEqual(["race"])
	})

	it("returns nothing for an unknown id", () => {
		expect(descendantIds("nope", nodes)).toEqual([])
	})
})

describe("ancestorsOf", () => {
	it("lists ancestors root first", () => {
		expect(ancestorsOf("race", nodes).map((n) => n.id)).toEqual(["kites", "foil"])
		expect(ancestorsOf("kites", nodes)).toEqual([])
	})
})

describe("buildTree", () => {
	it("nests children and sorts by sortOrder, then name", () => {
		const tree = buildTree(nodes)
		expect(tree.map((n) => n.id)).toEqual(["boards", "kites"])
		const kites = tree.find((n) => n.id === "kites")!
		expect(kites.children.map((n) => n.id)).toEqual(["lei", "foil"])
		expect(kites.children[1]!.children.map((n) => n.id)).toEqual(["race"])
	})

	it("drops a subtree whose parent was filtered out (hidden)", () => {
		const visible = nodes.filter((n) => n.id !== "foil")
		const tree = buildTree(visible)
		expect(findInTree(tree, (n) => n.id === "race")).toBeUndefined()
		expect(tree.map((n) => n.id)).toEqual(["boards", "kites"])
	})

	it("finds nodes at any depth", () => {
		expect(findInTree(buildTree(nodes), (n) => n.id === "race")?.name).toBe("Race")
	})
})

describe("countProductsPerCategory", () => {
	const links = [
		{ productId: "p1", categoryId: "kites" },
		{ productId: "p1", categoryId: "race" },
		{ productId: "p2", categoryId: "race" },
		{ productId: "p3", categoryId: "lei" },
	]
	const counts = countProductsPerCategory(nodes, links)

	it("counts a category's whole subtree", () => {
		expect(counts.get("foil")).toBe(2)
		expect(counts.get("race")).toBe(2)
	})

	it("counts a product once even when linked twice in the same branch", () => {
		expect(counts.get("kites")).toBe(3)
	})

	it("gives empty categories a zero", () => {
		expect(counts.get("boards")).toBe(0)
	})
})
