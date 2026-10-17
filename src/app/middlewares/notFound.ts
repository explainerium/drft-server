import type { Request, Response } from "express"
import httpStatus from "../../shared/httpStatus"

const notFound = (req: Request, res: Response): void => {
	res.status(httpStatus.NOT_FOUND).json({
		success: false,
		statusCode: httpStatus.NOT_FOUND,
		message: `Not found: ${req.method} ${req.originalUrl}`,
	})
}

export default notFound
