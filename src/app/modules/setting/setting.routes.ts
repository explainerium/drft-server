import { Router } from "express"
import { auth } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { SettingController } from "./setting.controller"
import { SettingValidation } from "./setting.validation"

const router = Router()

// Storefront: no auth. Registered before /:group so "public" is not a group name.
router.get("/public", SettingController.getPublic)

router.get("/:group", auth("ADMIN"), validateRequest(SettingValidation.getSchema), SettingController.get)
router.put("/:group", auth("ADMIN"), validateRequest(SettingValidation.updateSchema), SettingController.update)

export const SettingRoutes = router
