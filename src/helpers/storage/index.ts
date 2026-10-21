import { env } from "../../config"
import { logger } from "../../shared/logger"
import { localDriver } from "./localDriver"
import { s3Driver } from "./s3Driver"
import type { StorageDriver } from "./types"

export * from "./types"
export { LOCAL_MEDIA_ROOT } from "./localDriver"
export { resolveInside } from "./safePath"

const select = (): StorageDriver => {
	if (env.STORAGE_DRIVER === "s3") return s3Driver

	if (env.NODE_ENV === "production") {
		logger.warn("STORAGE_DRIVER is 'local' in production: uploads go to local disk and will not survive a redeploy")
	}
	return localDriver
}

export const storage: StorageDriver = select()
