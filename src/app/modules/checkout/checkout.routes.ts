import { Router } from "express"
import { optionalAuth } from "../../middlewares/auth"
import { orderLimiter } from "../../middlewares/rateLimiter"
import validateRequest from "../../middlewares/validateRequest"
import { CheckoutController } from "./checkout.controller"
import { CheckoutValidation } from "./checkout.validation"

// Works on the request's cart, like /cart: guests and signed-in customers.
const router = Router()

router.use(optionalAuth)

router.get("/", validateRequest(CheckoutValidation.quoteSchema), CheckoutController.quote)
// For address forms outside checkout (the account address book).
router.get("/countries", CheckoutController.countries)
router.post("/orders", orderLimiter, validateRequest(CheckoutValidation.placeOrderSchema), CheckoutController.placeOrder)

export const CheckoutRoutes = router
