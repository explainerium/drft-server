/**
 * Pure rules for a product payload: variants, related products, publish date.
 * The product service turns a failed rule into a 400.
 *
 * Amounts arrive as validated strings ("12.5", "1200.00"), so comparisons are
 * done in integer cents, never as JS floats.
 */
export type RuleResult<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T>(value: T): RuleResult<T> => ({ ok: true, value })
const fail = <T>(error: string): RuleResult<T> => ({ ok: false, error })

/** Up to 10 integer digits (Decimal(12, 2)), up to 2 decimals, never negative. */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/

/** "12.5" → 1250. Only call with strings that match MONEY_PATTERN. */
export const toCents = (amount: string): number => {
	const [whole = "0", fraction = ""] = amount.split(".")
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
}

export interface VariantRuleInput {
	sku?: string | null
	price: string
	compareAtPrice?: string | null
	isDefault?: boolean
	attributeValueIds: string[]
}

export type NormalizedVariant<T extends VariantRuleInput> = T & { isDefault: boolean; attributeValueIds: string[] }

const labelOf = (v: VariantRuleInput, index: number): string => (v.sku ? `Variant ${v.sku}` : `Variant ${index + 1}`)

/**
 * Checks a product's full variant list and returns it normalized:
 *
 * - at least one variant
 * - at most one flagged default; none flagged → the first one is the default
 * - compareAtPrice, when set, is higher than price
 * - no SKU twice in the payload
 * - attribute value ids de-duplicated per variant
 * - with `attributeOfValue` (value id → attribute id): every value is known,
 *   a variant has at most one value per attribute, and every variant uses the
 *   same attributes (a picker cannot render "Size" for half the variants)
 * - no two variants with the identical attribute value set
 */
export const normalizeVariants = <T extends VariantRuleInput>(
	variants: T[],
	attributeOfValue?: ReadonlyMap<string, string>
): RuleResult<NormalizedVariant<T>[]> => {
	if (variants.length === 0) return fail("A product needs at least one variant")

	const flagged = variants.filter((v) => v.isDefault).length
	if (flagged > 1) return fail("Only one variant can be the default")
	const defaultIndex = Math.max(
		0,
		variants.findIndex((v) => v.isDefault)
	)

	const skus = new Set<string>()
	const combinations = new Map<string, number>()
	let axes: string | undefined

	const normalized: NormalizedVariant<T>[] = []

	for (const [i, v] of variants.entries()) {
		const label = labelOf(v, i)

		if (v.compareAtPrice != null && toCents(v.compareAtPrice) <= toCents(v.price)) {
			return fail(`${label}: the compare-at price must be higher than the price`)
		}

		if (v.sku) {
			if (skus.has(v.sku)) return fail(`SKU ${v.sku} is used by more than one variant`)
			skus.add(v.sku)
		}

		const valueIds = [...new Set(v.attributeValueIds)].sort()

		if (attributeOfValue) {
			const attributes: string[] = []
			for (const valueId of valueIds) {
				const attributeId = attributeOfValue.get(valueId)
				if (!attributeId) return fail(`${label}: unknown attribute value ${valueId}`)
				if (attributes.includes(attributeId)) {
					return fail(`${label}: only one value per attribute is allowed`)
				}
				attributes.push(attributeId)
			}
			const key = attributes.sort().join("|")
			if (axes === undefined) axes = key
			else if (axes !== key) return fail("All variants must use the same attributes")
		}

		const combination = valueIds.join("|")
		const clash = combinations.get(combination)
		if (clash !== undefined) {
			return fail(`${labelOf(variants[clash]!, clash)} and ${label} have the same attribute values`)
		}
		combinations.set(combination, i)

		normalized.push({ ...v, isDefault: i === defaultIndex, attributeValueIds: valueIds })
	}

	return ok(normalized)
}

/** Related products: never the product itself, no duplicates, order kept. */
export const normalizeRelatedIds = (productId: string | undefined, relatedIds: string[]): RuleResult<string[]> => {
	if (productId && relatedIds.includes(productId)) return fail("A product cannot be related to itself")
	return ok([...new Set(relatedIds)])
}

/** First publish stamps publishedAt; later status changes keep the original date. */
export const resolvePublishedAt = (
	status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
	current: Date | null,
	now: Date = new Date()
): Date | null => (status === "PUBLISHED" && !current ? now : current)
