import { describe, expect, it } from "vitest"
import { type CurrentVariant, planProductImport } from "../../../src/domain/catalog/productCsv"

const variant = (sku: string, overrides: Partial<CurrentVariant> = {}): CurrentVariant => ({
	id: `id-${sku}`,
	sku,
	productName: "Aero V3",
	price: "1290.00",
	compareAtPrice: null,
	stock: 5,
	isActive: true,
	...overrides,
})
const current = new Map([variant("AERO-9"), variant("AERO-10", { compareAtPrice: "1490.00" })].map((v) => [v.sku, v]))
const header = ["product_name", "sku", "price", "compare_at_price", "stock", "active"]

describe("planProductImport", () => {
	it("patches only what changed and reports it", () => {
		const plan = planProductImport(
			[header, ["Aero V3", "AERO-9", "1190", "1290", "5", "true"], ["Aero V3", "AERO-10", "1290.00", "1490", "2", "yes"]],
			current
		)
		expect(plan.error).toBeUndefined()
		expect(plan.patches).toEqual([
			{ id: "id-AERO-9", price: "1190", compareAtPrice: "1290" },
			{ id: "id-AERO-10", stock: 2 },
		])
		expect(plan.rows[0]).toMatchObject({
			line: 2,
			result: "update",
			changes: [
				{ field: "price", from: "1290.00", to: "1190" },
				{ field: "compare_at_price", from: "", to: "1290" },
			],
		})
	})

	it("treats an empty compare-at price as none and leaves equal amounts alone", () => {
		const plan = planProductImport([header, ["", "AERO-10", "1290", "", "5", "1"]], current)
		expect(plan.patches).toEqual([{ id: "id-AERO-10", compareAtPrice: null }])

		const same = planProductImport([header, ["", "AERO-9", "1290", "", "5", "TRUE"]], current)
		expect(same.rows[0]?.result).toBe("unchanged")
		expect(same.patches).toEqual([])
	})

	it("reports bad rows with their line and keeps going", () => {
		const plan = planProductImport(
			[
				header,
				["", "", "1", "", "1", "true"],
				["", "NOPE", "1", "", "1", "true"],
				["", "AERO-9", "12,50", "", "1", "true"],
				["", "AERO-10", "1500", "1490", "1", "true"],
				["", "AERO-9", "1", "", "1", "true"],
			],
			current
		)
		expect(plan.rows.map((r) => [r.line, r.result, r.error])).toEqual([
			[2, "error", "No SKU"],
			[3, "error", "No variant has this SKU"],
			[4, "error", "Price: enter an amount with at most 2 decimals, e.g. 1290 or 1290.50"],
			[5, "error", "The compare-at price must be higher than the price"],
			[6, "error", "This SKU is listed twice"],
		])
	})

	it("only touches the columns in the file", () => {
		const plan = planProductImport([["sku", "stock"], ["AERO-9", "0"]], current)
		expect(plan.patches).toEqual([{ id: "id-AERO-9", stock: 0 }])
	})

	it("refuses a file without a SKU or an editable column", () => {
		expect(planProductImport([["name", "price"]], current).error).toMatch(/sku/)
		expect(planProductImport([["sku", "product_name"]], current).error).toMatch(/Nothing to import/)
		expect(planProductImport([], current).error).toBe("The file is empty")
	})
})
