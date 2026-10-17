import type { RequestHandler } from "express"
import type { ZodType } from "zod"

/**
 * Validates `{ body, query, params, cookies }` against a zod schema and puts the
 * parsed body back, so controllers only ever see clean input.
 */
const validateRequest =
	(schema: ZodType): RequestHandler =>
	async (req, _res, next) => {
		const parsed = (await schema.parseAsync({
			body: req.body,
			query: req.query,
			params: req.params,
			cookies: req.cookies,
		})) as { body?: unknown }

		if (parsed.body !== undefined) req.body = parsed.body
		next()
	}

export default validateRequest
