import request from "supertest"
import { describe, expect, it } from "vitest"
import app from "../../src/app"

describe("app", () => {
	it("GET /health reports the API is running", async () => {
		const res = await request(app).get("/health")

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({ success: true, statusCode: 200, data: { env: "test" } })
	})

	it("unknown routes return the standard 404 shape", async () => {
		const res = await request(app).get("/api/v1/does-not-exist")

		expect(res.status).toBe(404)
		expect(res.body).toMatchObject({ success: false, statusCode: 404 })
	})
})
