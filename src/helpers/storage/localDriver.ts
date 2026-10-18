import fs from "fs/promises"
import path from "path"
import { env } from "../../config"
import httpStatus from "../../shared/httpStatus"
import ApiError from "../../app/errors/ApiError"
import { resolveInside } from "./safePath"
import type { StorageDriver } from "./types"

/**
 * Development driver: writes to <backend>/storage/public (gitignored) and is
 * served by `serveLocalMedia` at /media.
 *
 * TODO(frontend): the URL is `${PUBLIC_BASE_URL}/media/<key>`, i.e. the
 * storefront's domain. frontend/next.config.ts needs a rewrite for it next to
 * the /api/v1 one: { source: "/media/:path*", destination: `${API_ORIGIN}/media/:path*` }.
 */
export const LOCAL_MEDIA_ROOT = path.join(process.cwd(), "storage", "public")

const resolveKey = (key: string): string => {
	const full = resolveInside(LOCAL_MEDIA_ROOT, key)
	if (!full) throw new Error(`Refusing unsafe storage key: ${key}`)
	return full
}

export const localDriver: StorageDriver = {
	name: "local",

	async put(key, body) {
		const full = resolveKey(key)
		await fs.mkdir(path.dirname(full), { recursive: true })
		await fs.writeFile(full, body)
	},

	async get(key) {
		return fs.readFile(resolveKey(key))
	},

	async delete(key) {
		try {
			await fs.unlink(resolveKey(key))
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		}
	},

	publicUrl(key) {
		return `${env.PUBLIC_BASE_URL}/media/${key}`
	},

	async presignPut() {
		// Deliberate: a fake presigned flow would only exercise code that is not
		// what runs in production. Locally, use POST /media (multipart).
		throw new ApiError(
			httpStatus.NOT_IMPLEMENTED,
			"Direct uploads need STORAGE_DRIVER=r2. Use the regular upload endpoint instead."
		)
	},
}
