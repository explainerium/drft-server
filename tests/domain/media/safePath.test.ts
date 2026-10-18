import path from "path"
import { describe, expect, it } from "vitest"
import { resolveInside } from "../../../src/helpers/storage/safePath"

const root = path.resolve("/srv/storage/public")

describe("resolveInside", () => {
	it("resolves a normal key inside the root", () => {
		expect(resolveInside(root, "/images/2026/10/abc.webp")).toBe(path.join(root, "images", "2026", "10", "abc.webp"))
	})

	it.each([
		["parent segments", "../secret.txt"],
		["nested parent segments", "images/../../secret.txt"],
		["encoded parent segments", "%2e%2e/%2e%2e/secret.txt"],
		["encoded slash traversal", "..%2f..%2fsecret.txt"],
		["backslashes", "..\\..\\secret.txt"],
		["encoded backslashes", "images%5c..%5c..%5csecret.txt"],
		["NUL bytes", "images/a.webp%00.png"],
		["dotfiles", "images/.env"],
		["empty segments", "images//a.webp"],
		["malformed encoding", "images/%E0%A4%A"],
		["the root itself", "/"],
		["empty", ""],
	])("rejects %s", (_label, key) => {
		expect(resolveInside(root, key)).toBeNull()
	})
})
