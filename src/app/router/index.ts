import { Router } from "express"

const router = Router()

/**
 * Every module registers here under /api/v1:
 *   { path: "/products", route: ProductRoutes },
 */
const moduleRoutes: { path: string; route: Router }[] = []

moduleRoutes.forEach(({ path, route }) => router.use(path, route))

export default router
