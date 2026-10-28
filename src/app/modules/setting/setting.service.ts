import type { Prisma } from "@prisma/client"
import { localize } from "../../../domain/i18n/locale"
import { storage } from "../../../helpers/storage"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import { currentLocale } from "../../../shared/requestContext"
import ApiError from "../../errors/ApiError"
import {
	applyGroupUpdate,
	isSettingGroup,
	parseStoredGroup,
	PUBLIC_SETTING_GROUPS,
	SETTING_GROUPS,
	type SettingGroupKey,
} from "./setting.registry"

const groupOf = (group: string): SettingGroupKey => {
	if (!isSettingGroup(group)) throw new ApiError(httpStatus.NOT_FOUND, "Unknown settings group")
	return group
}

/** Every public group, merged with defaults. Also resolves the SEO share image to a URL. */
const getPublic = async () => {
	const rows = await prisma.setting.findMany({ where: { key: { in: PUBLIC_SETTING_GROUPS } } })
	const stored = new Map(rows.map((row) => [row.key, row.value]))

	const result: Record<string, unknown> = Object.fromEntries(
		PUBLIC_SETTING_GROUPS.map((key) => [key, parseStoredGroup(key, stored.get(key))])
	)

	if (SETTING_GROUPS.seo.isPublic) {
		const seo = parseStoredGroup("seo", stored.get("seo"))
		const asset = seo.ogImageAssetId
			? await prisma.asset.findUnique({ where: { id: seo.ogImageAssetId }, select: { storageKey: true } })
			: null
		const { translations, ...base } = seo
		result.seo = {
			...localize(base, translations, currentLocale(), ["defaultTitle", "defaultDescription"]),
			ogImageUrl: asset ? storage.publicUrl(asset.storageKey) : null,
		}
	}

	return result
}

const get = async (group: string) => {
	const key = groupOf(group)
	const row = await prisma.setting.findUnique({ where: { key } })
	return parseStoredGroup(key, row?.value)
}

/** The body is merged over the current value, so a single field can be saved alone. */
const update = async (group: string, patch: Record<string, unknown>) => {
	const key = groupOf(group)
	const row = await prisma.setting.findUnique({ where: { key } })
	const next = applyGroupUpdate(key, parseStoredGroup(key, row?.value), patch)

	if (key === "seo") {
		const assetId = (next as { ogImageAssetId: string | null }).ogImageAssetId
		if (assetId && !(await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } }))) {
			throw new ApiError(httpStatus.BAD_REQUEST, "The selected share image does not exist")
		}
	}

	const value = next as Prisma.InputJsonObject
	const { isPublic } = SETTING_GROUPS[key]
	await prisma.setting.upsert({
		where: { key },
		create: { key, value, isPublic },
		update: { value, isPublic },
	})
	return next
}

export const SettingService = { getPublic, get, update }
