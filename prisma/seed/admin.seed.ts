import "dotenv/config"
import bcrypt from "bcrypt"
import { env } from "../../src/config"
import { prisma } from "../../src/shared/prisma"

/**
 * Creates the first ADMIN account, or promotes an existing user to ADMIN.
 *
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=... npm run seed:admin
 *
 * The password is only used when the account does not exist yet.
 */
const main = async () => {
	const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
	const password = process.env.SEED_ADMIN_PASSWORD

	if (!email || !password || password.length < 6) {
		console.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min. 6 characters).")
		process.exit(1)
	}

	const existing = await prisma.user.findUnique({ where: { email } })

	if (existing) {
		await prisma.user.update({ where: { email }, data: { role: "ADMIN", status: "ACTIVE", deletedAt: null } })
		console.log(`Promoted ${email} to ADMIN.`)
	} else {
		await prisma.user.create({
			data: {
				email,
				passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
				role: "ADMIN",
				firstName: "Admin",
				emailVerifiedAt: new Date(),
			},
		})
		console.log(`Created ADMIN ${email}.`)
	}
}

main()
	.catch((err: unknown) => {
		console.error(err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
