import "dotenv/config"
import { z } from "zod"

/**
 * Every environment variable the API reads, validated once at boot. A missing
 * or malformed value fails loudly here instead of at the first request that
 * needs it. Add new variables to .env.example as well.
 */
const schema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	PORT: z.coerce.number().int().positive().default(5000),
	LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

	DATABASE_URL: z.string().min(1),
	DATABASE_POOL_SIZE: z.coerce.number().int().positive().optional(),

	PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
	CORS_ORIGINS: z.string().default(""),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
	console.error("Invalid environment variables:", z.prettifyError(parsed.error))
	process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
