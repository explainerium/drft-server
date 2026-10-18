import { z } from "zod"

/**
 * Every settings group the store understands. One `Setting` row per group:
 * key = group name, value = the group's JSON object.
 *
 * - `schema` validates writes and repairs reads.
 * - `defaults` is what a fresh store returns before anyone saves anything.
 * - `isPublic` groups are readable by the storefront without auth.
 *
 * Kept free of Prisma and env so it is unit tested directly. Adding a group is
 * adding an entry here; the routes pick it up.
 */

const text = (max: number) => z.string().trim().max(max)

/** Empty string or null clears the field (stored as absent). */
const optionalUrl = z
	.union([z.literal(""), z.null(), z.url({ protocol: /^https?$/, error: "Enter a full http(s) URL" })])
	.transform((value) => value || undefined)
	.optional()

const storeSchema = z.object({
	name: text(120).min(1),
	email: z.union([z.literal(""), z.email()]),
	phone: text(40),
	address: text(500),
	// Prices are stored as EUR throughout; the field is informational.
	currency: z.literal("EUR", { error: "The store currency is fixed to EUR" }),
})

const seoSchema = z.object({
	defaultTitle: text(70).min(1),
	titleTemplate: text(100).refine((v) => v.includes("%s"), "The template must contain %s for the page title"),
	defaultDescription: text(300),
	ogImageAssetId: z.uuid().nullable(),
})

const socialSchema = z.object({
	instagram: optionalUrl,
	youtube: optionalUrl,
	facebook: optionalUrl,
	tiktok: optionalUrl,
})

/** "150.00": a non-negative EUR amount with up to two decimals. */
const amount = z
	.string()
	.trim()
	.regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 150 or 150.00")
	.transform((v) => Number(v).toFixed(2))

const shippingSchema = z.object({
	// Orders at or above this subtotal ship free; null turns the offer off.
	freeShippingThreshold: amount.nullable(),
})

const taxSchema = z.object({
	// Prices include VAT. Before the customer's country is known, the cart
	// estimates the included VAT at this rate (the store's home country).
	defaultVatRate: z.number().min(0).max(50),
})

interface SettingGroup<S extends z.ZodObject> {
	description: string
	schema: S
	defaults: z.output<S>
	isPublic: boolean
}

const group = <S extends z.ZodObject>(definition: SettingGroup<S>) => definition

export const SETTING_GROUPS = {
	store: group({
		description: "Store name and contact details",
		schema: storeSchema,
		defaults: { name: "DRFT", email: "", phone: "", address: "", currency: "EUR" },
		isPublic: true,
	}),
	seo: group({
		description: "Default page title, description and share image",
		schema: seoSchema,
		defaults: { defaultTitle: "DRFT", titleTemplate: "%s | DRFT", defaultDescription: "", ogImageAssetId: null },
		isPublic: true,
	}),
	social: group({
		description: "Social media profile links",
		schema: socialSchema,
		defaults: {},
		isPublic: true,
	}),
	shipping: group({
		description: "Free shipping threshold",
		schema: shippingSchema,
		defaults: { freeShippingThreshold: "150.00" },
		isPublic: true,
	}),
	tax: group({
		description: "VAT rate used for estimates before checkout",
		schema: taxSchema,
		defaults: { defaultVatRate: 21 },
		isPublic: true,
	}),
}

export type SettingGroupKey = keyof typeof SETTING_GROUPS
export type SettingValue<K extends SettingGroupKey> = z.output<(typeof SETTING_GROUPS)[K]["schema"]>

export const SETTING_GROUP_KEYS = Object.keys(SETTING_GROUPS) as SettingGroupKey[]
export const PUBLIC_SETTING_GROUPS = SETTING_GROUP_KEYS.filter((key) => SETTING_GROUPS[key].isPublic)

/** Own keys only, so "__proto__" or "constructor" is never a group. */
export const isSettingGroup = (key: string): key is SettingGroupKey => Object.hasOwn(SETTING_GROUPS, key)

type AnyGroup = { schema: z.ZodType<Record<string, unknown>>; defaults: Record<string, unknown> }
const definitionOf = (key: SettingGroupKey) => SETTING_GROUPS[key] as unknown as AnyGroup

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value)

/**
 * A stored value as the current schema sees it, merged over the defaults.
 *
 * Never throws: a row written under an older schema (a field removed, a rule
 * tightened) must not take the storefront down. Invalid fields fall back to
 * their default; anything still unparseable returns the defaults.
 */
export const parseStoredGroup = <K extends SettingGroupKey>(key: K, stored: unknown): SettingValue<K> => {
	const { schema, defaults } = definitionOf(key)
	const merged = { ...defaults, ...(isPlainObject(stored) ? stored : {}) }

	const first = schema.safeParse(merged)
	if (first.success) return first.data as SettingValue<K>

	const repaired = { ...merged }
	for (const issue of first.error.issues) {
		const field = issue.path[0]
		if (typeof field !== "string") continue
		if (field in defaults) repaired[field] = defaults[field]
		else delete repaired[field]
	}

	const second = schema.safeParse(repaired)
	return (second.success ? second.data : defaults) as SettingValue<K>
}

/**
 * The value after an admin save: `patch` merged over `current`, validated as a
 * whole. Throws a ZodError (paths prefixed with "body", like validateRequest)
 * so the global handler reports field errors.
 */
export const applyGroupUpdate = <K extends SettingGroupKey>(
	key: K,
	current: SettingValue<K>,
	patch: Record<string, unknown>
): SettingValue<K> => {
	const { schema } = definitionOf(key)
	const parsed = z.object({ body: schema }).parse({ body: { ...current, ...patch } })
	return parsed.body as SettingValue<K>
}
