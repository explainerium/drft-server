import fs from "fs/promises"
import type { RequestHandler } from "express"
import { LOCAL_MEDIA_ROOT, resolveInside, storage } from "../../../helpers/storage"

/**
 * Serves files written by the local storage driver. Mount at /media in app.ts
 * (outside /api/v1). With STORAGE_DRIVER=s3 it passes everything on (404),
 * because the bucket serves its own public URLs.
 *
 * - Path traversal: `resolveInside` refuses anything outside storage/public.
 * - Cross-Origin-Resource-Policy: cross-origin overrides helmet's same-origin,
 *   so the storefront (another origin in development) can embed the images.
 * - Keys are random and never rewritten, so responses are cacheable forever.
 * - The sandboxing CSP neutralises script in an SVG opened directly.
 */
export const serveLocalMedia: RequestHandler = async (req, res, next) => {
	if (storage.name !== "local" || (req.method !== "GET" && req.method !== "HEAD")) return next()

	const full = resolveInside(LOCAL_MEDIA_ROOT, req.path)
	if (!full) return next()

	try {
		const stat = await fs.stat(full)
		if (!stat.isFile()) return next()
	} catch {
		return next()
	}

	res.sendFile(
		full,
		{
			maxAge: "365d",
			immutable: true,
			dotfiles: "deny",
			headers: {
				"Cross-Origin-Resource-Policy": "cross-origin",
				"X-Content-Type-Options": "nosniff",
				"Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
			},
		},
		(err) => {
			// A client that hung up mid-download is not an error worth a handler.
			if (err && !res.headersSent) next()
		}
	)
}
