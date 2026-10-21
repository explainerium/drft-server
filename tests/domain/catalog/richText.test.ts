import { describe, expect, it } from "vitest"
import { sanitizeRichText } from "../../../src/domain/catalog/richText"

describe("sanitizeRichText", () => {
	it("keeps the editor's formatting", () => {
		const html = "<h3>Built for big air</h3><p>A <strong>stiff</strong> <em>frame</em>.</p><ul><li>One</li></ul>"
		expect(sanitizeRichText(html)).toBe(html)
	})

	it("drops scripts, styles, event handlers and images", () => {
		expect(sanitizeRichText('<p onclick="x()" style="color:red">Hi<script>alert(1)</script></p><img src=x onerror=alert(1)>')).toBe(
			"<p>Hi</p>"
		)
	})

	it("keeps safe links and makes them safe to open", () => {
		expect(sanitizeRichText('<a href="https://drft.example" target="_blank">Site</a>')).toBe(
			'<a href="https://drft.example" target="_blank" rel="noopener noreferrer nofollow">Site</a>'
		)
	})

	it("removes javascript: links but keeps their text", () => {
		expect(sanitizeRichText('<p><a href="javascript:alert(1)">Click</a></p>')).toBe("<p>Click</p>")
	})

	it("turns an empty editor into null", () => {
		expect(sanitizeRichText("<p></p>")).toBeNull()
		expect(sanitizeRichText("<p>&nbsp;</p>")).toBeNull()
		expect(sanitizeRichText(null)).toBeNull()
	})
})
