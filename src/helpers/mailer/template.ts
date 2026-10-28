import type { Mail } from "./index"

/**
 * One layout for every store email: a wordmark, a heading, short paragraphs,
 * an optional button and detail rows, and a footnote. Builds the HTML (inline
 * styles and tables, which mail clients need) and the plain-text version from
 * the same content. Every value is escaped; callers pass plain text only.
 */

export interface MailContent {
	to: string
	subject: string
	/** Shown by inboxes next to the subject. */
	preheader?: string
	heading: string
	paragraphs: string[]
	action?: { label: string; url: string }
	/** Label/value rows, e.g. tracking details. */
	details?: { label: string; value: string }[]
	/** Paragraphs after the button. */
	after?: string[]
	/** Small print at the bottom: why they got it, how to stop it. */
	footnote?: string
}

const BRAND = "#2d7811"
const INK = "#13222d"
const MUTED = "#5b6b76"
const PAGE = "#f3f5f7"
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")

/** Line breaks inside a paragraph stay line breaks. */
const paragraphHtml = (text: string, color = INK) =>
	`<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${color};">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`

const buttonHtml = ({ label, url }: { label: string; url: string }) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td style="border-radius:8px;background:${BRAND};">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 24px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(url)}" style="color:${BRAND};word-break:break-all;">${escapeHtml(url)}</a></p>`

const detailsHtml = (details: { label: string; value: string }[]) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;border-collapse:collapse;">
  ${details
		.map(
			(row) => `<tr>
    <td style="padding:8px 0;border-top:1px solid #e7ebee;font-family:${FONT};font-size:13px;color:${MUTED};width:40%;">${escapeHtml(row.label)}</td>
    <td style="padding:8px 0;border-top:1px solid #e7ebee;font-family:${FONT};font-size:14px;color:${INK};font-weight:600;">${escapeHtml(row.value)}</td>
  </tr>`
		)
		.join("")}
</table>`

export const renderMail = (content: MailContent): Mail => {
	const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAGE};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 20px;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:2px;color:${INK};">DRFT</td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e7ebee;border-radius:16px;padding:32px 28px;">
            <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:600;color:${INK};">${escapeHtml(content.heading)}</h1>
            ${content.paragraphs.map((p) => paragraphHtml(p)).join("\n")}
            ${content.details?.length ? detailsHtml(content.details) : ""}
            ${content.action ? buttonHtml(content.action) : ""}
            ${(content.after ?? []).map((p) => paragraphHtml(p, MUTED)).join("\n")}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">
            ${content.footnote ? `${escapeHtml(content.footnote)}<br><br>` : ""}DRFT · Kitesurf &amp; foil equipment
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

	const text = [
		content.heading,
		"",
		...content.paragraphs.flatMap((p) => [p, ""]),
		...(content.details ?? []).map((row) => `${row.label}: ${row.value}`),
		...(content.details?.length ? [""] : []),
		...(content.action ? [`${content.action.label}: ${content.action.url}`, ""] : []),
		...(content.after ?? []).flatMap((p) => [p, ""]),
		...(content.footnote ? [content.footnote, ""] : []),
		"DRFT · Kitesurf & foil equipment",
	].join("\n")

	return { to: content.to, subject: content.subject, text, html }
}
