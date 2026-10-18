import { Router } from "express"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { AttributeController } from "./attribute.controller"
import { AttributeValidation } from "./attribute.validation"

// Catalog routing scheme (same in categories, attributes and products):
//
//   GET    /                          storefront, public: attributes + values (filters, swatches)
//   GET    /admin/list                staff, with per-value variant usage counts
//   GET    /admin/:id                 staff
//   POST   /admin                     staff (values may be created inline)
//   PATCH  /admin/:id                 staff
//   DELETE /admin/:id                 staff, 409 while any value is used by a variant
//   POST   /admin/:id/values          staff
//   PATCH  /admin/values/:valueId     staff
//   DELETE /admin/values/:valueId     staff, 409 while used by a variant
const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin/list", staff, AttributeController.adminList)
router.get("/admin/:id", staff, validateRequest(AttributeValidation.idSchema), AttributeController.get)
router.post("/admin", staff, validateRequest(AttributeValidation.createSchema), AttributeController.create)
router.patch("/admin/:id", staff, validateRequest(AttributeValidation.updateSchema), AttributeController.update)
router.delete("/admin/:id", staff, validateRequest(AttributeValidation.idSchema), AttributeController.remove)

router.post(
	"/admin/:id/values",
	staff,
	validateRequest(AttributeValidation.createValueSchema),
	AttributeController.createValue
)
router.patch(
	"/admin/values/:valueId",
	staff,
	validateRequest(AttributeValidation.updateValueSchema),
	AttributeController.updateValue
)
router.delete(
	"/admin/values/:valueId",
	staff,
	validateRequest(AttributeValidation.valueIdSchema),
	AttributeController.removeValue
)

router.get("/", AttributeController.list)

export const AttributeRoutes = router
