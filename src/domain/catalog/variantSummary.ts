import { toCents } from "./variantRules"

/**
 * What a product card shows about its variants: the price range, the
 * compare-at price of the cheapest one, and whether anything is in stock.
 * Prices come in as "12.00" strings (Decimal.toFixed(2)).
 */
export interface StockInput {
	manageStock: boolean
	stock: number
}

export interface SummaryVariant extends StockInput {
	price: string
	compareAtPrice: string | null
	isActive: boolean
	isDefault: boolean
}

export interface VariantSummary {
	minPrice: string | null
	maxPrice: string | null
	compareAtPrice: string | null
	inStock: boolean
}

/** Untracked stock is always available; tracked stock needs at least one unit. */
export const isInStock = (v: StockInput): boolean => !v.manageStock || v.stock > 0

export const summarizeVariants = (variants: SummaryVariant[]): VariantSummary => {
	const active = variants.filter((v) => v.isActive)
	if (active.length === 0) return { minPrice: null, maxPrice: null, compareAtPrice: null, inStock: false }

	// Cheapest first; on a tie the default variant wins so its compare-at shows.
	const sorted = [...active].sort(
		(a, b) => toCents(a.price) - toCents(b.price) || Number(b.isDefault) - Number(a.isDefault)
	)
	const cheapest = sorted[0]!
	const dearest = sorted[sorted.length - 1]!

	return {
		minPrice: cheapest.price,
		maxPrice: dearest.price,
		compareAtPrice: cheapest.compareAtPrice,
		inStock: active.some(isInStock),
	}
}
