import type { User } from "@prisma/client"

/** What the API ever returns about a user. Never the password hash. */
export type PublicUser = Pick<
	User,
	"id" | "email" | "role" | "status" | "firstName" | "lastName" | "phone" | "emailVerifiedAt" | "createdAt"
>

export const toPublicUser = (user: User): PublicUser => ({
	id: user.id,
	email: user.email,
	role: user.role,
	status: user.status,
	firstName: user.firstName,
	lastName: user.lastName,
	phone: user.phone,
	emailVerifiedAt: user.emailVerifiedAt,
	createdAt: user.createdAt,
})

export interface DeviceInfo {
	userAgent?: string
	ipAddress?: string
}

export interface AuthResult {
	accessToken: string
	refreshToken: string
	user: PublicUser
}
