import { describe, expect, it } from "vitest"
import { decideRefresh, REFRESH_GRACE_MS } from "../../../src/domain/auth/refreshDecision"

const now = new Date("2026-10-18T12:00:00Z")
const later = new Date(now.getTime() + 86_400_000)
const ago = (ms: number) => new Date(now.getTime() - ms)

describe("decideRefresh", () => {
	it("rotates a valid, unused token", () => {
		expect(decideRefresh({ expiresAt: later, revokedAt: null, rotatedAt: null }, now)).toEqual({ kind: "ROTATE" })
	})

	it("rejects an expired token, even if never used", () => {
		expect(decideRefresh({ expiresAt: now, revokedAt: null, rotatedAt: null }, now)).toEqual({ kind: "INVALID" })
	})

	it("tolerates a token rotated moments ago (parallel refresh)", () => {
		const t = ago(REFRESH_GRACE_MS - 1)
		expect(decideRefresh({ expiresAt: later, revokedAt: t, rotatedAt: t }, now)).toEqual({ kind: "GRACE" })
	})

	it("flags a token rotated long ago as reuse", () => {
		const t = ago(REFRESH_GRACE_MS + 1)
		expect(decideRefresh({ expiresAt: later, revokedAt: t, rotatedAt: t }, now)).toEqual({ kind: "REUSE" })
	})

	it("gives no grace to a token revoked by logout or password reset", () => {
		expect(decideRefresh({ expiresAt: later, revokedAt: ago(1_000), rotatedAt: null }, now)).toEqual({
			kind: "INVALID",
		})
	})
})
