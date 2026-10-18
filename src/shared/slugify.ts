import slugifyLib from "slugify"

/** URL slug: lowercase, ASCII, hyphen-separated. "Aero V3 Kite!" → "aero-v3-kite". */
export const slugify = (input: string): string =>
	slugifyLib(input, { lower: true, strict: true, trim: true }).slice(0, 120)

/**
 * A slug that is not taken yet: "aero-v3", then "aero-v3-2", "aero-v3-3", ...
 * `isTaken` checks the table the slug is for.
 */
export const uniqueSlug = async (input: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> => {
	const base = slugify(input) || "item"
	let candidate = base
	for (let n = 2; await isTaken(candidate); n++) candidate = `${base}-${n}`
	return candidate
}
