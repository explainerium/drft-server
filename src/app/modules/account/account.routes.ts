import { Router } from "express"
import { authAccount } from "../../middlewares/auth"
import validateRequest from "../../middlewares/validateRequest"
import { AccountController } from "./account.controller"
import { AccountValidation } from "./account.validation"

// The signed-in customer's own account. authAccount: suspended accounts can
// still correct their details.
const router = Router()

router.use(authAccount())

router.patch("/profile", validateRequest(AccountValidation.updateProfileSchema), AccountController.updateProfile)

router.get("/addresses", AccountController.listAddresses)
router.post("/addresses", validateRequest(AccountValidation.createAddressSchema), AccountController.createAddress)
router.patch("/addresses/:id", validateRequest(AccountValidation.updateAddressSchema), AccountController.updateAddress)
router.delete("/addresses/:id", validateRequest(AccountValidation.addressIdSchema), AccountController.deleteAddress)

export const AccountRoutes = router
