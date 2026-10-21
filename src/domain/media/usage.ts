/**
 * Where an asset is still used, as a sentence for the 409 on delete.
 *
 * Each entry is the total count plus a few example names (the service fetches
 * at most a handful). Returns null when the asset is unused.
 */
export interface UsageEntry {
	total: number
	names: string[]
}

export interface AssetUsage {
	productGalleries: UsageEntry
	featuredProducts: UsageEntry
	categories: UsageEntry
	variants: UsageEntry
	/** The story photo in a product's editorial content (Product.content.story). */
	productStories: UsageEntry
	/** e.g. "SEO default share image"; settings are few, so no count is needed. */
	settings: string[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const list = (entry: UsageEntry): string => {
	const shown = entry.names.slice(0, 3)
	const rest = entry.total - shown.length
	if (!shown.length) return ""
	return ` (${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""})`
}

export const describeAssetUsage = (usage: AssetUsage): string | null => {
	const parts: string[] = []

	if (usage.productGalleries.total) {
		parts.push(`the gallery of ${plural(usage.productGalleries.total, "product", "products")}${list(usage.productGalleries)}`)
	}
	if (usage.featuredProducts.total) {
		parts.push(
			`the featured image of ${plural(usage.featuredProducts.total, "product", "products")}${list(usage.featuredProducts)}`
		)
	}
	if (usage.categories.total) {
		parts.push(`${plural(usage.categories.total, "category", "categories")}${list(usage.categories)}`)
	}
	if (usage.variants.total) {
		parts.push(`${plural(usage.variants.total, "variant", "variants")}${list(usage.variants)}`)
	}
	if (usage.productStories.total) {
		parts.push(`the story photo of ${plural(usage.productStories.total, "product", "products")}${list(usage.productStories)}`)
	}
	for (const setting of usage.settings) parts.push(`the ${setting} setting`)

	if (!parts.length) return null
	return `This image is still used by ${parts.join("; ")}. Remove it there first.`
}
