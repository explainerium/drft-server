import { Router } from "express"
import { auth } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { WishlistController } from "./wishlist.controller"
import { WishlistValidation } from "./wishlist.validation"

// Signed-in customers only. Every change answers with the whole list.
const router = Router()

router.use(auth())

router.get("/", WishlistController.list)
router.post("/", validateRequest(WishlistValidation.addSchema), WishlistController.add)
router.delete("/:productId", validateRequest(WishlistValidation.productIdSchema), WishlistController.remove)

export const WishlistRoutes = router
