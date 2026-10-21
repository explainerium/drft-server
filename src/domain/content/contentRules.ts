/**
 * Content rules: reading time for journal posts and the order of FAQ groups.
 * Kept free of Prisma so it is unit tested directly.
 */

const WORDS_PER_MINUTE = 200

/** Minutes to read sanitized HTML (tags dropped), at least 1. */
export const readingMinutes = (html: string | null | undefined): number => {
	const text = (html ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ")
	const words = text.split(/\s+/).filter(Boolean).length
	return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

export interface FaqRow {
	group: string | null
	question: string
	answer: string
	sortOrder: number
}

/**
 * FAQ items as groups, in the order their first item appears (items are
 * already sorted by sortOrder). Items without a group come last, under null.
 */
export const groupFaq = <T extends FaqRow>(items: T[]): { group: string | null; items: T[] }[] => {
	const groups = new Map<string | null, T[]>()
	for (const item of items) {
		const key = item.group?.trim() || null
		groups.set(key, [...(groups.get(key) ?? []), item])
	}
	const named = [...groups.entries()].filter(([key]) => key !== null)
	const ungrouped = groups.get(null)
	return [...named, ...(ungrouped ? [[null, ungrouped] as const] : [])].map(([group, list]) => ({ group, items: list }))
}
