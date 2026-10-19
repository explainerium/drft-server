import request from "supertest"
import { describe, expect, it } from "vitest"
import app from "../../src/app"

// Input validation runs before any database access, so these need no DB.
describe("checkout routes without a database", () => {
	it("rejects an order without contact, address or shipping method", async () => {
		const res = await request(app).post("/api/v1/checkout/orders").send({ email: "not-an-email", shippingAddress: {} })

		expect(res.status).toBe(400)
		expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(
			expect.arrayContaining(["email", "shippingAddress.firstName", "shippingAddress.phone", "shippingRateId"])
		)
	})

	it("rejects an unknown payment provider", async () => {
		const res = await request(app)
			.post("/api/v1/checkout/orders")
			.send({ paymentProvider: "BITCOIN" })

		expect(res.body.errors.map((e: { path: string }) => e.path)).toContain("paymentProvider")
	})

	it("rejects a malformed country in the quote", async () => {
		const res = await request(app).get("/api/v1/checkout?country=NLD")

		expect(res.status).toBe(400)
	})

	it("rejects an order id that is not a uuid", async () => {
		const res = await request(app).get("/api/v1/orders/10001")

		expect(res.status).toBe(400)
	})

	it("hides the cron route when no secret is configured", async () => {
		const res = await request(app).get("/api/v1/cron/run")

		expect(res.status).toBe(404)
	})
})
