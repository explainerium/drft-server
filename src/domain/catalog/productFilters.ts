/**
 * Storefront attribute filters: any query key that is not a known parameter is
 * read as an attribute code, its value as one or more attribute value codes.
 *
 *   ?size=9m,10m&color=black   →  [{ code: "size", values: ["9m", "10m"] }, { code: "color", values: ["black"] }]
 *
 * Attribute codes may not use these names, or their filter could never be reached.
 */
export const RESERVED_PRODUCT_QUERY_KEYS = [
	"page",
	"limit",
	"sort",
	"sortBy",
	"sortOrder",
	"search",
	"category",
	"featured",
	"minPrice",
	"maxPrice",
] as const

export interface AttributeFilter {
	code: string
	values: string[]
}

const reserved = new Set<string>(RESERVED_PRODUCT_QUERY_KEYS)

export const isReservedQueryKey = (key: string): boolean => reserved.has(key)

export const parseAttributeFilters = (query: Record<string, unknown>): AttributeFilter[] => {
	const filters: AttributeFilter[] = []
	for (const [code, raw] of Object.entries(query)) {
		if (reserved.has(code)) continue
		const parts = (Array.isArray(raw) ? raw : [raw])
			.filter((v): v is string => typeof v === "string")
			.flatMap((v) => v.split(","))
			.map((v) => v.trim().toLowerCase())
			.filter(Boolean)
		const values = [...new Set(parts)]
		if (values.length) filters.push({ code: code.toLowerCase(), values })
	}
	return filters
}
