import { Router, type RequestHandler } from "express"
import multer from "multer"
import { isImageMime } from "../../../domain/media/image"
import httpStatus from "../../../shared/httpStatus"
import ApiError from "../../errors/ApiError"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { MAX_UPLOAD_BYTES, megabytes } from "./media.constant"
import { MediaController } from "./media.controller"
import { MediaValidation } from "./media.validation"

/**
 * Memory storage: the buffer goes to sharp and then to storage, so nothing
 * untrusted is written to the server's disk. The declared type is filtered
 * here and verified by decoding in the service.
 */
const multipart = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 },
	fileFilter: (_req, file, callback) => {
		if (isImageMime(file.mimetype)) return callback(null, true)
		callback(new ApiError(httpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG, PNG, WebP, AVIF, GIF and SVG images are accepted"))
	},
})

/** multer's own errors as API errors instead of 500s. */
const singleFile: RequestHandler = (req, res, next) => {
	multipart.single("file")(req, res, (err: unknown) => {
		if (err instanceof multer.MulterError) {
			return next(
				err.code === "LIMIT_FILE_SIZE"
					? new ApiError(
							httpStatus.PAYLOAD_TOO_LARGE,
							`Images uploaded here are limited to ${megabytes(MAX_UPLOAD_BYTES)}. Use a direct upload for larger files.`
						)
					: new ApiError(httpStatus.BAD_REQUEST, err.message)
			)
		}
		next(err)
	})
}

const router = Router()

router.use(auth(...STAFF_ROLES))

router.get("/", validateRequest(MediaValidation.listSchema), MediaController.list)
router.post("/", singleFile, validateRequest(MediaValidation.uploadSchema), MediaController.upload)

// Large files: presign → browser PUTs to the bucket → complete registers the asset.
router.post("/presign", validateRequest(MediaValidation.presignSchema), MediaController.presign)
router.post("/complete", validateRequest(MediaValidation.completeSchema), MediaController.complete)

// Folders before /:id so "folders" is never read as an asset id.
router.get("/folders", MediaController.listFolders)
router.post("/folders", validateRequest(MediaValidation.createFolderSchema), MediaController.createFolder)
router.patch("/folders/:id", validateRequest(MediaValidation.updateFolderSchema), MediaController.updateFolder)
router.delete("/folders/:id", validateRequest(MediaValidation.getSchema), MediaController.removeFolder)

router.get("/:id", validateRequest(MediaValidation.getSchema), MediaController.get)
router.patch("/:id", validateRequest(MediaValidation.updateSchema), MediaController.update)
router.delete("/:id", validateRequest(MediaValidation.getSchema), MediaController.remove)

export const MediaRoutes = router
