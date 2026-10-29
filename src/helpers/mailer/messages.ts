import { env } from "../../config"
import { DEFAULT_LOCALE, parseLocale, type Locale } from "../../domain/i18n/locale"
import type { MailContent } from "./template"

/**
 * The copy of every customer email, German (the store language) and English.
 * Each builder returns the template content for one mail; the caller adds `to`.
 */

type Content = Omit<MailContent, "to">

/** A storefront link in the mail's language: English pages live under /en. */
export const storeLink = (path: string, locale: Locale) =>
	`${env.PUBLIC_BASE_URL}${locale === DEFAULT_LOCALE ? "" : `/${locale}`}${path}`

/** The stored language of a user, order or subscriber, read safely. */
export const mailLocale = (value: string | null | undefined): Locale => parseLocale(value)

const hello = (locale: Locale, firstName?: string | null) =>
	locale === "de" ? `Hallo${firstName ? ` ${firstName}` : ""},` : `Hi${firstName ? ` ${firstName}` : ""},`

export const MailCopy = {
	verifyEmail: (locale: Locale, { firstName, url }: { firstName?: string | null; url: string }): Content =>
		locale === "de"
			? {
					locale,
					subject: "Bestätigen Sie Ihr DRFT-Konto",
					preheader: "Mit einem Klick Ihre E-Mail-Adresse bestätigen.",
					heading: `Willkommen bei DRFT${firstName ? `, ${firstName}` : ""}`,
					paragraphs: ["Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto fertig einzurichten."],
					action: { label: "E-Mail-Adresse bestätigen", url },
					after: ["Dieser Link ist 48 Stunden gültig."],
					footnote: "Sie erhalten diese E-Mail, weil mit dieser Adresse ein Konto im DRFT-Shop erstellt wurde.",
				}
			: {
					locale,
					subject: "Confirm your DRFT account",
					preheader: "One click to confirm your email address.",
					heading: `Welcome to DRFT${firstName ? `, ${firstName}` : ""}`,
					paragraphs: ["Confirm your email address to finish setting up your account."],
					action: { label: "Confirm email address", url },
					after: ["This link is valid for 48 hours."],
					footnote: "You get this email because an account was created with this address on the DRFT store.",
				},

	resetPassword: (locale: Locale, { url }: { url: string }): Content =>
		locale === "de"
			? {
					locale,
					subject: "DRFT-Passwort zurücksetzen",
					preheader: "Wählen Sie ein neues Passwort für Ihr Konto.",
					heading: "Passwort zurücksetzen",
					paragraphs: ["Für dieses Konto wurde das Zurücksetzen des Passworts angefordert."],
					action: { label: "Neues Passwort wählen", url },
					after: [
						"Dieser Link ist 1 Stunde gültig. Wenn Sie das nicht waren, ignorieren Sie diese E-Mail: Ihr Passwort bleibt unverändert.",
					],
				}
			: {
					locale,
					subject: "Reset your DRFT password",
					preheader: "Choose a new password for your account.",
					heading: "Reset your password",
					paragraphs: ["Someone asked to reset the password for this account."],
					action: { label: "Choose a new password", url },
					after: ["This link is valid for 1 hour. If this wasn't you, ignore this email: your password stays the same."],
				},

	orderShipped: (
		locale: Locale,
		o: {
			label: string
			firstName?: string | null
			carrier?: string | null
			trackingNumber?: string | null
			trackingUrl?: string | null
			orderUrl?: string | null
		}
	): Content => {
		const de = locale === "de"
		const action = o.trackingUrl
			? { label: de ? "Sendung verfolgen" : "Track your parcel", url: o.trackingUrl }
			: o.orderUrl
				? { label: de ? "Bestellung ansehen" : "View your order", url: o.orderUrl }
				: undefined
		return {
			locale,
			subject: de ? `Ihre DRFT-Bestellung ${o.label} ist unterwegs` : `Your DRFT order ${o.label} is on its way`,
			preheader: de ? `Bestellung ${o.label} hat unser Lager verlassen.` : `Order ${o.label} has left our warehouse.`,
			heading: de ? "Ihre Bestellung ist unterwegs" : "Your order is on its way",
			paragraphs: [hello(locale, o.firstName), de ? `Bestellung ${o.label} wurde versandt.` : `Order ${o.label} has shipped.`],
			details: [
				{ label: de ? "Bestellung" : "Order", value: o.label },
				...(o.carrier ? [{ label: de ? "Versanddienst" : "Carrier", value: o.carrier }] : []),
				...(o.trackingNumber ? [{ label: de ? "Sendungsnummer" : "Tracking number", value: o.trackingNumber }] : []),
			],
			action,
			after: o.trackingUrl && o.orderUrl ? [`${de ? "Bestelldetails" : "Order details"}: ${o.orderUrl}`] : [],
		}
	},

	orderCancelled: (locale: Locale, o: { label: string; firstName?: string | null }): Content => {
		const de = locale === "de"
		return {
			locale,
			subject: de ? `Ihre DRFT-Bestellung ${o.label} wurde storniert` : `Your DRFT order ${o.label} was cancelled`,
			heading: de ? "Ihre Bestellung wurde storniert" : "Your order was cancelled",
			paragraphs: [
				hello(locale, o.firstName),
				de
					? `Bestellung ${o.label} wurde vor der Zahlung storniert. Es wurde nichts berechnet.`
					: `Order ${o.label} was cancelled before payment. Nothing was charged.`,
			],
			details: [{ label: de ? "Bestellung" : "Order", value: o.label }],
		}
	},

	newsletterConfirm: (locale: Locale, { url }: { url: string }): Content =>
		locale === "de"
			? {
					locale,
					subject: "Bestätigen Sie Ihre DRFT-Newsletter-Anmeldung",
					preheader: "Mit einem Klick zum DRFT-Newsletter.",
					heading: "Anmeldung bestätigen",
					paragraphs: ["Bitte bestätigen Sie, dass Sie Neuigkeiten und neue Produkte von DRFT per E-Mail erhalten möchten."],
					action: { label: "Ja, ich möchte den Newsletter", url },
					after: ["Wenn Sie sich nicht angemeldet haben, ignorieren Sie diese E-Mail. Sie erhalten dann nichts von uns."],
				}
			: {
					locale,
					subject: "Confirm your DRFT newsletter subscription",
					preheader: "One click to start getting the DRFT newsletter.",
					heading: "Confirm your subscription",
					paragraphs: ["Confirm that you want news and new products from DRFT by email."],
					action: { label: "Yes, subscribe me", url },
					after: ["If you did not sign up, ignore this email and nothing will be sent."],
				},

	newsletterWelcome: (locale: Locale, { unsubscribeUrl }: { unsubscribeUrl: string }): Content =>
		locale === "de"
			? {
					locale,
					subject: "Sie sind beim DRFT-Newsletter dabei",
					heading: "Anmeldung bestätigt",
					paragraphs: ["Vielen Dank für Ihre Bestätigung. Wir melden uns, wenn es etwas Neues gibt."],
					footnote: `Sie erhalten den DRFT-Newsletter, weil Sie sich angemeldet haben. Abmelden jederzeit: ${unsubscribeUrl}`,
				}
			: {
					locale,
					subject: "You're on the DRFT list",
					heading: "You're subscribed",
					paragraphs: ["Thanks for confirming. You'll hear from us when there is something new."],
					footnote: `You get DRFT newsletters because you signed up. Unsubscribe any time: ${unsubscribeUrl}`,
				},
}
