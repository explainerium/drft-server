import { Router } from "express"
import { optionalAuth } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { CartController } from "./cart.controller"
import { CartValidation } from "./cart.validation"

// Guests (cart cookie) and signed-in customers alike.
const router = Router()

router.use(optionalAuth)

router.get("/", CartController.get)
router.post("/items", validateRequest(CartValidation.addItemSchema), CartController.addItem)
router.patch("/items/:itemId", validateRequest(CartValidation.updateItemSchema), CartController.updateItem)
router.delete("/items/:itemId", validateRequest(CartValidation.itemIdSchema), CartController.removeItem)

export const CartRoutes = router
