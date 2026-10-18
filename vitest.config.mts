import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
		// The env schema requires these. Tests that touch the database will
		// point DATABASE_URL at a dedicated test database.
		env: {
			NODE_ENV: "test",
			LOG_LEVEL: "fatal",
			DATABASE_URL: "postgres://test:test@localhost:5432/drft_test",
		},
	},
})
