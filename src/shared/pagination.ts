import { z } from "zod"

/** Query-string schema shared by every list endpoint. Spread into a module's query schema. */
export const paginationQuery = {
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
}

export interface PaginationInput {
	page: number
	limit: number
}

export const toSkipTake = ({ page, limit }: PaginationInput) => ({ skip: (page - 1) * limit, take: limit })

export const toMeta = ({ page, limit }: PaginationInput, total: number) => ({
	page,
	limit,
	total,
	totalPages: Math.max(1, Math.ceil(total / limit)),
})
