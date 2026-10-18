import type { ErrorRequestHandler } from "express"
import { ZodError } from "zod"
import { env } from "../../config"
import httpStatus from "../../shared/httpStatus"
import { logger } from "../../shared/logger"
import ApiError from "../errors/ApiError"
import { mapPrismaError } from "../errors/prismaError"

/** Maps every thrown error to the standard response shape. */
const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR
	let message = "Something went wrong"
	let errors: { path: string; message: string }[] | undefined

	const prisma = mapPrismaError(err)

	if (err instanceof ZodError) {
		statusCode = httpStatus.BAD_REQUEST
		message = "Validation failed"
		// Drop the leading "body"/"query"/"params" segment the request schema adds.
		errors = err.issues.map((issue) => ({ path: issue.path.slice(1).join(".") || issue.path.join("."), message: issue.message }))
	} else if (err instanceof ApiError) {
		statusCode = err.statusCode
		message = err.message
	} else if (prisma) {
		statusCode = prisma.statusCode
		message = prisma.message
	} else if (err?.type === "entity.parse.failed") {
		statusCode = httpStatus.BAD_REQUEST
		message = "Malformed JSON body"
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
