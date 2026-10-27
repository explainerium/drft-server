import request from "supertest"
import { describe, expect, it } from "vitest"
import app from "../../src/app"

describe("GET /api/v1/auth/session", () => {
	it("answers a visitor with null, not a 401", async () => {
		const res = await request(app).get("/api/v1/auth/session")

		expect(res.status).toBe(200)
		expect(res.body.data).toBeNull()
	})

	it("asks for a refresh when the session cookie outlived the access token", async () => {
		const res = await request(app).get("/api/v1/auth/session").set("Cookie", "drft_session=CUSTOMER")

		expect(res.status).toBe(401)
	})
})
