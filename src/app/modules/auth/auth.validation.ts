import { z } from "zod"

const email = z.email().trim().toLowerCase()
// Length over composition rules (NIST 800-63B). bcrypt only reads 72 bytes.
const password = z.string().min(8, "Password must be at least 8 characters").max(72)

const registerSchema = z.object({
	body: z.object({
		email,
		password,
		firstName: z.string().trim().min(1).max(100),
		lastName: z.string().trim().min(1).max(100),
		// Honeypot: hidden in the form, bots fill it in.
		website: z.string().optional(),
	}),
})

const loginSchema = z.object({
	body: z.object({ email, password: z.string().min(1).max(72) }),
})

const forgotPasswordSchema = z.object({
	body: z.object({ email }),
})

const resetPasswordSchema = z.object({
	body: z.object({ token: z.string().min(1), password }),
})

const changePasswordSchema = z.object({
	body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: password }),
})

const verifyEmailSchema = z.object({
	body: z.object({ token: z.string().min(1) }),
})

export const AuthValidation = {
	registerSchema,
	loginSchema,
	forgotPasswordSchema,
	resetPasswordSchema,
	changePasswordSchema,
	verifyEmailSchema,
}
