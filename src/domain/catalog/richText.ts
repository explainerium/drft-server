import sanitizeHtml from "sanitize-html"

/**
 * Product descriptions come from the admin rich text editor and are rendered
 * as HTML on the storefront, so only the editor's own formatting survives a
 * save: paragraphs, headings, lists, emphasis, quotes and links. Scripts,
 * styles, event handlers, images and unsafe link protocols are dropped.
 */
const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i

const OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: ["p", "br", "strong", "em", "s", "u", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "hr"],
	allowedAttributes: { a: ["href", "target", "rel"] },
	allowedSchemes: ["http", "https", "mailto"],
	allowProtocolRelative: false,
	transformTags: {
		b: "strong",
		i: "em",
		// Links always open safely; a new tab only when the editor asked for one. A link
		// without a safe address becomes a span, which is dropped and leaves its text.
		a: (tagName, attribs) =>
			SAFE_HREF.test(attribs.href ?? "")
				? {
						tagName,
						attribs: {
							href: attribs.href!,
							...(attribs.target === "_blank" ? { target: "_blank" } : {}),
							rel: "noopener noreferrer nofollow",
						},
					}
				: { tagName: "span", attribs: {} },
	},
}

/** Safe HTML, or null when nothing readable is left (an empty editor saves "<p></p>"). */
export const sanitizeRichText = (html: string | null | undefined): string | null => {
	if (!html) return null
	const clean = sanitizeHtml(html, OPTIONS).trim()
	const text = clean.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()
	return text ? clean : null
}
