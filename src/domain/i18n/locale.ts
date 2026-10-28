/**
 * Store languages. Content columns hold German, the main language; other
 * languages live in a `translations` JSON column as { en: { <field>: <text> } }
 * and fall back to the German text field by field.
 */
export const LOCALES = ["de", "en"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "de"

export const parseLocale = (value: unknown): Locale =>
	typeof value === "string" && (LOCALES as readonly string[]).includes(value) ? (value as Locale) : DEFAULT_LOCALE

/** The translation object of one language, if the stored JSON has one. */
export const translationOf = (translations: unknown, locale: Locale): Record<string, unknown> | null => {
	if (locale === DEFAULT_LOCALE || !translations || typeof translations !== "object") return null
	const value = (translations as Record<string, unknown>)[locale]
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** `row` with each listed text field replaced by its non-empty translation. */
export const localize = <T extends object>(row: T, translations: unknown, locale: Locale, fields: readonly (keyof T & string)[]): T => {
	const translation = translationOf(translations, locale)
	if (!translation) return row
	const out = { ...row }
	for (const field of fields) {
		const value = translation[field]
		if (typeof value === "string" && value.trim()) (out as Record<string, unknown>)[field] = value
	}
	return out
}
