import type { Request, RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import { clearAuthCookies, COOKIE, setAuthCookies } from "../../../shared/cookies"
import httpStatus from "../../../shared/httpStatus"
import { logger } from "../../../shared/logger"
import sendResponse from "../../../shared/sendResponse"
import ApiError from "../../errors/ApiError"
import { AuthService } from "./auth.service"

const device = (req: Request) => ({ userAgent: req.get("user-agent") ?? undefined, ipAddress: req.ip })

// Cookie first (browser); body as a fallback for API clients.
const refreshTokenFrom = (req: Request): string | undefined =>
	(req.cookies?.[COOKIE.REFRESH] as string | undefined) ?? (req.body?.refreshToken as string | undefined)

const register: RequestHandler = catchAsync(async (req, res) => {
	// Honeypot: answer as if it worked, so bots learn nothing.
	if (req.body.website) {
		logger.warn({ email: req.body.email }, "registration honeypot triggered")
		sendResponse(res, { statusCode: httpStatus.CREATED, message: "Account created" })
		return
	}

	const { user, ...tokens } = await AuthService.register(req.body, device(req))
	setAuthCookies(res, tokens, user.role)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Account created", data: { user } })
})

const login: RequestHandler = catchAsync(async (req, res) => {
	const { user, ...tokens } = await AuthService.login(req.body, device(req))
	setAuthCookies(res, tokens, user.role)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Signed in", data: { user } })
})

const refresh: RequestHandler = catchAsync(async (req, res) => {
	try {
		const { user, ...tokens } = await AuthService.refresh(refreshTokenFrom(req), device(req))
		setAuthCookies(res, tokens, user.role)
		sendResponse(res, { statusCode: httpStatus.OK, message: "Session refreshed", data: { user } })
	} catch (err) {
		// A dead session should not leave dead cookies behind.
		clearAuthCookies(res)
		throw err
	}
})

const logout: RequestHandler = catchAsync(async (req, res) => {
	await AuthService.logout(refreshTokenFrom(req))
	clearAuthCookies(res)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Signed out" })
})

const me: RequestHandler = catchAsync(async (req, res) => {
	const user = await AuthService.me(req.user!.sub)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Current user", data: user })
})

/**
 * The signed-in user, or null for a visitor. With the session cookie but no
 * valid access token (it lives minutes) it answers 401, so the client
 * refreshes and asks again.
 */
const session: RequestHandler = catchAsync(async (req, res) => {
	if (!req.user) {
		if (req.cookies?.[COOKIE.SESSION]) throw new ApiError(httpStatus.UNAUTHORIZED, "Session expired")
		return sendResponse(res, { statusCode: httpStatus.OK, message: "No session", data: null })
	}
	const user = await AuthService.me(req.user.sub)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Current user", data: user })
})

const forgotPassword: RequestHandler = catchAsync(async (req, res) => {
	await AuthService.forgotPassword(req.body.email)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		message: "If an account exists for this email, a reset link is on its way",
	})
})

const resetPassword: RequestHandler = catchAsync(async (req, res) => {
	await AuthService.resetPassword(req.body.token, req.body.password)
	clearAuthCookies(res)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Password updated. Please sign in again" })
})

const changePassword: RequestHandler = catchAsync(async (req, res) => {
	await AuthService.changePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword)
	clearAuthCookies(res)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Password changed. Please sign in again" })
})

const verifyEmail: RequestHandler = catchAsync(async (req, res) => {
	await AuthService.verifyEmail(req.body.token)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Email verified" })
})

const resendVerification: RequestHandler = catchAsync(async (req, res) => {
	await AuthService.resendVerification(req.user!.sub)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Verification email sent" })
})

export const AuthController = {
	register,
	login,
	refresh,
	logout,
	me,
	session,
	forgotPassword,
	resetPassword,
	changePassword,
	verifyEmail,
	resendVerification,
}
