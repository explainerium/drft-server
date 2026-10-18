import type { NextFunction, Request, Response } from "express"
import type { UserRole } from "@prisma/client"
import { COOKIE } from "../../shared/cookies"
import httpStatus from "../../shared/httpStatus"
import { verifyAccessToken, type AccessTokenPayload } from "../../shared/jwtHelper"
import ApiError from "../errors/ApiError"

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			user?: AccessTokenPayload
		}
	}
}

/** Cookie first (browser, same origin); Bearer header for API clients like Postman. */
const readToken = (req: Request): string | undefined => {
	const cookie = req.cookies?.[COOKIE.ACCESS] as string | undefined
	if (cookie) return cookie
	const header = req.headers.authorization
	return header?.startsWith("Bearer ") ? header.slice(7) : undefined
}

const decode = (req: Request): AccessTokenPayload | undefined => {
	const token = readToken(req)
	if (!token) return undefined
	try {
		return verifyAccessToken(token)
	} catch {
		return undefined
	}
}

/**
 * Route guard.
 *
 *   auth()                  any signed-in, ACTIVE user
 *   auth("ADMIN", "STAFF")  staff only
 *
 * A SUSPENDED account can still read its own account (`authAccount`) but not
 * act — never put `authAccount` on anything that spends money.
 */
const guard =
	(allowSuspended: boolean) =>
	(...roles: UserRole[]) =>
	(req: Request, _res: Response, next: NextFunction): void => {
		const payload = decode(req)

		if (!payload) return next(new ApiError(httpStatus.UNAUTHORIZED, "Authentication required"))

		if (payload.status === "SUSPENDED" && !allowSuspended) {
			return next(new ApiError(httpStatus.FORBIDDEN, "This account is suspended"))
		}

		if (roles.length && !roles.includes(payload.role)) {
			return next(new ApiError(httpStatus.FORBIDDEN, "Insufficient permissions"))
		}

		req.user = payload
		next()
	}

export const auth = guard(false)
export const authAccount = guard(true)

/** Sets req.user when a valid token is present; never rejects. For guest-or-user routes. */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
	req.user = decode(req)
	next()
}

export const STAFF_ROLES: UserRole[] = ["ADMIN", "STAFF"]

export default auth
