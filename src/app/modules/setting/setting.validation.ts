import { z } from "zod"

// The group itself is checked by the service (unknown → 404, not 400), and the
// body against that group's schema in the registry.
const groupParams = z.object({ group: z.string().min(1).max(50) })

const getSchema = z.object({ params: groupParams })

const updateSchema = z.object({
	params: groupParams,
	body: z.record(z.string(), z.unknown()),
})

export const SettingValidation = { getSchema, updateSchema }
