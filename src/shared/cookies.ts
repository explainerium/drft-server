import type { CookieOptions, Response } from "express"
import type { UserRole } from "@prisma/client"
import { env } from "../config"
import { durationToMs } from "./token"

/**
 * Cookie names. The storefront's proxy.ts reads ACCESS to guard /account and
 * /admin, so keep the frontend constant in sync if this changes.
 */
export const COOKIE = {
	ACCESS: "drft_access",
	REFRESH: "drft_refresh",
	// Lives as long as the refresh token and holds only the role. The storefront
	// proxy cannot see the refresh cookie (path-scoped) and the access cookie
	// expires after minutes, so this is how it knows a session exists. It is a
	// UX hint only — every API route still verifies the access token.
	SESSION: "drft_session",
	// Guest cart token. Dropped once the cart is merged into a signed-in customer's.
	CART: "drft_cart",
	// Access token of the last order placed in this browser (guest order pages).
	ORDER: "drft_order",
} as const

// Refresh token is only ever needed by the auth endpoints, so it is not sent
// with every other request.
const REFRESH_PATH = "/api/v1/auth"

const base = (path: string, maxAgeMs?: number): CookieOptions => ({
	httpOnly: true,
	secure: env.COOKIE_SECURE,
	sameSite: env.COOKIE_SAMESITE,
	path,
	...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
})

export const setAuthCookies = (
	res: Response,
	tokens: { accessToken: string; refreshToken: string },
	role: UserRole
): void => {
	const refreshMs = durationToMs(env.REFRESH_TOKEN_TTL)
	res.cookie(COOKIE.ACCESS, tokens.accessToken, base("/", durationToMs(env.JWT_ACCESS_EXPIRES_IN)))
	res.cookie(COOKIE.REFRESH, tokens.refreshToken, base(REFRESH_PATH, refreshMs))
	res.cookie(COOKIE.SESSION, role, base("/", refreshMs))
}

/** Clearing must repeat the path the cookie was set with, or the browser keeps it. */
export const clearAuthCookies = (res: Response): void => {
	res.clearCookie(COOKIE.ACCESS, base("/"))
	res.clearCookie(COOKIE.REFRESH, base(REFRESH_PATH))
	res.clearCookie(COOKIE.SESSION, base("/"))
}

const CART_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000

export const setCartCookie = (res: Response, token: string): void => {
	res.cookie(COOKIE.CART, token, base("/", CART_MAX_AGE_MS))
}

export const clearCartCookie = (res: Response): void => {
	res.clearCookie(COOKIE.CART, base("/"))
}

// Only the order endpoints read it.
const ORDER_PATH = "/api/v1/orders"
const ORDER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export const setOrderCookie = (res: Response, token: string): void => {
	res.cookie(COOKIE.ORDER, token, base(ORDER_PATH, ORDER_MAX_AGE_MS))
}
