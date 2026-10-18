import bcrypt from "bcrypt"
import type { User } from "@prisma/client"
import { env } from "../../../config"
import { decideRefresh } from "../../../domain/auth/refreshDecision"
import { sendMail } from "../../../helpers/mailer"
import httpStatus from "../../../shared/httpStatus"
import { signAccessToken } from "../../../shared/jwtHelper"
import { logger } from "../../../shared/logger"
import { prisma } from "../../../shared/prisma"
import { durationToMs, generateToken, hashToken } from "../../../shared/token"
import ApiError from "../../errors/ApiError"
import { type AuthResult, type DeviceInfo, type PublicUser, toPublicUser } from "./auth.interface"

const RESET_TOKEN_TTL = "1h"
const VERIFY_TOKEN_TTL = "2d"

// A real hash at the configured cost, made once on first use: comparing against
// it on an unknown email costs the same as a real check, so response time does
// not reveal whether an account exists.
let dummyHash: Promise<string> | undefined
const getDummyHash = () => (dummyHash ??= bcrypt.hash(generateToken(), env.BCRYPT_ROUNDS))

const invalidCredentials = () => new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password")
const invalidToken = () => new ApiError(httpStatus.UNAUTHORIZED, "Invalid or expired session")

const issueTokens = async (user: User, device: DeviceInfo): Promise<AuthResult> => {
	const accessToken = signAccessToken({ sub: user.id, role: user.role, status: user.status })
	const refreshToken = generateToken()

	await prisma.refreshToken.create({
		data: {
			userId: user.id,
			tokenHash: hashToken(refreshToken),
			expiresAt: new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_TTL)),
			userAgent: device.userAgent ?? null,
			ipAddress: device.ipAddress ?? null,
		},
	})

	return { accessToken, refreshToken, user: toPublicUser(user) }
}

const sendVerificationMail = async (user: User): Promise<void> => {
	const token = generateToken()
	await prisma.emailVerificationToken.create({
		data: {
			userId: user.id,
			tokenHash: hashToken(token),
			expiresAt: new Date(Date.now() + durationToMs(VERIFY_TOKEN_TTL)),
		},
	})

	const link = `${env.PUBLIC_BASE_URL}/verify-email?token=${token}`
	await sendMail({
		to: user.email,
		subject: "Confirm your DRFT account",
		text: `Welcome to DRFT${user.firstName ? `, ${user.firstName}` : ""}!\n\nConfirm your email address:\n${link}\n\nThis link is valid for 48 hours.`,
	})
}

const register = async (
	payload: { email: string; password: string; firstName: string; lastName: string },
	device: DeviceInfo
): Promise<AuthResult> => {
	const existing = await prisma.user.findUnique({ where: { email: payload.email } })
	if (existing) throw new ApiError(httpStatus.CONFLICT, "An account with this email already exists")

	// Hashed before any write: bcrypt takes ~100ms+ and must not hold a transaction open.
	const passwordHash = await bcrypt.hash(payload.password, env.BCRYPT_ROUNDS)

	// Self-registration is always a CUSTOMER. Staff accounts are created by an admin.
	const user = await prisma.user.create({
		data: {
			email: payload.email,
			passwordHash,
			firstName: payload.firstName,
			lastName: payload.lastName,
		},
	})

	await sendVerificationMail(user)

	return issueTokens(user, device)
}

const login = async (payload: { email: string; password: string }, device: DeviceInfo): Promise<AuthResult> => {
	const user = await prisma.user.findUnique({ where: { email: payload.email } })

	if (!user) {
		await bcrypt.compare(payload.password, await getDummyHash())
		throw invalidCredentials()
	}

	if (!(await bcrypt.compare(payload.password, user.passwordHash))) throw invalidCredentials()

	// A deleted account answers exactly like an unknown one.
	if (user.deletedAt) throw invalidCredentials()

	// Off the critical path; a failed stamp must not cost a login.
	void prisma.user
		.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
		.catch((err: unknown) => logger.warn({ err, userId: user.id }, "could not stamp lastLoginAt"))

	return issueTokens(user, device)
}

