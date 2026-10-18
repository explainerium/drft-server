import type { Prisma } from "@prisma/client"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import ApiError from "../../errors/ApiError"
import { toPublicUser } from "../auth/auth.interface"
import type { AddressInput } from "./account.validation"

const updateProfile = async (userId: string, payload: { firstName?: string; lastName?: string; phone?: string | null }) =>
	toPublicUser(await prisma.user.update({ where: { id: userId }, data: payload }))

const listAddresses = (userId: string) =>
	prisma.address.findMany({ where: { userId }, orderBy: [{ isDefaultShipping: "desc" }, { createdAt: "asc" }] })

/** Only one default of each kind: setting one clears the flag on the others. */
const clearOtherDefaults = async (
	tx: Prisma.TransactionClient,
	userId: string,
	keepId: string,
	flags: { isDefaultShipping?: boolean; isDefaultBilling?: boolean }
) => {
	if (flags.isDefaultShipping) {
		await tx.address.updateMany({ where: { userId, id: { not: keepId } }, data: { isDefaultShipping: false } })
	}
	if (flags.isDefaultBilling) {
		await tx.address.updateMany({ where: { userId, id: { not: keepId } }, data: { isDefaultBilling: false } })
	}
}

const createAddress = (userId: string, payload: AddressInput) =>
	prisma.$transaction(async (tx) => {
		// The first address is both defaults, so checkout always has one selected.
		const isFirst = (await tx.address.count({ where: { userId } })) === 0
		const flags = {
			isDefaultShipping: isFirst || !!payload.isDefaultShipping,
			isDefaultBilling: isFirst || !!payload.isDefaultBilling,
		}
		const address = await tx.address.create({ data: { ...payload, ...flags, userId } })
		await clearOtherDefaults(tx, userId, address.id, flags)
		return address
	})

const findOwned = async (userId: string, id: string) => {
	const address = await prisma.address.findFirst({ where: { id, userId } })
	if (!address) throw new ApiError(httpStatus.NOT_FOUND, "Address not found")
	return address
}

const updateAddress = async (userId: string, id: string, payload: Partial<AddressInput>) => {
	await findOwned(userId, id)
	return prisma.$transaction(async (tx) => {
		const address = await tx.address.update({ where: { id }, data: payload })
		await clearOtherDefaults(tx, userId, id, payload)
		return address
	})
}

const deleteAddress = async (userId: string, id: string) => {
	const address = await findOwned(userId, id)
	await prisma.$transaction(async (tx) => {
		await tx.address.delete({ where: { id } })

		// Hand a removed default to the oldest remaining address.
		if (address.isDefaultShipping || address.isDefaultBilling) {
			const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } })
			if (next) {
				await tx.address.update({
					where: { id: next.id },
					data: {
						...(address.isDefaultShipping ? { isDefaultShipping: true } : {}),
						...(address.isDefaultBilling ? { isDefaultBilling: true } : {}),
					},
				})
			}
		}
	})
}

export const AccountService = { updateProfile, listAddresses, createAddress, updateAddress, deleteAddress }
