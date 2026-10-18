import cookieParser from "cookie-parser"
import cors from "cors"
import express, { type Application, type Request, type Response } from "express"
import helmet from "helmet"
import pinoHttp from "pino-http"
import { env } from "./config"
import globalErrorHandler from "./app/middlewares/globalErrorHandler"
import notFound from "./app/middlewares/notFound"
import { serveLocalMedia } from "./app/modules/media/media.serve"
import router from "./app/router"
import httpStatus from "./shared/httpStatus"
import { logger } from "./shared/logger"

const app: Application = express()

/**
 * In production the API is reached through the Next.js rewrite on the main
 * domain, so there is exactly one proxy hop. `1`, not `true`: trusting the whole
 * chain lets a client spoof X-Forwarded-For and dodge rate limits.
 */
app.set("trust proxy", 1)

const ALLOWED_ORIGINS = env.CORS_ORIGINS.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean)

/** Production is same-origin and needs no CORS; this is for local development. */
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

app.use(helmet())
app.use(
	cors({
		origin: (origin, callback) =>
			callback(
				null,
				!origin || ALLOWED_ORIGINS.includes(origin) || (env.NODE_ENV !== "production" && LOCALHOST.test(origin))
			),
		credentials: true,
	})
)

// Payment webhooks need the raw body for signature checks — mount them here,
// before express.json(), when the payment module lands.

app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(pinoHttp({ logger }))

app.get("/health", (_req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		statusCode: httpStatus.OK,
		message: "DRFT API is running",
		data: {
			env: env.NODE_ENV,
			commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
			uptime: Math.round(process.uptime()),
		},
	})
})

// Locally stored media (STORAGE_DRIVER=local). With R2, files are served by
// Cloudflare and this passes through to notFound.
app.use("/media", serveLocalMedia)

app.use("/api/v1", router)

app.use(notFound)
app.use(globalErrorHandler)

export default app
