/**
 * SVG is stored as-is (no sharp), but it is a document that can carry script.
 * /media is proxied onto the storefront's own domain, so a scripted SVG would be
 * stored XSS there. Uploads are staff-only and the local handler also sends a
 * sandboxing CSP; this check is the part that also protects bucket-served files.
 *
 * Returns the reason a file is refused, or null when it is acceptable.
 */
export const checkSvg = (buffer: Buffer): string | null => {
	if (buffer.includes(0)) return "Not a text SVG file"

	const text = buffer.toString("utf8")
	if (!/<svg[\s>]/i.test(text)) return "Not an SVG file"

	if (/<!ENTITY/i.test(text)) return "SVG files must not declare entities"
	if (/<script[\s>]/i.test(text)) return "SVG files must not contain scripts"
	if (/<foreignObject[\s>]/i.test(text)) return "SVG files must not contain foreignObject"
	if (/\son[a-z]+\s*=/i.test(text)) return "SVG files must not contain event handlers"
	if (/javascript:/i.test(text)) return "SVG files must not contain javascript: URLs"

	// Only same-document references (#id) and embedded raster images.
	const hrefs = text.matchAll(/(?:xlink:)?href\s*=\s*["']\s*([^"']*)["']/gi)
	for (const [, value = ""] of hrefs) {
		if (!value.startsWith("#") && !/^data:image\/(png|jpeg|gif|webp);/i.test(value)) {
			return "SVG files must not reference external resources"
		}
	}

	return null
}
