import rateLimit from "express-rate-limit"
import { env } from "../../config"

/**
 * Login, register and password-reset are where an attacker otherwise gets
 * unlimited guesses. Keyed on req.ip, which is correct only because app.ts sets
 * `trust proxy` to exactly one hop. Disabled under test.
 */
export const credentialLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	skip: () => env.NODE_ENV === "test",
	message: { success: false, statusCode: 429, message: "Too many attempts. Please try again shortly." },
})

/** Placing orders takes stock; this stops a script from reserving a product out of stock. */
export const orderLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	skip: () => env.NODE_ENV === "test",
	message: { success: false, statusCode: 429, message: "Too many orders from this connection. Please try again shortly." },
})

/** Newsletter sign-ups and the contact form: each one sends a mail, so a script must not loop them. */
export const formLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	skip: () => env.NODE_ENV === "test",
	message: { success: false, statusCode: 429, message: "Too many requests from this connection. Please try again shortly." },
})
