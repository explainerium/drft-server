import { z } from "zod"

const idParams = z.object({ id: z.uuid() })
const valueIdParams = z.object({ valueId: z.uuid() })

// Codes are slugified by the service; left out, they are made from the name / label.
const code = z.string().trim().min(1).max(60)

const value = z.object({
	code: code.optional(),
	label: z.string().trim().min(1).max(80),
	hexColor: z
		.string()
		.trim()
		.regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1a1c1b")
		.nullish(),
	sortOrder: z.number().int().min(0).max(1_000_000).optional(),
})

const attribute = z.object({
	code: code.optional(),
	name: z.string().trim().min(1).max(80),
	sortOrder: z.number().int().min(0).max(1_000_000).optional(),
})

const nonEmpty = (body: object) => Object.keys(body).length > 0

const idSchema = z.object({ params: idParams })
const valueIdSchema = z.object({ params: valueIdParams })

const createSchema = z.object({
	body: attribute.extend({ values: z.array(value).max(200).default([]) }),
})

const updateSchema = z.object({
	params: idParams,
	body: attribute.partial().refine(nonEmpty, "Nothing to update"),
})

const createValueSchema = z.object({ params: idParams, body: value })

const updateValueSchema = z.object({
	params: valueIdParams,
	body: value.partial().refine(nonEmpty, "Nothing to update"),
})

export const AttributeValidation = {
	idSchema,
	valueIdSchema,
	createSchema,
	updateSchema,
	createValueSchema,
	updateValueSchema,
}
export type AttributeInput = z.infer<typeof attribute>
export type AttributeValueInput = z.infer<typeof value>
