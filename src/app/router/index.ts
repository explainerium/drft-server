import { Router } from "express"
import { AccountRoutes } from "../modules/account/account.routes"
import { AttributeRoutes } from "../modules/attribute/attribute.routes"
import { AuthRoutes } from "../modules/auth/auth.routes"
import { CategoryRoutes } from "../modules/category/category.routes"
import { MediaRoutes } from "../modules/media/media.routes"
import { ProductRoutes } from "../modules/product/product.routes"
import { SettingRoutes } from "../modules/setting/setting.routes"
import { UserRoutes } from "../modules/user/user.routes"

const router = Router()

/** Every module registers here under /api/v1. */
const moduleRoutes: { path: string; route: Router }[] = [
	{ path: "/auth", route: AuthRoutes },
	{ path: "/account", route: AccountRoutes },
	{ path: "/users", route: UserRoutes },
	{ path: "/categories", route: CategoryRoutes },
	{ path: "/attributes", route: AttributeRoutes },
	{ path: "/products", route: ProductRoutes },
	{ path: "/media", route: MediaRoutes },
	{ path: "/settings", route: SettingRoutes },
]

moduleRoutes.forEach(({ path, route }) => router.use(path, route))

export default router
