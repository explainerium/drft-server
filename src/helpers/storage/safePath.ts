import path from "path"

/**
 * Resolves a storage key (or a URL path under /media) to a file inside `root`,
 * or returns null when it would point anywhere else.
 *
 * Pure apart from path maths, so it is unit tested directly. Rejects:
 * - malformed percent-encoding
 * - NUL bytes and backslashes (Windows treats "\" as a separator)
 * - "." / ".." segments and empty segments
 * - anything that still resolves outside `root`
 */
export const resolveInside = (root: string, rawKey: string): string | null => {
	let key: string
	try {
		key = decodeURIComponent(rawKey)
	} catch {
		return null
	}

	key = key.replace(/^\/+/, "")
	if (!key || key.includes("\0") || key.includes("\\")) return null

	const segments = key.split("/")
	if (segments.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) return null

	const base = path.resolve(root)
	const full = path.resolve(base, ...segments)
	if (!full.startsWith(base + path.sep)) return null

	return full
}
