import type { NextFunction, Request, RequestHandler, Response } from "express"

/**
 * Express 5 already forwards rejected promises to the error handler; this keeps
 * the intent explicit at every controller.
 */
export const catchAsync =
	(fn: RequestHandler): RequestHandler =>
	(req: Request, res: Response, next: NextFunction) => {
		Promise.resolve(fn(req, res, next)).catch(next)
	}

export default catchAsync
