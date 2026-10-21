import nodemailer, { type Transporter } from "nodemailer"
import { env } from "../../config"
import { logger } from "../../shared/logger"

export interface Mail {
	to: string
	subject: string
	text: string
	html?: string
}

let transporter: Transporter | undefined

const getTransporter = (): Transporter | undefined => {
	if (!env.SMTP_HOST) return undefined
	transporter ??= nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		secure: env.SMTP_PORT === 465,
		...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
	})
	return transporter
}

/**
 * Sends a mail, or logs it when SMTP is not configured (development).
 * Never throws: a mail that fails must not undo the action that triggered it.
 * Build the content with renderMail (./template) for the branded HTML version.
 */
export const sendMail = async (mail: Mail): Promise<void> => {
	const transport = getTransporter()

	if (!transport) {
		logger.info({ to: mail.to, subject: mail.subject }, `[mail not sent — no SMTP_HOST]\n${mail.text}`)
		return
	}

	try {
		await transport.sendMail({ from: env.MAIL_FROM, ...mail })
	} catch (err) {
		logger.error({ err, to: mail.to, subject: mail.subject }, "mail delivery failed")
	}
}
