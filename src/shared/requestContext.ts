import { AsyncLocalStorage } from "async_hooks"
import type { RequestHandler } from "express"
import { DEFAULT_LOCALE, parseLocale, type Locale } from "../domain/i18n/locale"

/**
 * Per-request values that would otherwise be passed through every service:
 * the storefront language, from the `x-drft-locale` header.
 */
const storage = new AsyncLocalStorage<{ locale: Locale }>()

export const requestContext: RequestHandler = (req, _res, next) => {
	storage.run({ locale: parseLocale(req.get("x-drft-locale")) }, next)
}

export const currentLocale = (): Locale => storage.getStore()?.locale ?? DEFAULT_LOCALE
