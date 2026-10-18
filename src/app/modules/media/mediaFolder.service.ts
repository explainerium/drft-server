import { wouldCreateCycle } from "../../../domain/media/folders"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import ApiError from "../../errors/ApiError"

/**
 * Media folders form a tree (parentId). The list is flat with parentId and
 * counts; the admin builds the tree. Folders are few, so cycle checks load them all.
 */

const list = async () => {
	const rows = await prisma.mediaFolder.findMany({
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
		include: { _count: { select: { assets: true, children: true } } },
	})
	return rows.map(({ _count, ...folder }) => ({ ...folder, assetCount: _count.assets, childCount: _count.children }))
}

const assertNameFree = async (name: string, parentId: string | null, exceptId?: string) => {
	const clash = await prisma.mediaFolder.findFirst({
		where: { parentId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
		select: { id: true },
	})
	if (clash) throw new ApiError(httpStatus.CONFLICT, "A folder with this name already exists here")
}

const create = async (payload: { name: string; parentId?: string | null; sortOrder?: number }) => {
	const parentId = payload.parentId ?? null
	if (parentId) {
		const parent = await prisma.mediaFolder.findUnique({ where: { id: parentId }, select: { id: true } })
		if (!parent) throw new ApiError(httpStatus.NOT_FOUND, "Parent folder not found")
	}
	await assertNameFree(payload.name, parentId)

	return prisma.mediaFolder.create({
		data: { name: payload.name, parentId, ...(payload.sortOrder !== undefined ? { sortOrder: payload.sortOrder } : {}) },
	})
}

const update = async (id: string, payload: { name?: string; parentId?: string | null; sortOrder?: number }) => {
	const folders = await prisma.mediaFolder.findMany({ select: { id: true, parentId: true } })
	const parentOf = new Map(folders.map((f) => [f.id, f.parentId]))

	if (!parentOf.has(id)) throw new ApiError(httpStatus.NOT_FOUND, "Folder not found")

	if (payload.parentId !== undefined && payload.parentId !== null) {
		if (!parentOf.has(payload.parentId)) throw new ApiError(httpStatus.NOT_FOUND, "Parent folder not found")
		if (wouldCreateCycle(id, payload.parentId, parentOf)) {
			throw new ApiError(httpStatus.BAD_REQUEST, "A folder cannot be moved into itself or one of its subfolders")
		}
	}

	if (payload.name !== undefined || payload.parentId !== undefined) {
		const current = await prisma.mediaFolder.findUniqueOrThrow({ where: { id } })
		await assertNameFree(
			payload.name ?? current.name,
			payload.parentId !== undefined ? payload.parentId : current.parentId,
			id
		)
	}

	return prisma.mediaFolder.update({ where: { id }, data: payload })
}

/** Assets and subfolders move up to the deleted folder's parent (root if none). */
const remove = async (id: string) => {
	return prisma.$transaction(async (tx) => {
		const folder = await tx.mediaFolder.findUnique({ where: { id } })
		if (!folder) throw new ApiError(httpStatus.NOT_FOUND, "Folder not found")

		const assets = await tx.asset.updateMany({ where: { folderId: id }, data: { folderId: folder.parentId } })
		const children = await tx.mediaFolder.updateMany({ where: { parentId: id }, data: { parentId: folder.parentId } })
		await tx.mediaFolder.delete({ where: { id } })

		return { movedTo: folder.parentId, movedAssets: assets.count, movedFolders: children.count }
	})
}

export const MediaFolderService = { list, create, update, remove }
