import { z } from "zod"

/**
 * Editorial blocks of a product page, stored as one JSON column
 * (`Product.content`). Every block is optional: the page renders the ones
 * that are filled in. Plain text only, no HTML.
 */
const text = (max: number) => z.string().trim().min(1).max(max)

export const productContentSchema = z.object({
	// Short feature note under the gallery.
	highlight: z.object({ title: text(120), body: text(400) }).optional(),
	// Line after the type label above the name, e.g. "High-aspect profile".
	profile: text(60).optional(),
	// "Rider's perspective" story with key figures and a pull quote.
	story: z
		.object({
			eyebrow: text(80),
			title: text(160),
			paragraphs: z.array(text(1_200)).min(1).max(4),
			stats: z.array(z.object({ value: text(16), label: text(60) })).max(4).default([]),
			quote: z.object({ label: text(80).optional(), text: text(300), author: text(120) }).optional(),
			// Media library asset behind the pull quote.
			imageAssetId: z.uuid().optional(),
		})
		.optional(),
	// "Key innovations" bento.
	features: z
		.object({
			eyebrow: text(80),
			title: text(160),
			intro: text(400).optional(),
			items: z
				.array(
					z.object({
						label: text(60),
						title: text(80),
						body: text(500),
						footnote: text(60).optional(),
						footnoteValue: text(60).optional(),
					})
				)
				.min(1)
				.max(6),
		})
		.optional(),
	inTheBox: z.array(text(160)).max(12).optional(),
})

export type ProductContent = z.infer<typeof productContentSchema>

/** Reads the stored JSON defensively: anything that no longer fits the schema is dropped, never a 500. */
export const readProductContent = (json: unknown): ProductContent => {
	const parsed = productContentSchema.safeParse(json ?? {})
	return parsed.success ? parsed.data : {}
}
