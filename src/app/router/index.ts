import { Router } from "express"
import { AccountRoutes } from "../modules/account/account.routes"
import { AttributeRoutes } from "../modules/attribute/attribute.routes"
import { AuthRoutes } from "../modules/auth/auth.routes"
import { CartRoutes } from "../modules/cart/cart.routes"
import { CategoryRoutes } from "../modules/category/category.routes"
import { CheckoutRoutes } from "../modules/checkout/checkout.routes"
import { ContactRoutes } from "../modules/contact/contact.routes"
import { CronRoutes } from "../modules/cron/cron.routes"
import { DashboardRoutes } from "../modules/dashboard/dashboard.routes"
import { FaqRoutes } from "../modules/faq/faq.routes"
import { MediaRoutes } from "../modules/media/media.routes"
import { NewsletterRoutes } from "../modules/newsletter/newsletter.routes"
import { OrderRoutes } from "../modules/order/order.routes"
import { PageRoutes } from "../modules/page/page.routes"
import { PostRoutes } from "../modules/post/post.routes"
import { ProductRoutes } from "../modules/product/product.routes"
import { SettingRoutes } from "../modules/setting/setting.routes"
import { ShippingRoutes } from "../modules/shipping/shipping.routes"
import { TaxRoutes } from "../modules/tax/tax.routes"
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
	{ path: "/pages", route: PageRoutes },
	{ path: "/posts", route: PostRoutes },
	{ path: "/faq", route: FaqRoutes },
	{ path: "/newsletter", route: NewsletterRoutes },
	{ path: "/contact", route: ContactRoutes },
	{ path: "/media", route: MediaRoutes },
	{ path: "/settings", route: SettingRoutes },
	{ path: "/shipping", route: ShippingRoutes },
	{ path: "/tax", route: TaxRoutes },
	{ path: "/dashboard", route: DashboardRoutes },
	{ path: "/cron", route: CronRoutes },
]

moduleRoutes.forEach(({ path, route }) => router.use(path, route))

export default router
