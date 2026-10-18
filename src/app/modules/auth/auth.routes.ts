import { Router } from "express"
import { auth, authAccount } from "../../middlewares/auth"
import { credentialLimiter } from "../../middlewares/rateLimiter"
import validateRequest from "../../middlewares/validateRequest"
import { AuthController } from "./auth.controller"
import { AuthValidation } from "./auth.validation"

const router = Router()

router.post("/register", credentialLimiter, validateRequest(AuthValidation.registerSchema), AuthController.register)
router.post("/login", credentialLimiter, validateRequest(AuthValidation.loginSchema), AuthController.login)
router.post("/refresh", AuthController.refresh)
router.post("/logout", AuthController.logout)

// authAccount: a suspended customer must still be able to load their session.
router.get("/me", authAccount(), AuthController.me)

router.post(
	"/forgot-password",
	credentialLimiter,
	validateRequest(AuthValidation.forgotPasswordSchema),
	AuthController.forgotPassword
)
router.post(
	"/reset-password",
	credentialLimiter,
	validateRequest(AuthValidation.resetPasswordSchema),
	AuthController.resetPassword
)
router.patch(
	"/change-password",
	authAccount(),
	validateRequest(AuthValidation.changePasswordSchema),
	AuthController.changePassword
)
router.post("/verify-email", validateRequest(AuthValidation.verifyEmailSchema), AuthController.verifyEmail)
router.post("/resend-verification", credentialLimiter, auth(), AuthController.resendVerification)

export const AuthRoutes = router
