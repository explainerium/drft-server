import request from "supertest"
import { describe, expect, it } from "vitest"
import app from "../../src/app"

// Input validation runs before any database access, so these need no DB.
describe("cart routes without a database", () => {
	it("rejects an add without a valid variant id or with too many items", async () => {
		const res = await request(app).post("/api/v1/cart/items").send({ variantId: "nope", quantity: 11 })

		expect(res.status).toBe(400)
		expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(
			expect.arrayContaining(["variantId", "quantity"])
		)
	})

	it("rejects a quantity of zero (removing is its own route)", async () => {
		const res = await request(app)
			.patch("/api/v1/cart/items/3f0c2a8e-6b1d-4c5e-9a7f-2d4b6c8e0a1b")
			.send({ quantity: 0 })

		expect(res.status).toBe(400)
	})
})
