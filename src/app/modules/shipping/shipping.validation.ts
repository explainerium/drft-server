import { z } from "zod"
import { MONEY_PATTERN } from "../../../domain/catalog/variantRules"
import { COUNTRY_CODE } from "../../../domain/checkout/checkoutRules"

const idParams = z.object({ id: z.uuid() })
const rateIdParams = z.object({ rateId: z.uuid() })
const sortOrder = z.number().int().min(0).max(100_000)
const nonEmpty = (body: object) => Object.keys(body).length > 0

const zone = z.object({
	name: z.string().trim().min(1).max(80),
	countries: z
		.array(z.string().trim().toUpperCase().regex(COUNTRY_CODE, "Use two-letter country codes such as NL"))
		.min(1, "Add at least one country")
		.max(250),
	// No defaults here: a PATCH that leaves a field out must not reset it (create adds them).
	isActive: z.boolean().optional(),
	sortOrder: sortOrder.optional(),
})

/** Gross (VAT included), like product prices. */
const price = z
	.union([z.number(), z.string().trim()])
	.transform((v) => String(v))
	.refine((v) => MONEY_PATTERN.test(v), "Enter an amount of 0 or more with at most 2 decimals")

const rate = z.object({
	name: z.string().trim().min(1).max(120),
	description: z
		.string()
		.trim()
		.max(300)
		.nullish()
		.transform((v) => v || null),
	price,
	freeOverThreshold: z.boolean().optional(),
	isActive: z.boolean().optional(),
	sortOrder: sortOrder.optional(),
})

const zoneIdSchema = z.object({ params: idParams })
const rateIdSchema = z.object({ params: rateIdParams })
const createZoneSchema = z.object({
	body: zone.extend({ isActive: z.boolean().default(true), sortOrder: sortOrder.default(0) }),
})
const updateZoneSchema = z.object({ params: idParams, body: zone.partial().refine(nonEmpty, "Nothing to update") })
const createRateSchema = z.object({
	params: idParams,
	body: rate.extend({
		freeOverThreshold: z.boolean().default(false),
		isActive: z.boolean().default(true),
		sortOrder: sortOrder.default(0),
	}),
})
const updateRateSchema = z.object({ params: rateIdParams, body: rate.partial().refine(nonEmpty, "Nothing to update") })

export const ShippingValidation = {
	zoneIdSchema,
	rateIdSchema,
	createZoneSchema,
	updateZoneSchema,
	createRateSchema,
	updateRateSchema,
}
