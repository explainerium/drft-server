import crypto from "crypto"

/**
 * Opaque tokens for refresh, password reset and email verification.
 *
 * Only the SHA-256 hash is stored. These are high-entropy random values, so a
 * fast hash is correct; bcrypt's work factor is for low-entropy passwords.
 */
export const generateToken = (): string => crypto.randomBytes(48).toString("hex")

export const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex")

const MULTIPLIERS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const

/** Milliseconds from a duration like "30d", "15m", "1h". */
export const durationToMs = (duration: string): number => {
	const match = /^(\d+)([smhd])$/.exec(duration.trim())
	if (!match) throw new Error(`Invalid duration: ${duration}`)

	return Number(match[1]) * MULTIPLIERS[match[2] as keyof typeof MULTIPLIERS]
}
