import { Router } from "express"
import { AccountRoutes } from "../modules/account/account.routes"
import { AttributeRoutes } from "../modules/attribute/attribute.routes"
import { AuthRoutes } from "../modules/auth/auth.routes"
import { CartRoutes } from "../modules/cart/cart.routes"
import { CategoryRoutes } from "../modules/category/category.routes"
import { CheckoutRoutes } from "../modules/checkout/checkout.routes"
import { CronRoutes } from "../modules/cron/cron.routes"
import { DashboardRoutes } from "../modules/dashboard/dashboard.routes"
import { MediaRoutes } from "../modules/media/media.routes"
import { OrderRoutes } from "../modules/order/order.routes"
import { ProductRoutes } from "../modules/product/product.routes"
import { SettingRoutes } from "../modules/setting/setting.routes"
import { UserRoutes } from "../modules/user/user.routes"
import { WishlistRoutes } from "../modules/wishlist/wishlist.routes"

const router = Router()

/** Every module registers here under /api/v1. */
const moduleRoutes: { path: string; route: Router }[] = [
	{ path: "/auth", route: AuthRoutes },
	{ path: "/account", route: AccountRoutes },
	{ path: "/users", route: UserRoutes },
	{ path: "/categories", route: CategoryRoutes },
	{ path: "/attributes", route: AttributeRoutes },
	{ path: "/products", route: ProductRoutes },
	{ path: "/cart", route: CartRoutes },
	{ path: "/checkout", route: CheckoutRoutes },
	{ path: "/orders", route: OrderRoutes },
	{ path: "/wishlist", route: WishlistRoutes },
	{ path: "/media", route: MediaRoutes },
	{ path: "/settings", route: SettingRoutes },
	{ path: "/dashboard", route: DashboardRoutes },
	{ path: "/cron", route: CronRoutes },
]

moduleRoutes.forEach(({ path, route }) => router.use(path, route))

export default router
