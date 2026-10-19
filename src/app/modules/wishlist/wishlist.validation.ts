import { z } from "zod"

const addSchema = z.object({
	body: z.object({ productId: z.uuid(), variantId: z.uuid().nullish() }),
})

const productIdSchema = z.object({ params: z.object({ productId: z.uuid() }) })

export const WishlistValidation = { addSchema, productIdSchema }
