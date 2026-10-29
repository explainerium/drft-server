import { describe, expect, it } from "vitest"
import { MailCopy, storeLink } from "../../src/helpers/mailer/messages"

describe("storeLink", () => {
	it("keeps German links at the root and puts English ones under /en", () => {
		expect(storeLink("/verify-email?token=t", "de")).toMatch(/\/verify-email\?token=t$/)
		expect(storeLink("/verify-email?token=t", "de")).not.toContain("/en/")
		expect(storeLink("/verify-email?token=t", "en")).toMatch(/\/en\/verify-email\?token=t$/)
	})
})

describe("MailCopy", () => {
	it("writes each mail in the customer's language", () => {
		expect(MailCopy.verifyEmail("de", { firstName: "Lea", url: "u" }).subject).toBe("Bestätigen Sie Ihr DRFT-Konto")
		expect(MailCopy.verifyEmail("en", { url: "u" }).subject).toBe("Confirm your DRFT account")
		const shipped = MailCopy.orderShipped("de", { label: "DRFT-10001", firstName: "Lea", trackingNumber: "123" })
		expect(shipped.paragraphs[0]).toBe("Hallo Lea,")
		expect(shipped.details).toContainEqual({ label: "Sendungsnummer", value: "123" })
		expect(MailCopy.orderCancelled("en", { label: "DRFT-10001" }).heading).toBe("Your order was cancelled")
	})
})
