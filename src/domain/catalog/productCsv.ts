import { MONEY_PATTERN, toCents } from "./variantRules"

/**
 * Bulk price and stock edits through a spreadsheet: the admin exports every
 * variant, edits the price, compare_at_price, stock or active columns and
 * imports the file. Rows are matched by SKU; every other column is there to
 * read and is ignored on import. Pure functions, so the rules are testable
 * without a database.
 */

export const PRODUCT_CSV_HEADER = [
	"product_slug",
	"product_name",
	"status",
	"categories",
	"sku",
	"options",
	"price",
	"compare_at_price",
	"stock",
	"manage_stock",
	"allow_backorder",
	"active",
] as const

const EDITABLE = ["price", "compare_at_price", "stock", "active"] as const
type Editable = (typeof EDITABLE)[number]

export const MAX_IMPORT_ROWS = 5_000

export interface CurrentVariant {
	id: string
	sku: string
	productName: string
	price: string
	compareAtPrice: string | null
	stock: number
	isActive: boolean
}

export interface VariantPatch {
	id: string
	price?: string
	compareAtPrice?: string | null
	stock?: number
	isActive?: boolean
}

export interface ImportRowResult {
	/** Line in the file, counting the header as line 1. */
	line: number
	sku: string
	product: string | null
	result: "update" | "unchanged" | "error"
	changes: { field: Editable; from: string; to: string }[]
	error?: string
}

export interface ImportPlan {
	rows: ImportRowResult[]
	patches: VariantPatch[]
	/** A problem with the file itself (no header, no SKU column, too many rows). */
	error?: string
}

const BOOLEAN: Record<string, boolean> = { true: true, yes: true, "1": true, false: false, no: false, "0": false }

/** Undoes the formula defusing of the export ("'-5" was written for "-5"). */
const cell = (value: string | undefined) => (value ?? "").trim().replace(/^'(?=[=+\-@])/, "")

export const planProductImport = (table: string[][], current: Map<string, CurrentVariant>): ImportPlan => {
	const [header, ...body] = table
	if (!header) return { rows: [], patches: [], error: "The file is empty" }

	const column = new Map(header.map((name, i) => [name.trim().toLowerCase(), i]))
	const skuAt = column.get("sku")
	if (skuAt === undefined) return { rows: [], patches: [], error: 'The file needs a "sku" column' }
	const editable = EDITABLE.filter((name) => column.has(name))
	if (!editable.length) {
		return { rows: [], patches: [], error: `Nothing to import: add one of the columns ${EDITABLE.join(", ")}` }
	}
	if (body.length > MAX_IMPORT_ROWS) {
		return { rows: [], patches: [], error: `At most ${MAX_IMPORT_ROWS} rows per file` }
	}

	const seen = new Set<string>()
	const rows: ImportRowResult[] = []
	const patches: VariantPatch[] = []

	for (const [index, fields] of body.entries()) {
		const line = index + 2
		const sku = cell(fields[skuAt])
		const variant = sku ? current.get(sku) : undefined
		const result: ImportRowResult = { line, sku, product: variant?.productName ?? null, result: "unchanged", changes: [] }
		rows.push(result)

		const fail = (error: string) => {
			result.result = "error"
			result.error = error
		}
		if (!sku) {
			fail("No SKU")
			continue
		}
		if (seen.has(sku)) {
			fail("This SKU is listed twice")
			continue
		}
		seen.add(sku)
		if (!variant) {
			fail("No variant has this SKU")
			continue
		}

		const value = (name: Editable) => cell(fields[column.get(name)!])
		const patch: VariantPatch = { id: variant.id }

		let price = variant.price
		if (editable.includes("price")) {
			const raw = value("price")
			if (!MONEY_PATTERN.test(raw)) {
				fail("Price: enter an amount with at most 2 decimals, e.g. 1290 or 1290.50")
				continue
			}
			price = raw
			if (toCents(raw) !== toCents(variant.price)) patch.price = raw
		}

		if (editable.includes("compare_at_price")) {
			// Empty means no compare-at price, as in the export.
			const raw = value("compare_at_price")
			if (raw && !MONEY_PATTERN.test(raw)) {
				fail("Compare-at price: enter an amount with at most 2 decimals, or leave it empty")
				continue
			}
			const next = raw || null
			const currentCents = variant.compareAtPrice === null ? null : toCents(variant.compareAtPrice)
			if ((next === null ? null : toCents(next)) !== currentCents) patch.compareAtPrice = next
		}
		const compareAt = patch.compareAtPrice !== undefined ? patch.compareAtPrice : variant.compareAtPrice
		if (compareAt !== null && toCents(compareAt) <= toCents(price)) {
			fail("The compare-at price must be higher than the price")
			continue
		}

		if (editable.includes("stock")) {
			const raw = value("stock")
			if (!/^\d{1,7}$/.test(raw) || Number(raw) > 1_000_000) {
				fail("Stock: enter a whole number from 0 to 1000000")
				continue
			}
			if (Number(raw) !== variant.stock) patch.stock = Number(raw)
		}

		if (editable.includes("active")) {
			const raw = value("active").toLowerCase()
			if (!(raw in BOOLEAN)) {
				fail("Active: enter true or false")
				continue
			}
			if (BOOLEAN[raw] !== variant.isActive) patch.isActive = BOOLEAN[raw]
		}

		const from = {
			price: variant.price,
			compare_at_price: variant.compareAtPrice ?? "",
			stock: String(variant.stock),
			active: String(variant.isActive),
		}
		const to = {
			price: patch.price,
			compare_at_price: patch.compareAtPrice === undefined ? undefined : (patch.compareAtPrice ?? ""),
			stock: patch.stock === undefined ? undefined : String(patch.stock),
			active: patch.isActive === undefined ? undefined : String(patch.isActive),
		}
		for (const field of EDITABLE) {
			const next = to[field]
			if (next !== undefined) result.changes.push({ field, from: from[field], to: next })
		}
		if (result.changes.length) {
			result.result = "update"
			patches.push(patch)
		}
	}

	return { rows, patches }
}
