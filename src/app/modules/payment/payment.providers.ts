import type { PaymentProvider } from "@prisma/client"
import { env } from "../../../config"

/** Providers whose keys are configured, in the order checkout lists them. */
export const enabledPaymentProviders = (): PaymentProvider[] => [
	...(env.STRIPE_SECRET_KEY ? (["STRIPE"] as const) : []),
	...(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET ? (["PAYPAL"] as const) : []),
]
