import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import { env } from "../config"

/**
 * One client per process. `globalThis` keeps a single instance across tsx hot
 * reloads so development does not leak connections on every save.
 *
 * Pool of 5 by default: managed poolers cap total connections, and a serverless
 * instance still fans out queries with Promise.all. Override with
 * DATABASE_POOL_SIZE.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const createClient = (): PrismaClient =>
	new PrismaClient({
		adapter: new PrismaPg({
			connectionString: env.DATABASE_URL,
			max: env.DATABASE_POOL_SIZE ?? 5,
			idleTimeoutMillis: 5_000,
		}),
		log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	})

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma
}

export default prisma
