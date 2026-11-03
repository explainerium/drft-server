import type { Locale } from "../i18n/locale"

/**
 * Site texts: storefront strings changed in the admin. The frontend's message
 * files are the defaults; the database holds only what differs, one row per
 * text and language. A key is the message path ("home.hero.title").
 */

export const SITE_TEXT_MAX_LENGTH = 2000

const KEY = /^[A-Za-z][\w-]*(?:\.[\w-]+){1,9}$/

/** A message path of the storefront. The admin's own texts ("admin.*") are not part of the site. */
export const isSiteTextKey = (key: string): boolean => key.length <= 200 && KEY.test(key) && !key.startsWith("admin.")

export const siteTextId = (locale: string, key: string) => `${locale}:${key}`

/** One edit from the admin. An empty value goes back to the default text. */
export interface SiteTextChange {
	key: string
	locale: Locale
	value: string
}

export interface SiteTextPlan {
	upserts: { key: string; locale: Locale; value: string }[]
	resets: { key: string; locale: Locale }[]
	/** One per real change: the new value, or null when the text went back to the default. */
	revisions: { key: string; locale: Locale; value: string | null }[]
}

/**
 * What a save writes, given the stored values (by `siteTextId`). The last change
 * to a text wins; a value that is already stored, or a reset of a text that has
 * no override, writes nothing and leaves no history.
 */
export const planSiteTextChanges = (stored: ReadonlyMap<string, string>, changes: SiteTextChange[]): SiteTextPlan => {
	const latest = new Map<string, SiteTextChange>()
	for (const change of changes) latest.set(siteTextId(change.locale, change.key), change)

	const plan: SiteTextPlan = { upserts: [], resets: [], revisions: [] }
	for (const [id, { key, locale, value }] of latest) {
		const current = stored.get(id)
		if (value === "") {
			if (current === undefined) continue
			plan.resets.push({ key, locale })
			plan.revisions.push({ key, locale, value: null })
		} else if (value !== current) {
			plan.upserts.push({ key, locale, value })
			plan.revisions.push({ key, locale, value })
		}
	}
	return plan
}
