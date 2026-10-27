import type { Response } from "express"

/**
 * CSV for admin exports and imports (RFC 4180: comma separated, fields in
 * double quotes, inner quotes doubled, CRLF or LF line ends).
 */

/** A quoted field. A leading = + - @ is defused, so a spreadsheet never runs it as a formula. */
export const csvField = (value: string | number | boolean | null | undefined): string => {
	const text = value === null || value === undefined ? "" : String(value)
	return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`
}

export const toCsv = (header: string[], rows: (string | number | boolean | null | undefined)[][]): string =>
	[header.join(","), ...rows.map((row) => row.map(csvField).join(","))].join("\n") + "\n"

/** Sends a CSV download. The BOM makes Excel read it as UTF-8. */
export const sendCsv = (res: Response, filename: string, csv: string): void => {
	res.setHeader("Content-Type", "text/csv; charset=utf-8")
	res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
	res.status(200).send(`﻿${csv}`)
}

/**
 * Rows of fields. Quoted fields may hold commas, quotes and line breaks;
 * blank lines are skipped. Throws on a quote that is never closed.
 */
export const parseCsv = (input: string): string[][] => {
	const text = input.replace(/^﻿/, "")
	const rows: string[][] = []
	let row: string[] = []
	let field = ""
	let quoted = false

	const endField = () => {
		row.push(field)
		field = ""
	}
	const endRow = () => {
		endField()
		if (row.length > 1 || row[0] !== "") rows.push(row)
		row = []
	}

	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"'
				i++
			} else if (char === '"') quoted = false
			else field += char
		} else if (char === '"' && field === "") quoted = true
		else if (char === ",") endField()
		else if (char === "\n") endRow()
		else if (char === "\r") {
			if (text[i + 1] !== "\n") endRow()
		} else field += char
	}
	if (quoted) throw new Error("A quoted field is never closed")
	if (field !== "" || row.length) endRow()
	return rows
}
