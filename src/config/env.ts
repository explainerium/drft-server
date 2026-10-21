import "dotenv/config"
import { z } from "zod"

/** "30d", "15m", "1h", "45s". Parsed by durationToMs in shared/token.ts. */
const duration = z.string().regex(/^\d+[smhd]$/, 'Use a duration like "15m" or "30d"')

const bool = z.enum(["true", "false"]).transform((v) => v === "true")

/**
 * Every environment variable the API reads, validated once at boot. A missing
 * or malformed value fails loudly here instead of at the first request that
 * needs it. Add new variables to .env.example as well.
 */
const schema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	PORT: z.coerce.number().int().positive().default(5005),
	LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

	DATABASE_URL: z.string().min(1),
	DATABASE_POOL_SIZE: z.coerce.number().int().positive().optional(),

	PUBLIC_BASE_URL: z.url().default("http://localhost:3005"),
	CORS_ORIGINS: z.string().default(""),

	// Auth. The access token is a short-lived JWT; the refresh token is an opaque
	// random value stored hashed and rotated on every use.
	JWT_ACCESS_SECRET: z.string().min(32).default("dev-only-access-secret-change-me-0000000000"),
	JWT_ACCESS_EXPIRES_IN: duration.default("15m"),
	REFRESH_TOKEN_TTL: duration.default("30d"),
	BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

	// Same-origin deployment (API under /api/v1 on the site domain): Lax is right. Secure must be true in production.
	COOKIE_SECURE: bool.default(false),
	COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),

	// Mail. Without SMTP_HOST, mails are logged instead of sent (development).
	SMTP_HOST: z.string().optional(),
	SMTP_PORT: z.coerce.number().int().positive().default(587),
	SMTP_USER: z.string().optional(),
	SMTP_PASS: z.string().optional(),
	MAIL_FROM: z.string().default("DRFT <no-reply@localhost>"),

	// Storage. "local" writes to ./storage and serves it at /media; "s3" uses an
	// S3-compatible bucket (Neon Object Storage, or R2) and serves from its
	// public URL: S3_PUBLIC_URL, else <S3_ENDPOINT>/<S3_BUCKET>.
	STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
	S3_ENDPOINT: z.url().optional(),
	S3_REGION: z.string().default("auto"),
	S3_ACCESS_KEY_ID: z.string().optional(),
	S3_SECRET_ACCESS_KEY: z.string().optional(),
	S3_BUCKET: z.string().optional(),
	S3_PUBLIC_URL: z.url().optional(),

	// Payments. A provider is offered at checkout only when its keys are set.
	STRIPE_SECRET_KEY: z.string().optional(),
	STRIPE_WEBHOOK_SECRET: z.string().optional(),
	PAYPAL_CLIENT_ID: z.string().optional(),
	PAYPAL_CLIENT_SECRET: z.string().optional(),
	PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),

	// Vercel Cron sends it as "Authorization: Bearer <CRON_SECRET>". Unset → the cron route is off.
	CRON_SECRET: z.string().min(16).optional(),
})

// `KEY=` in .env means "not set", not "set to an empty string" — otherwise an
// empty S3_PUBLIC_URL fails URL validation instead of falling back.
const defined = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""))

const parsed = schema.safeParse(defined)

if (!parsed.success) {
	console.error("Invalid environment variables:", z.prettifyError(parsed.error))
	process.exit(1)
}

const env = parsed.data

if (env.NODE_ENV === "production") {
	const problems: string[] = []
	if (env.JWT_ACCESS_SECRET.startsWith("dev-only")) problems.push("JWT_ACCESS_SECRET must be set")
	if (!env.COOKIE_SECURE) problems.push("COOKIE_SECURE must be true")
	if (env.PUBLIC_BASE_URL.includes("localhost")) problems.push("PUBLIC_BASE_URL must be the site origin")
	// Serverless functions have no lasting disk, so uploads must go to a bucket.
	if (process.env.VERCEL && env.STORAGE_DRIVER === "local") problems.push("STORAGE_DRIVER must be s3 on Vercel")
	if (env.STORAGE_DRIVER === "s3" && !(env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_BUCKET)) {
		problems.push("STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET")
	}
	if (problems.length) {
		console.error("Unsafe production configuration:\n- " + problems.join("\n- "))
		process.exit(1)
	}
}

export { env }
export type Env = typeof env
