import { env } from "../../config"
import { logger } from "../../shared/logger"
import { localDriver } from "./localDriver"
import { r2Driver } from "./r2Driver"
import type { StorageDriver } from "./types"

export * from "./types"
export { LOCAL_MEDIA_ROOT } from "./localDriver"
export { resolveInside } from "./safePath"

const select = (): StorageDriver => {
	if (env.STORAGE_DRIVER === "r2") return r2Driver

	if (env.NODE_ENV === "production") {
		logger.warn("STORAGE_DRIVER is 'local' in production: uploads go to local disk and will not survive a redeploy")
	}
	return localDriver
}

export const storage: StorageDriver = select()
