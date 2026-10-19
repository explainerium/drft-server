import { Router } from "express"
import { auth, optionalAuth, STAFF_ROLES } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { OrderController } from "./order.controller"
import { OrderValidation } from "./order.validation"

//   GET   /:id                     the buyer's own order: signed-in customer or the guest who placed it
//   GET   /admin/list              staff: search (number, email, name), status and customer filters
//   GET   /admin/counts            staff: orders per status
//   GET   /admin/:id               staff: order, customer, history, notes, allowed next statuses
//   PATCH /admin/:id/status        staff: forward moves only (see domain/order/orderRules)
//   PATCH /admin/:id/tracking      staff: correct tracking after shipping
//   POST  /admin/:id/notes         staff: internal note
//
// Admin routes are registered before "/:id".
const router = Router()
const staff = auth(...STAFF_ROLES)

router.get("/admin/list", staff, validateRequest(OrderValidation.adminListSchema), OrderController.adminList)
router.get("/admin/counts", staff, OrderController.adminCounts)
router.get("/admin/:id", staff, validateRequest(OrderValidation.orderIdSchema), OrderController.adminGet)
router.patch(
	"/admin/:id/status",
	staff,
	validateRequest(OrderValidation.changeStatusSchema),
	OrderController.changeStatus
)
router.patch(
	"/admin/:id/tracking",
	staff,
	validateRequest(OrderValidation.trackingSchema),
	OrderController.updateTracking
)
router.post("/admin/:id/notes", staff, validateRequest(OrderValidation.noteSchema), OrderController.addNote)

router.get("/:id", optionalAuth, validateRequest(OrderValidation.orderIdSchema), OrderController.getOne)

export const OrderRoutes = router
