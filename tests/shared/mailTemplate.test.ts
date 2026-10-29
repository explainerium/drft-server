import { describe, expect, it } from "vitest"
import { escapeHtml, renderMail } from "../../src/helpers/mailer/template"

describe("renderMail", () => {
	const mail = renderMail({
		to: "rider@example.com",
		subject: "Confirm your account",
		preheader: "One click left",
		heading: "Welcome, <Leo>",
		paragraphs: ["Line one\nline two"],
		action: { label: "Confirm", url: "https://drft.example/verify?token=a&b=1" },
		details: [{ label: "Order", value: "DRFT-10001" }],
		footnote: "You signed up on drft.example.",
	})

	it("escapes every value in the HTML", () => {
		expect(mail.html).toContain("Welcome, &lt;Leo&gt;")
		expect(mail.html).not.toContain("<Leo>")
		expect(mail.html).toContain('href="https://drft.example/verify?token=a&amp;b=1"')
	})

	it("keeps line breaks and the details", () => {
		expect(mail.html).toContain("Line one<br>line two")
		expect(mail.html).toContain("DRFT-10001")
	})

	it("has a plain-text version with the link written out", () => {
		expect(mail.text).toContain("Welcome, <Leo>")
		expect(mail.text).toContain("Confirm: https://drft.example/verify?token=a&b=1")
		expect(mail.text).toContain("Order: DRFT-10001")
		expect(mail.text).toContain("You signed up on drft.example.")
	})
})

describe("escapeHtml", () => {
	it("escapes the five special characters", () => {
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
	})
})

describe("renderMail language", () => {
	it("writes the fixed texts in German by default and in English on request", () => {
		const base = { to: "a@b.test", subject: "S", heading: "H", paragraphs: [], action: { label: "Go", url: "https://x.test" } }
		const de = renderMail(base)
		expect(de.html).toContain('<html lang="de">')
		expect(de.html).toContain("Falls der Button nicht funktioniert")
		expect(de.text).toContain("DRFT · Kitesurf- & Foil-Ausrüstung")
		const en = renderMail({ ...base, locale: "en" })
		expect(en.html).toContain("If the button doesn&#39;t work")
		expect(en.text).toContain("DRFT · Kitesurf & foil equipment")
	})
})
