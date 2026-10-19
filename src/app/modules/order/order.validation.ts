import { z } from "zod"
import { paginationQuery } from "../../../shared/pagination"

const idParams = z.object({ id: z.uuid() })

const orderIdSchema = z.object({ params: idParams })

const ORDER_STATUSES = [
	"PENDING_PAYMENT",
	"PAID",
	"PROCESSING",
	"SHIPPED",
	"DELIVERED",
	"CANCELLED",
	"REFUNDED",
	"PARTIALLY_REFUNDED",
] as const

const adminListSchema = z.object({
	query: z.object({
		...paginationQuery,
		search: z.string().trim().max(100).optional(),
		status: z.enum(ORDER_STATUSES).optional(),
		// One customer's orders (the customer page).
		userId: z.uuid().optional(),
	}),
})

const optionalText = (max: number) => z.string().trim().max(max).nullish()

const tracking = {
	trackingCarrier: optionalText(60),
	trackingNumber: optionalText(100),
	trackingUrl: z
		.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Enter a full http(s) URL" })])
		.nullish(),
}

const changeStatusSchema = z.object({
	params: idParams,
	body: z.object({
		status: z.enum(ORDER_STATUSES),
		note: optionalText(1_000),
		...tracking,
		notifyCustomer: z.boolean().default(true),
	}),
})

const trackingSchema = z.object({ params: idParams, body: z.object(tracking) })

const noteSchema = z.object({
	params: idParams,
	body: z.object({ body: z.string().trim().min(1, "Write a note").max(2_000) }),
})

export const OrderValidation = { orderIdSchema, adminListSchema, changeStatusSchema, trackingSchema, noteSchema }
