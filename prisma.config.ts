import "dotenv/config"
import { defineConfig } from "prisma/config"

/**
 * Migrate needs a session connection (advisory lock), so DIRECT_URL wins over
 * the pooled DATABASE_URL. Read from process.env rather than Prisma's env()
 * helper so `prisma generate` works without any database URL at build time.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL

export default defineConfig({
	// A folder: every .prisma file inside is merged into one schema.
	schema: "prisma/schema",
	migrations: {
		path: "prisma/migrations",
	},
	...(url ? { datasource: { url } } : {}),
})
