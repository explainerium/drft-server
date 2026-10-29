import { Prisma } from "@prisma/client"
import { isReservedQueryKey } from "../../../domain/catalog/productFilters"
import { localize } from "../../../domain/i18n/locale"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import { currentLocale } from "../../../shared/requestContext"
import { slugify } from "../../../shared/slugify"
import ApiError from "../../errors/ApiError"
import type { AttributeInput, AttributeValueInput } from "./attribute.validation"

const valuesInclude = {
	values: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
} satisfies Prisma.AttributeInclude

const IN_USE = "This value is used by product variants. Remove it from those variants first."

/** Attribute codes double as storefront filter keys (?size=9m), so they must not shadow a real parameter. */
const toAttributeCode = (input: string) => {
	const code = slugify(input)
	if (!code) throw new ApiError(httpStatus.BAD_REQUEST, "The code needs at least one letter or digit")
	if (isReservedQueryKey(code)) throw new ApiError(httpStatus.BAD_REQUEST, `"${code}" is reserved; pick another code`)
	return code
}

const toValueCode = (input: string) => {
	const code = slugify(input)
	if (!code) throw new ApiError(httpStatus.BAD_REQUEST, "The code needs at least one letter or digit")
	return code
}

/** The Restrict FK on variant_attribute_values fires P2003 when a used value is deleted. */
const isForeignKeyError = (err: unknown) =>
	err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003"

const assertCodeFree = async (code: string, excludeId?: string) => {
	const clash = await prisma.attribute.findFirst({
		where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
		select: { id: true },
	})
	if (clash) throw new ApiError(httpStatus.CONFLICT, `An attribute with the code "${code}" already exists`)
}

const assertValueCodeFree = async (attributeId: string, code: string, excludeId?: string) => {
	const clash = await prisma.attributeValue.findFirst({
		where: { attributeId, code, ...(excludeId ? { id: { not: excludeId } } : {}) },
		select: { id: true },
	})
	if (clash) throw new ApiError(httpStatus.CONFLICT, `This attribute already has a value with the code "${code}"`)
}

/** JSON `null` must be spelled Prisma.DbNull to clear the column; undefined leaves it. */
const jsonData = (translations: AttributeInput["translations"] | AttributeValueInput["translations"]) =>
	translations === undefined ? {} : { translations: translations === null ? Prisma.DbNull : translations }

/** Every attribute with its values, in the request language. Public: the storefront builds filters and swatches from it. */
const list = async () => {
	const locale = currentLocale()
	const rows = await prisma.attribute.findMany({ include: valuesInclude, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
	return rows.map(({ translations, values, ...attribute }) => ({
		...localize(attribute, translations, locale, ["name"]),
		values: values.map(({ translations: t, ...v }) => localize(v, t, locale, ["label"])),
	}))
}

/** Like `list`, plus how many variants use each value, so the admin knows what can be deleted. */
const adminList = () =>
	prisma.attribute.findMany({
		include: {
			values: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }], include: { _count: { select: { variants: true } } } },
		},
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
	})

const get = async (id: string) => {
	const attribute = await prisma.attribute.findUnique({
		where: { id },
		include: {
			values: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }], include: { _count: { select: { variants: true } } } },
		},
	})
	if (!attribute) throw new ApiError(httpStatus.NOT_FOUND, "Attribute not found")
	return attribute
}

const create = async (payload: AttributeInput & { values: AttributeValueInput[] }) => {
	const code = toAttributeCode(payload.code ?? payload.name)
	await assertCodeFree(code)

	const values = payload.values.map((v, i) => ({
		code: toValueCode(v.code ?? v.label),
		label: v.label,
		hexColor: v.hexColor ?? null,
		sortOrder: v.sortOrder ?? i,
		...jsonData(v.translations),
	}))
	const codes = values.map((v) => v.code)
	const duplicate = codes.find((c, i) => codes.indexOf(c) !== i)
	if (duplicate) throw new ApiError(httpStatus.BAD_REQUEST, `The value code "${duplicate}" is used twice`)

	const attribute = await prisma.attribute.create({
		data: {
			code,
			name: payload.name,
			sortOrder: payload.sortOrder ?? 0,
			...jsonData(payload.translations),
			values: { create: values },
		},
	})
	return get(attribute.id)
}

const update = async (id: string, payload: Partial<AttributeInput>) => {
	await get(id)
	const code = payload.code !== undefined ? toAttributeCode(payload.code) : undefined
	if (code) await assertCodeFree(code, id)

	const { translations, ...rest } = payload
	await prisma.attribute.update({ where: { id }, data: { ...rest, ...jsonData(translations), ...(code ? { code } : {}) } })
	return get(id)
}

/** Deleting an attribute deletes its values, so the same in-use rule applies. */
const remove = async (id: string) => {
	await get(id)
	const used = await prisma.variantAttributeValue.count({ where: { attributeValue: { attributeId: id } } })
	if (used > 0) {
		throw new ApiError(httpStatus.CONFLICT, "Some values of this attribute are used by product variants")
	}
	try {
		await prisma.attribute.delete({ where: { id } })
	} catch (err) {
		if (isForeignKeyError(err)) throw new ApiError(httpStatus.CONFLICT, IN_USE)
		throw err
	}
}

const createValue = async (attributeId: string, payload: AttributeValueInput) => {
	await get(attributeId)
	const code = toValueCode(payload.code ?? payload.label)
	await assertValueCodeFree(attributeId, code)

	const count = await prisma.attributeValue.count({ where: { attributeId } })
	return prisma.attributeValue.create({
		data: {
			attributeId,
			code,
			label: payload.label,
			hexColor: payload.hexColor ?? null,
			sortOrder: payload.sortOrder ?? count,
			...jsonData(payload.translations),
		},
	})
}

const findValue = async (valueId: string) => {
	const value = await prisma.attributeValue.findUnique({ where: { id: valueId } })
	if (!value) throw new ApiError(httpStatus.NOT_FOUND, "Attribute value not found")
	return value
}

const updateValue = async (valueId: string, payload: Partial<AttributeValueInput>) => {
	const value = await findValue(valueId)
	const code = payload.code !== undefined ? toValueCode(payload.code) : undefined
	if (code) await assertValueCodeFree(value.attributeId, code, valueId)

	const { translations, ...rest } = payload
	return prisma.attributeValue.update({
		where: { id: valueId },
		data: { ...rest, ...jsonData(translations), ...(code ? { code } : {}) },
	})
}

const removeValue = async (valueId: string) => {
	await findValue(valueId)
	const used = await prisma.variantAttributeValue.count({ where: { attributeValueId: valueId } })
	if (used > 0) throw new ApiError(httpStatus.CONFLICT, IN_USE)
	try {
		await prisma.attributeValue.delete({ where: { id: valueId } })
	} catch (err) {
		// A variant picked the value up between the count and the delete.
		if (isForeignKeyError(err)) throw new ApiError(httpStatus.CONFLICT, IN_USE)
		throw err
	}
}

export const AttributeService = {
	list,
	adminList,
	get,
	create,
	update,
	remove,
	createValue,
	updateValue,
	removeValue,
}
