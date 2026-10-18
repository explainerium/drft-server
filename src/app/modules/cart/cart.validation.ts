import { z } from "zod"
import { MAX_LINE_QUANTITY } from "../../../domain/cart/cartRules"

const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY)
const itemParams = z.object({ itemId: z.uuid() })

const addItemSchema = z.object({
	body: z.object({ variantId: z.uuid(), quantity: quantity.default(1) }),
})

const updateItemSchema = z.object({
	params: itemParams,
	body: z.object({ quantity }),
})

const itemIdSchema = z.object({ params: itemParams })

export const CartValidation = { addItemSchema, updateItemSchema, itemIdSchema }
