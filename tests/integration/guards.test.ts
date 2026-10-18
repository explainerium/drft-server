import request from "supertest"
import { describe, expect, it } from "vitest"
import app from "../../src/app"

// Every staff/admin route must refuse an anonymous caller before touching the DB.
const protectedRoutes: [method: "get" | "post" | "patch" | "put" | "delete", path: string][] = [
	["get", "/api/v1/users"],
	["post", "/api/v1/users/staff"],
	["get", "/api/v1/account/addresses"],
	["get", "/api/v1/categories/admin/list"],
	["post", "/api/v1/categories/admin"],
	["get", "/api/v1/attributes/admin/list"],
	["post", "/api/v1/attributes/admin"],
	["get", "/api/v1/products/admin/list"],
	["post", "/api/v1/products/admin"],
	["delete", "/api/v1/products/admin/00000000-0000-0000-0000-000000000000"],
	["get", "/api/v1/media"],
	["post", "/api/v1/media"],
	["post", "/api/v1/media/presign"],
	["get", "/api/v1/media/folders"],
	["get", "/api/v1/settings/store"],
	["put", "/api/v1/settings/store"],
]

describe("route guards", () => {
	it.each(protectedRoutes)("%s %s requires authentication", async (method, path) => {
		const res = await request(app)[method](path)
		expect(res.status).toBe(401)
	})

	it("serves /media with a 404 for a missing file, never a directory escape", async () => {
		const res = await request(app).get("/media/..%2f..%2fpackage.json")
		expect([400, 404]).toContain(res.status)
	})
})
