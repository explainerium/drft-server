import type { Prisma } from "@prisma/client"
import { countryClashes, normalizeCountries } from "../../../domain/shipping/zoneRules"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import ApiError from "../../errors/ApiError"

interface ZoneInput {
	name: string
	countries: string[]
	isActive: boolean
	sortOrder: number
}

interface RateInput {
	name: string
	description: string | null
	price: string
	freeOverThreshold: boolean
	isActive: boolean
	sortOrder: number
}

const zoneSelect = {
	id: true,
	name: true,
	countries: true,
	isActive: true,
	sortOrder: true,
	rates: {
		orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
		select: {
			id: true,
			name: true,
			description: true,
			price: true,
			freeOverThreshold: true,
			isActive: true,
			sortOrder: true,
		},
	},
} satisfies Prisma.ShippingZoneSelect

type ZoneRow = Prisma.ShippingZoneGetPayload<{ select: typeof zoneSelect }>

const toZone = (zone: ZoneRow) => ({
	...zone,
	rates: zone.rates.map((rate) => ({ ...rate, price: rate.price.toFixed(2) })),
})

const list = async () =>
	(await prisma.shippingZone.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: zoneSelect })).map(
		toZone
	)

/** Refuses a zone whose countries another active zone already ships to. */
const assertNoClash = async (zone: { id?: string; isActive: boolean; countries: string[] }) => {
	const others = await prisma.shippingZone.findMany({ select: { id: true, name: true, isActive: true, countries: true } })
	const clashes = countryClashes(zone, others)
	if (clashes.length) {
		const list = clashes.map((c) => `${c.country} (${c.zone})`).join(", ")
		throw new ApiError(httpStatus.CONFLICT, `These countries are already in another active zone: ${list}`)
	}
}

const createZone = async (input: ZoneInput) => {
	const countries = normalizeCountries(input.countries)
	await assertNoClash({ isActive: input.isActive, countries })
	const zone = await prisma.shippingZone.create({ data: { ...input, countries }, select: zoneSelect })
	return toZone(zone)
}

const findZone = async (id: string) => {
	const zone = await prisma.shippingZone.findUnique({ where: { id }, select: { id: true, isActive: true, countries: true } })
	if (!zone) throw new ApiError(httpStatus.NOT_FOUND, "Shipping zone not found")
	return zone
}

const updateZone = async (id: string, input: Partial<ZoneInput>) => {
	const current = await findZone(id)
	const countries = input.countries ? normalizeCountries(input.countries) : current.countries
	await assertNoClash({ id, isActive: input.isActive ?? current.isActive, countries })
	const zone = await prisma.shippingZone.update({
		where: { id },
		data: { ...input, ...(input.countries ? { countries } : {}) },
		select: zoneSelect,
	})
	return toZone(zone)
}

/** Its rates go with it. Placed orders keep the method name they were shipped with. */
const removeZone = async (id: string) => {
	await findZone(id)
	await prisma.shippingZone.delete({ where: { id } })
}

const createRate = async (zoneId: string, input: RateInput) => {
	await findZone(zoneId)
	await prisma.shippingRate.create({ data: { ...input, zoneId } })
	return toZone(await prisma.shippingZone.findUniqueOrThrow({ where: { id: zoneId }, select: zoneSelect }))
}

const findRate = async (rateId: string) => {
	const rate = await prisma.shippingRate.findUnique({ where: { id: rateId }, select: { zoneId: true } })
	if (!rate) throw new ApiError(httpStatus.NOT_FOUND, "Shipping rate not found")
	return rate
}

const updateRate = async (rateId: string, input: Partial<RateInput>) => {
	const { zoneId } = await findRate(rateId)
	await prisma.shippingRate.update({ where: { id: rateId }, data: input })
	return toZone(await prisma.shippingZone.findUniqueOrThrow({ where: { id: zoneId }, select: zoneSelect }))
}

const removeRate = async (rateId: string) => {
	const { zoneId } = await findRate(rateId)
	await prisma.shippingRate.delete({ where: { id: rateId } })
	return toZone(await prisma.shippingZone.findUniqueOrThrow({ where: { id: zoneId }, select: zoneSelect }))
}

export const ShippingService = { list, createZone, updateZone, removeZone, createRate, updateRate, removeRate }
