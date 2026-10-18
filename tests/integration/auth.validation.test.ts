import request from "supertest"
import { describe, expect, it } from "vitest"
import app from "../../src/app"

// Input validation and guards run before any database access, so these need no DB.
describe("auth routes without a database", () => {
	it("rejects a registration with an invalid email and short password", async () => {
		const res = await request(app)
			.post("/api/v1/auth/register")
			.send({ email: "not-an-email", password: "short", firstName: "A", lastName: "B" })

		expect(res.status).toBe(400)
		expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(expect.arrayContaining(["email", "password"]))
	})

	it("answers 201 to a honeypot registration without creating anything", async () => {
		const res = await request(app)
			.post("/api/v1/auth/register")
			.send({ email: "bot@example.com", password: "longenough", firstName: "B", lastName: "Ot", website: "spam" })

		expect(res.status).toBe(201)
		expect(res.body.data).toBeUndefined()
	})

	it("requires authentication for /auth/me", async () => {
		const res = await request(app).get("/api/v1/auth/me")
		expect(res.status).toBe(401)
	})

	it("rejects a forged access token", async () => {
		const res = await request(app).get("/api/v1/auth/me").set("Cookie", "drft_access=not.a.jwt")
		expect(res.status).toBe(401)
	})

	it("keeps admin user management behind auth", async () => {
		const res = await request(app).get("/api/v1/users")
		expect(res.status).toBe(401)
	})

	it("refresh without a token fails and clears cookies", async () => {
		const res = await request(app).post("/api/v1/auth/refresh")
		expect(res.status).toBe(401)
		expect(String(res.headers["set-cookie"])).toContain("drft_access=;")
	})
})
