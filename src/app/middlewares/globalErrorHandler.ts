import type { ErrorRequestHandler } from "express"
import { ZodError } from "zod"
import { env } from "../../config"
import httpStatus from "../../shared/httpStatus"
import { logger } from "../../shared/logger"
import ApiError from "../errors/ApiError"

/**
 * Maps every thrown error to the standard response shape. Prisma and JWT
 * mappers are added here as those modules land.
 */
const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR
	let message = "Something went wrong"
	let errors: { path: string; message: string }[] | undefined

	if (err instanceof ZodError) {
		statusCode = httpStatus.BAD_REQUEST
		message = "Validation failed"
		errors = err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
	} else if (err instanceof ApiError) {
		statusCode = err.statusCode
		message = err.message
	}

	if (statusCode >= 500) {
		logger.error({ err, path: req.originalUrl }, "unhandled error")
	}

	res.status(statusCode).json({
		success: false,
		statusCode,
		message,
		...(errors ? { errors } : {}),
		...(env.NODE_ENV === "development" && err instanceof Error ? { stack: err.stack } : {}),
	})
}

export default globalErrorHandler
