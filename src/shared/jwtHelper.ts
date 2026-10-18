import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken"
import type { UserRole, UserStatus } from "@prisma/client"
import { env } from "../config"

export interface AccessTokenPayload extends JwtPayload {
	sub: string
	role: UserRole
	status: UserStatus
}

/**
 * Role and status travel in the token so guards need no database round trip.
 * A status change therefore takes effect at the next refresh (≤ access TTL).
 */
export const signAccessToken = (payload: { sub: string; role: UserRole; status: UserStatus }): string =>
	jwt.sign(payload, env.JWT_ACCESS_SECRET, {
		expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
	})

export const verifyAccessToken = (token: string): AccessTokenPayload =>
	jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
