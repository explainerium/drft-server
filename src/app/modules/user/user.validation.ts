import { z } from "zod"
import { paginationQuery } from "../../../shared/pagination"

const idParams = z.object({ id: z.uuid() })

const listSchema = z.object({
	query: z.object({
		...paginationQuery,
		search: z.string().trim().max(100).optional(),
		role: z.enum(["CUSTOMER", "STAFF", "ADMIN"]).optional(),
		status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
		sortBy: z.enum(["createdAt", "email", "lastLoginAt"]).default("createdAt"),
	}),
})

const getSchema = z.object({ params: idParams })

const createStaffSchema = z.object({
	body: z.object({
		email: z.email().trim().toLowerCase(),
		password: z.string().min(8).max(72),
		firstName: z.string().trim().min(1).max(100),
		lastName: z.string().trim().min(1).max(100),
		role: z.enum(["STAFF", "ADMIN"]),
	}),
})

const updateSchema = z.object({
	params: idParams,
	body: z
		.object({
			firstName: z.string().trim().min(1).max(100),
			lastName: z.string().trim().min(1).max(100),
			phone: z.string().trim().max(40).nullable(),
			role: z.enum(["CUSTOMER", "STAFF", "ADMIN"]),
			status: z.enum(["ACTIVE", "SUSPENDED"]),
		})
		.partial()
		.refine((body) => Object.keys(body).length > 0, "Nothing to update"),
})

export const UserValidation = { listSchema, getSchema, createStaffSchema, updateSchema }
