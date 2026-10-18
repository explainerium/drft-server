import { describe, expect, it } from "vitest"
import { checkSvg } from "../../../src/domain/media/svg"
import { signUploadToken, verifyUploadToken, type UploadTokenPayload } from "../../../src/domain/media/uploadToken"

const svg = (inner: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`)

describe("checkSvg", () => {
	it("accepts a plain SVG with internal references", () => {
		expect(checkSvg(svg('<defs><path id="p" d="M0 0h10"/></defs><use href="#p"/>'))).toBeNull()
	})

	it.each([
		["scripts", "<script>alert(1)</script>"],
		["event handlers", '<rect onload="alert(1)"/>'],
		["javascript URLs", '<a href="javascript:alert(1)"><rect/></a>'],
		["foreignObject", "<foreignObject><div/></foreignObject>"],
		["external references", '<image href="https://evil.example/x.png"/>'],
	])("rejects %s", (_label, inner) => {
		expect(checkSvg(svg(inner))).not.toBeNull()
	})

	it("rejects entities and non-SVG content", () => {
		expect(checkSvg(Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'))).not.toBeNull()
		expect(checkSvg(Buffer.from("<html></html>"))).not.toBeNull()
	})
})

describe("upload token", () => {
	const secret = "test-secret-test-secret-test-secret"
	const now = new Date("2026-10-18T12:00:00Z")
	const payload: UploadTokenPayload = {
		key: "images/2026/10/0123456789abcdef0123456789abcdef.jpg",
		contentType: "image/jpeg",
		sizeBytes: 12_000_000,
		originalName: "kite.jpg",
		userId: "user-1",
		exp: now.getTime() / 1000 + 600,
	}

	it("round-trips a valid token", () => {
		expect(verifyUploadToken(secret, signUploadToken(secret, payload), now)).toEqual(payload)
	})

	it("rejects expired, tampered or foreign tokens", () => {
		const token = signUploadToken(secret, payload)
		expect(verifyUploadToken(secret, token, new Date(now.getTime() + 601_000))).toBeNull()
		expect(verifyUploadToken("another-secret-another-secret-xx", token, now)).toBeNull()

		const forged = Buffer.from(JSON.stringify({ ...payload, sizeBytes: 999_999_999 })).toString("base64url")
		expect(verifyUploadToken(secret, `${forged}.${token.split(".")[1]}`, now)).toBeNull()
		expect(verifyUploadToken(secret, "garbage", now)).toBeNull()
	})
})
