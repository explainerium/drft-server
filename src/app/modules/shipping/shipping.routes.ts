import { Router } from "express"
import { auth } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { ShippingController } from "./shipping.controller"
import { ShippingValidation } from "./shipping.validation"

// Shipping setup, admins only (like settings). Checkout reads zones directly.
//
//   GET    /admin/zones                 zones with their rates
//   POST   /admin/zones                 409 when a country is already in another active zone
//   PATCH  /admin/zones/:id
//   DELETE /admin/zones/:id             its rates go with it
//   POST   /admin/zones/:id/rates
//   PATCH  /admin/rates/:rateId
//   DELETE /admin/rates/:rateId
//
// Every rate change answers with the whole zone.
const router = Router()

router.use(auth("ADMIN"))

router.get("/admin/zones", ShippingController.list)
router.post("/admin/zones", validateRequest(ShippingValidation.createZoneSchema), ShippingController.createZone)
router.patch("/admin/zones/:id", validateRequest(ShippingValidation.updateZoneSchema), ShippingController.updateZone)
router.delete("/admin/zones/:id", validateRequest(ShippingValidation.zoneIdSchema), ShippingController.removeZone)
router.post("/admin/zones/:id/rates", validateRequest(ShippingValidation.createRateSchema), ShippingController.createRate)
router.patch("/admin/rates/:rateId", validateRequest(ShippingValidation.updateRateSchema), ShippingController.updateRate)
router.delete("/admin/rates/:rateId", validateRequest(ShippingValidation.rateIdSchema), ShippingController.removeRate)

export const ShippingRoutes = router
