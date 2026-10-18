import { Router } from "express"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { UserController } from "./user.controller"
import { UserValidation } from "./user.validation"

// Admin user management. Customers manage themselves through /account.
const router = Router()

router.get("/", auth(...STAFF_ROLES), validateRequest(UserValidation.listSchema), UserController.list)
router.post("/staff", auth("ADMIN"), validateRequest(UserValidation.createStaffSchema), UserController.createStaff)
router.get("/:id", auth(...STAFF_ROLES), validateRequest(UserValidation.getSchema), UserController.get)
router.patch("/:id", auth(...STAFF_ROLES), validateRequest(UserValidation.updateSchema), UserController.update)
router.delete("/:id", auth("ADMIN"), validateRequest(UserValidation.getSchema), UserController.remove)

export const UserRoutes = router
