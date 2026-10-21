import pino from "pino"
import { env } from "../config"

export const logger = pino({
	level: env.LOG_LEVEL,
	// pino-pretty is a dev dependency; it is never there on Vercel.
	...(env.NODE_ENV === "development" && !process.env.VERCEL
		? {
				transport: {
					target: "pino-pretty",
					options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname", singleLine: true },
				},
			}
		: {}),
})

export default logger
