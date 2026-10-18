import type { RequestHandler } from "express"
import type { ZodType } from "zod"

/**
 * Validates `{ body, query, params, cookies }` against a zod schema and writes
 * the parsed values back, so controllers see coerced, defaulted, clean input.
 *
 * `req.query` is a getter in Express 5, hence defineProperty instead of assignment.
 */
const validateRequest =
	(schema: ZodType): RequestHandler =>
	async (req, _res, next) => {
		const parsed = (await schema.parseAsync({
			body: req.body,
			query: req.query,
			params: req.params,
			cookies: req.cookies,
		})) as { body?: unknown; query?: unknown; params?: Record<string, string> }

		if (parsed.body !== undefined) req.body = parsed.body
		if (parsed.query !== undefined) Object.defineProperty(req, "query", { value: parsed.query, writable: true })
		if (parsed.params !== undefined) req.params = parsed.params
		next()
	}

export default validateRequest