/** Rotates the refresh token: the presented one is revoked, a new pair is issued. */
const refresh = async (token: string | undefined, device: DeviceInfo): Promise<AuthResult> => {
	if (!token) throw invalidToken()

	const stored = await prisma.refreshToken.findUnique({
		where: { tokenHash: hashToken(token) },
		include: { user: true },
	})
	if (!stored) throw invalidToken()

	const decision = decideRefresh(stored)

	if (decision.kind === "INVALID") throw invalidToken()

	if (decision.kind === "REUSE") {
		logger.warn({ userId: stored.userId }, "refresh token reuse — revoking every session")
		await prisma.refreshToken.updateMany({
			where: { userId: stored.userId, revokedAt: null },
			data: { revokedAt: new Date() },
		})
		throw invalidToken()
	}

	// Re-read status here: this is where a suspension or deletion takes effect.
	if (stored.user.deletedAt) throw invalidToken()

	if (decision.kind === "ROTATE") {
		const now = new Date()
		await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: now, rotatedAt: now } })
	}

	return issueTokens(stored.user, device)
}

const logout = async (token: string | undefined): Promise<void> => {
	if (!token) return
	// updateMany: logging out twice must not throw.
	await prisma.refreshToken.updateMany({
		where: { tokenHash: hashToken(token), revokedAt: null },
		data: { revokedAt: new Date() },
	})
}

const me = async (userId: string): Promise<PublicUser> => {
	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user || user.deletedAt) throw new ApiError(httpStatus.NOT_FOUND, "User not found")
	return toPublicUser(user)
}

/** Always resolves, whether or not the email exists — otherwise it confirms who is registered. */
const forgotPassword = async (email: string): Promise<void> => {
	const user = await prisma.user.findUnique({ where: { email } })
	if (!user || user.deletedAt) return

	const token = generateToken()
	await prisma.passwordResetToken.create({
		data: {
			userId: user.id,
			tokenHash: hashToken(token),
			expiresAt: new Date(Date.now() + durationToMs(RESET_TOKEN_TTL)),
		},
	})

	const link = `${env.PUBLIC_BASE_URL}/reset-password?token=${token}`
	await sendMail({
		to: user.email,
		subject: "Reset your DRFT password",
		text: `Someone asked to reset the password for this account.\n\nChoose a new password:\n${link}\n\nThis link is valid for 1 hour. If this wasn't you, ignore this email.`,
	})
}

const resetPassword = async (token: string, password: string): Promise<void> => {
	const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } })

	if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
		throw new ApiError(httpStatus.BAD_REQUEST, "This reset link is invalid or has expired")
	}

	const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS)

	// A reset logs every device out — that is the point of it.
	await prisma.$transaction([
		prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
		prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
		prisma.refreshToken.updateMany({
			where: { userId: stored.userId, revokedAt: null },
			data: { revokedAt: new Date() },
		}),
	])
}

const changePassword = async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found")

	if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Current password is incorrect")
	}

	const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS)

	await prisma.$transaction([
		prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
		prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
	])
}

const verifyEmail = async (token: string): Promise<void> => {
	const stored = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } })

	if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
		throw new ApiError(httpStatus.BAD_REQUEST, "This verification link is invalid or has expired")
	}

	await prisma.$transaction([
		prisma.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: new Date() } }),
		prisma.emailVerificationToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
	])
}

const resendVerification = async (userId: string): Promise<void> => {
	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found")
	if (user.emailVerifiedAt) throw new ApiError(httpStatus.BAD_REQUEST, "Email is already verified")
	await sendVerificationMail(user)
}

export const AuthService = {
	register,
	login,
	refresh,
	logout,
	me,
	forgotPassword,
	resetPassword,
	changePassword,
	verifyEmail,
	resendVerification,
}
