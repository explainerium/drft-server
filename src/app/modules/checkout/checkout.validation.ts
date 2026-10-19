import { z } from "zod"
import { postalAddress } from "../account/account.validation"

const countryCode = z
	.string()
	.trim()
	.length(2)
	.transform((c) => c.toUpperCase())

const quoteSchema = z.object({
	query: z.object({
		country: countryCode.optional(),
		shippingRateId: z.uuid().optional(),
	}),
})

// The courier needs a phone number for the shipping address.
const shippingAddress = postalAddress.extend({
	phone: z.string().trim().min(5, "Enter a phone number for the courier").max(40),
})

const placeOrderSchema = z.object({
	body: z.object({
		email: z.email().max(254).transform((e) => e.toLowerCase()),
		marketingOptIn: z.boolean().default(false),
		shippingAddress,
		// Null or absent: bill to the shipping address.
		billingAddress: postalAddress.nullish(),
		shippingRateId: z.uuid(),
		paymentProvider: z.enum(["STRIPE", "PAYPAL"]).nullish(),
		// Signed-in customers only: adds the shipping address to their address book.
		saveAddress: z.boolean().default(false),
	}),
})

export const CheckoutValidation = { quoteSchema, placeOrderSchema }
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>["body"]
