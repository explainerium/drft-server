import { Prisma } from "@prisma/client"
import httpStatus from "../../shared/httpStatus"

/** Known Prisma errors as HTTP responses; anything else stays a 500. */
export const mapPrismaError = (err: unknown): { statusCode: number; message: string } | undefined => {
	if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return undefined

	switch (err.code) {
		case "P2002": {
			const target = (err.meta?.target as string[] | string | undefined) ?? "field"
			return {
				statusCode: httpStatus.CONFLICT,
				message: `A record with this ${Array.isArray(target) ? target.join(", ") : target} already exists`,
			}
		}
		case "P2025":
			return { statusCode: httpStatus.NOT_FOUND, message: "Record not found" }
		case "P2003":
			return { statusCode: httpStatus.CONFLICT, message: "This record is still referenced by other data" }
		default:
			return undefined
	}
}
