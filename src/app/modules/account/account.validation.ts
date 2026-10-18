import { z } from "zod"

const address = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	company: z.string().trim().max(120).nullish(),
	street1: z.string().trim().min(1).max(200),
	street2: z.string().trim().max(200).nullish(),
	postcode: z.string().trim().min(1).max(20),
	city: z.string().trim().min(1).max(100),
	region: z.string().trim().max(100).nullish(),
	countryCode: z
		.string()
		.trim()
		.length(2)
		.transform((c) => c.toUpperCase()),
	phone: z.string().trim().max(40).nullish(),
	isDefaultShipping: z.boolean().optional(),
	isDefaultBilling: z.boolean().optional(),
})

const updateProfileSchema = z.object({
	body: z
		.object({
			firstName: z.string().trim().min(1).max(100),
			lastName: z.string().trim().min(1).max(100),
			phone: z.string().trim().max(40).nullable(),
		})
		.partial()
		.refine((body) => Object.keys(body).length > 0, "Nothing to update"),
})

const addressIdParams = z.object({ id: z.uuid() })

const createAddressSchema = z.object({ body: address })
const updateAddressSchema = z.object({ params: addressIdParams, body: address.partial() })
const addressIdSchema = z.object({ params: addressIdParams })

export const AccountValidation = { updateProfileSchema, createAddressSchema, updateAddressSchema, addressIdSchema }
export type AddressInput = z.infer<typeof address>
