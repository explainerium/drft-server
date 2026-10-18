import { Router } from "express"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { CategoryController } from "./category.controller"
import { CategoryValidation } from "./category.validation"

// Catalog routing scheme (same in categories, attributes and products):
//
//   GET    /                  storefront, public, visible data only
//   GET    /:slug             storefront, public
//   GET    /admin/list        staff: everything, incl. hidden / drafts
//   GET    /admin/:id         staff
//   POST   /admin             staff
//   PATCH  /admin/:id         staff
//   DELETE /admin/:id         staff
//
// Admin routes are registered before "/:slug" so "admin" is never read as a slug.
const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin/list", staff, CategoryController.adminList)
router.get("/admin/:id", staff, validateRequest(CategoryValidation.idSchema), CategoryController.adminGet)
router.post("/admin", staff, validateRequest(CategoryValidation.createSchema), CategoryController.create)
router.patch("/admin/:id", staff, validateRequest(CategoryValidation.updateSchema), CategoryController.update)
router.delete("/admin/:id", staff, validateRequest(CategoryValidation.idSchema), CategoryController.remove)

router.get("/", CategoryController.tree)
router.get("/:slug", validateRequest(CategoryValidation.slugSchema), CategoryController.getBySlug)

export const CategoryRoutes = router
