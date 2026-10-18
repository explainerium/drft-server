import { Router } from "express"
import { auth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { ProductController } from "./product.controller"
import { ProductValidation } from "./product.validation"

// Catalog routing scheme (same in categories, attributes and products):
//
//   GET    /                  storefront, public, PUBLISHED only; paginated, filters + sort
//                             (?category=&search=&featured=&minPrice=&maxPrice=&sort=, any
//                             other key is an attribute filter: ?size=9m,10m&color=black)
//   GET    /:slug             storefront, public: the product page
//   GET    /admin/list        staff: every status; search, status, featured
//   GET    /admin/:id         staff: the editor's view (inactive variants, raw ids)
//   POST   /admin             staff: product + variants, images, specs, categories, related
//   PATCH  /admin/:id         staff: lists that are sent replace the stored ones
//   DELETE /admin/:id         staff
//
// Admin routes are registered before "/:slug" so "admin" is never read as a slug.
const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin/list", staff, validateRequest(ProductValidation.adminListSchema), ProductController.adminList)
router.get("/admin/:id", staff, validateRequest(ProductValidation.idSchema), ProductController.adminGet)
router.post("/admin", staff, validateRequest(ProductValidation.createSchema), ProductController.create)
router.patch("/admin/:id", staff, validateRequest(ProductValidation.updateSchema), ProductController.update)
router.delete("/admin/:id", staff, validateRequest(ProductValidation.idSchema), ProductController.remove)

router.get("/", validateRequest(ProductValidation.listSchema), ProductController.list)
router.get("/:slug", validateRequest(ProductValidation.slugSchema), ProductController.getBySlug)

export const ProductRoutes = router
