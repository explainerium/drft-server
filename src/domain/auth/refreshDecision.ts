/**
 * What to do with a presented refresh token. Pure, so it is unit-tested.
 *
 * - ROTATE:  valid and unused → revoke it, issue a new pair.
 * - GRACE:   rotated a moment ago → a parallel request (two tabs refreshing at
 *            once) already rotated it; issue a new pair without alarm.
 * - REUSE:   rotated a while ago → a copy is being replayed; revoke every session.
 * - INVALID: expired, or revoked deliberately (logout, password change,
 *            suspension). Those never get the grace window — otherwise a
 *            "log out everywhere" would leave a 30-second hole.
 */
export type RefreshDecision = { kind: "ROTATE" } | { kind: "GRACE" } | { kind: "REUSE" } | { kind: "INVALID" }

export const REFRESH_GRACE_MS = 30_000

export const decideRefresh = (
	token: { expiresAt: Date; revokedAt: Date | null; rotatedAt: Date | null },
	now: Date = new Date()
): RefreshDecision => {
	if (token.expiresAt <= now) return { kind: "INVALID" }
	if (!token.revokedAt) return { kind: "ROTATE" }
	if (!token.rotatedAt) return { kind: "INVALID" }
	if (now.getTime() - token.rotatedAt.getTime() <= REFRESH_GRACE_MS) return { kind: "GRACE" }
	return { kind: "REUSE" }
}
