import type { RequestHandler } from "express"
import catchAsync from "../../../shared/catchAsync"
import httpStatus from "../../../shared/httpStatus"
import sendResponse from "../../../shared/sendResponse"
import ApiError from "../../errors/ApiError"
import { MediaService } from "./media.service"
import { MediaFolderService } from "./mediaFolder.service"

const list: RequestHandler = catchAsync(async (req, res) => {
	const { data, meta } = await MediaService.list(req.query as never)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Media", data, meta })
})

const get: RequestHandler = catchAsync(async (req, res) => {
	const asset = await MediaService.get(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Asset", data: asset })
})

const upload: RequestHandler = catchAsync(async (req, res) => {
	if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, "Attach an image in the \"file\" field")
	const asset = await MediaService.upload(req.file, { ...req.body, uploadedById: req.user!.sub })
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Image uploaded", data: asset })
})

const presign: RequestHandler = catchAsync(async (req, res) => {
	const result = await MediaService.presign(req.body, req.user!.sub)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Upload URL issued", data: result })
})

const complete: RequestHandler = catchAsync(async (req, res) => {
	const asset = await MediaService.complete(req.body, req.user!.sub)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Image uploaded", data: asset })
})

const update: RequestHandler = catchAsync(async (req, res) => {
	const asset = await MediaService.update(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Asset updated", data: asset })
})

const remove: RequestHandler = catchAsync(async (req, res) => {
	await MediaService.remove(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Asset deleted" })
})

const listFolders: RequestHandler = catchAsync(async (_req, res) => {
	const folders = await MediaFolderService.list()
	sendResponse(res, { statusCode: httpStatus.OK, message: "Folders", data: folders })
})

const createFolder: RequestHandler = catchAsync(async (req, res) => {
	const folder = await MediaFolderService.create(req.body)
	sendResponse(res, { statusCode: httpStatus.CREATED, message: "Folder created", data: folder })
})

const updateFolder: RequestHandler = catchAsync(async (req, res) => {
	const folder = await MediaFolderService.update(req.params.id as string, req.body)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Folder updated", data: folder })
})

const removeFolder: RequestHandler = catchAsync(async (req, res) => {
	const result = await MediaFolderService.remove(req.params.id as string)
	sendResponse(res, { statusCode: httpStatus.OK, message: "Folder deleted", data: result })
})

export const MediaController = {
	list,
	get,
	upload,
	presign,
	complete,
	update,
	remove,
	listFolders,
	createFolder,
	updateFolder,
	removeFolder,
}
