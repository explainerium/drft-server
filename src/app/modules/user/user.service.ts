import bcrypt from "bcrypt"
import type { Prisma, UserRole, UserStatus } from "@prisma/client"
import { env } from "../../../config"
import httpStatus from "../../../shared/httpStatus"
import { toMeta, toSkipTake } from "../../../shared/pagination"
import { SALE_STATUSES } from "../../../domain/order/orderRules"
import { prisma } from "../../../shared/prisma"
import ApiError from "../../errors/ApiError"
import { toPublicUser } from "../auth/auth.interface"

interface ListQuery {
	page: number
	limit: number
	sortOrder: "asc" | "desc"
	sortBy: "createdAt" | "email" | "lastLoginAt"
	search?: string
	role?: UserRole
	status?: UserStatus
}

interface Actor {
	id: string
	role: UserRole
}

const list = async (query: ListQuery) => {
	const where: Prisma.UserWhereInput = {
		deletedAt: null,
		...(query.role ? { role: query.role } : {}),
		...(query.status ? { status: query.status } : {}),
		...(query.search
			? {
					OR: [
						{ email: { contains: query.search, mode: "insensitive" } },
						{ firstName: { contains: query.search, mode: "insensitive" } },
						{ lastName: { contains: query.search, mode: "insensitive" } },
					],
				}
			: {}),
	}

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where,
			orderBy: { [query.sortBy]: query.sortOrder },
			...toSkipTake(query),
			include: { _count: { select: { orders: true } } },
		}),
		prisma.user.count({ where }),
	])

	return {
		data: users.map((u) => ({ ...toPublicUser(u), lastLoginAt: u.lastLoginAt, orderCount: u._count.orders })),
		meta: toMeta(query, total),
	}
}

const get = async (id: string) => {
	const user = await prisma.user.findFirst({
		where: { id, deletedAt: null },
		include: { addresses: { orderBy: { createdAt: "asc" } } },
	})
	if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found")
	const sales = await prisma.order.aggregate({
		where: { userId: id, status: { in: SALE_STATUSES } },
		_sum: { total: true },
		_count: { _all: true },
	})
	return {
		...toPublicUser(user),
		lastLoginAt: user.lastLoginAt,
		addresses: user.addresses,
		// Paid orders only; unpaid and cancelled ones are not spending.
		paidOrders: sales._count._all,
		totalSpent: (sales._sum.total ?? 0).toFixed(2),
	}
}

/** Only an ADMIN can create staff or admin accounts. */
const createStaff = async (payload: {
	email: string
	password: string
	firstName: string
	lastName: string
	role: "STAFF" | "ADMIN"
}) => {
	const existing = await prisma.user.findUnique({ where: { email: payload.email } })
	if (existing) throw new ApiError(httpStatus.CONFLICT, "An account with this email already exists")

	const user = await prisma.user.create({
		data: {
			email: payload.email,
			passwordHash: await bcrypt.hash(payload.password, env.BCRYPT_ROUNDS),
			firstName: payload.firstName,
			lastName: payload.lastName,
			role: payload.role,
			emailVerifiedAt: new Date(),
		},
	})
	return toPublicUser(user)
}

const update = async (
	actor: Actor,
	id: string,
	payload: Partial<{ firstName: string; lastName: string; phone: string | null; role: UserRole; status: UserStatus }>
) => {
	const target = await prisma.user.findFirst({ where: { id, deletedAt: null } })
	if (!target) throw new ApiError(httpStatus.NOT_FOUND, "User not found")

	const changesAccess = payload.role !== undefined || payload.status !== undefined

	// Role and status are ADMIN-only, and nobody demotes or suspends themselves —
	// that is how a shop ends up with no admin.
	if (changesAccess && actor.role !== "ADMIN") {
		throw new ApiError(httpStatus.FORBIDDEN, "Only an admin can change roles or status")
	}
	if (changesAccess && actor.id === id) {
		throw new ApiError(httpStatus.BAD_REQUEST, "You cannot change your own role or status")
	}
	// STAFF may edit customers' details but not other staff.
	if (actor.role === "STAFF" && target.role !== "CUSTOMER") {
		throw new ApiError(httpStatus.FORBIDDEN, "Insufficient permissions")
	}

	const user = await prisma.$transaction(async (tx) => {
		const updated = await tx.user.update({ where: { id }, data: payload })
		// Suspension or a role change ends existing sessions at their next refresh.
		if (changesAccess) {
			await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
		}
		return updated
	})

	return toPublicUser(user)
}

/** Soft delete: orders keep their customer; the email is freed for re-registration. */
const remove = async (actor: Actor, id: string) => {
	if (actor.id === id) throw new ApiError(httpStatus.BAD_REQUEST, "You cannot delete your own account here")

	const target = await prisma.user.findFirst({ where: { id, deletedAt: null } })
	if (!target) throw new ApiError(httpStatus.NOT_FOUND, "User not found")

	await prisma.$transaction([
		prisma.user.update({
			where: { id },
			data: { deletedAt: new Date(), email: `deleted+${id}@drft.invalid` },
		}),
		prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
	])
}

export const UserService = { list, get, createStaff, update, remove }
