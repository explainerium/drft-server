import crypto from "crypto"
import { Prisma } from "@prisma/client"
import { maxQuantity, mergeLines, summarizeCart } from "../../../domain/cart/cartRules"
import { toCents } from "../../../domain/catalog/variantRules"
import { localize } from "../../../domain/i18n/locale"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import { currentLocale } from "../../../shared/requestContext"
import ApiError from "../../errors/ApiError"
import { assetSelect, toImageOrNull } from "../media/media.view"
import { optionOf } from "../product/product.service"
import { parseStoredGroup } from "../setting/setting.registry"

/** Who is asking: the signed-in customer, the guest cart cookie, or both (just signed in). */
export interface CartContext {
	userId?: string
	token?: string
}

/** What the controller should do with the guest cart cookie. */
export type CartCookie = { set: string } | { clear: true } | null

const RECOMMENDATION_COUNT = 2

const newToken = () => crypto.randomBytes(24).toString("base64url")

// ── Finding the cart ─────────────────────────────────────────────────────────

/** Moves the guest cart's lines into the customer's cart (or hands the guest cart over) and drops it. */
const mergeGuestCart = async (guestId: string, userId: string): Promise<string> =>
	prisma.$transaction(async (tx) => {
		const guest = await tx.cart.findUniqueOrThrow({
			where: { id: guestId },
			select: { items: { select: { variantId: true, quantity: true } } },
		})
		const own = await tx.cart.findUnique({
			where: { userId },
			select: { id: true, items: { select: { variantId: true, quantity: true } } },
		})

		if (!own) {
			await tx.cart.update({ where: { id: guestId }, data: { token: null, userId } })
			return guestId
		}

		for (const line of mergeLines(own.items, guest.items)) {
			await tx.cartItem.upsert({
				where: { cartId_variantId: { cartId: own.id, variantId: line.variantId } },
				create: { cartId: own.id, ...line },
				update: { quantity: line.quantity },
			})
		}
		await tx.cart.delete({ where: { id: guestId } })
		return own.id
	})

/**
 * The cart for this request. `create` makes one when there is none (adding an
 * item); reads never create rows. A guest cart met by a signed-in customer is
 * merged into theirs, and its cookie is cleared.
 */
const resolve = async (ctx: CartContext, create: boolean): Promise<{ cartId: string | null; cookie: CartCookie }> => {
	const guest = ctx.token
		? await prisma.cart.findUnique({ where: { token: ctx.token }, select: { id: true } })
		: null

	if (ctx.userId) {
		if (guest) return { cartId: await mergeGuestCart(guest.id, ctx.userId), cookie: { clear: true } }

		const stale: CartCookie = ctx.token ? { clear: true } : null
		const own = await prisma.cart.findUnique({ where: { userId: ctx.userId }, select: { id: true } })
		if (own || !create) return { cartId: own?.id ?? null, cookie: stale }
		// upsert: two first adds in parallel must not both create a cart.
		const created = await prisma.cart.upsert({
			where: { userId: ctx.userId },
			create: { userId: ctx.userId },
			update: {},
			select: { id: true },
		})
		return { cartId: created.id, cookie: stale }
	}

	if (guest) return { cartId: guest.id, cookie: null }
	// A cookie for a cart that no longer exists (cleaned up) is dropped.
	if (!create) return { cartId: null, cookie: ctx.token ? { clear: true } : null }

	const token = newToken()
	const created = await prisma.cart.create({ data: { token }, select: { id: true } })
	return { cartId: created.id, cookie: { set: token } }
}

// ── View ─────────────────────────────────────────────────────────────────────

const itemSelect = {
	id: true,
	quantity: true,
	variant: {
		select: {
			id: true,
			sku: true,
			price: true,
			compareAtPrice: true,
			manageStock: true,
			stock: true,
			allowBackorder: true,
			isActive: true,
			image: { select: assetSelect },
			attributeValues: {
				select: {
					attributeValue: {
						select: { label: true, translations: true, attribute: { select: { name: true, sortOrder: true, translations: true } } },
					},
				},
			},
			product: {
				select: {
					id: true,
					name: true,
					slug: true,
					status: true,
					typeLabel: true,
					translations: true,
					featuredAsset: { select: assetSelect },
					images: { orderBy: { sortOrder: "asc" }, take: 1, select: { asset: { select: assetSelect } } },
				},
			},
		},
	},
} satisfies Prisma.CartItemSelect

type ItemRow = Prisma.CartItemGetPayload<{ select: typeof itemSelect }>

const toLine = (row: ItemRow) => {
	const { variant } = row
	const { product } = variant
	const limit = maxQuantity(variant)
	const unitPrice = variant.price.toFixed(2)
	return {
		id: row.id,
		quantity: row.quantity,
		maxQuantity: limit,
		isAvailable: product.status === "PUBLISHED" && variant.isActive && limit > 0,
		variantId: variant.id,
		sku: variant.sku,
		unitPrice,
		compareAtPrice: variant.compareAtPrice ? variant.compareAtPrice.toFixed(2) : null,
		lineTotal: ((toCents(unitPrice) * row.quantity) / 100).toFixed(2),
		// "Kite Size: 9m²", "Colorway: Storm Graphite", in attribute order.
		options: variant.attributeValues
			.map(({ attributeValue: v }) => optionOf(v))
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map(({ name, value }) => ({ name, value })),
		product: {
			id: product.id,
			slug: product.slug,
			...localize({ name: product.name, typeLabel: product.typeLabel }, product.translations, currentLocale(), [
				"name",
				"typeLabel",
			]),
		},
		image: toImageOrNull(variant.image ?? product.featuredAsset ?? product.images[0]?.asset),
	}
}

/** "Curated for your setup": related products of what is in the cart, not already in it. */
const recommendationsFor = async (productIds: string[]) => {
	if (productIds.length === 0) return []
	const links = await prisma.relatedProduct.findMany({
		where: { productId: { in: productIds }, relatedId: { notIn: productIds }, related: { status: "PUBLISHED" } },
		orderBy: [{ sortOrder: "asc" }],
		select: {
			related: {
				select: {
					id: true,
					name: true,
					slug: true,
					typeLabel: true,
					translations: true,
					featuredAsset: { select: assetSelect },
					variants: {
						where: { isActive: true },
						orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
						select: { id: true, price: true, manageStock: true, stock: true, allowBackorder: true },
					},
				},
			},
		},
	})

	const seen = new Set<string>()
	const picks = []
	for (const { related: p } of links) {
		if (seen.has(p.id) || p.variants.length === 0) continue
		seen.add(p.id)
		const prices = p.variants.map((v) => v.price.toFixed(2)).sort((a, b) => toCents(a) - toCents(b))
		const only = p.variants.length === 1 ? p.variants[0]! : null
		picks.push({
			id: p.id,
			slug: p.slug,
			...localize({ name: p.name, typeLabel: p.typeLabel }, p.translations, currentLocale(), ["name", "typeLabel"]),
			image: toImageOrNull(p.featuredAsset),
			price: { min: prices[0]!, max: prices[prices.length - 1]! },
			// Set when the product has a single variant, so it can be added straight from the cart.
			variantId: only && maxQuantity(only) > 0 ? only.id : null,
		})
		if (picks.length === RECOMMENDATION_COUNT) break
	}
	return picks
}

/** Free shipping threshold and the estimate VAT rate, from settings. */
export const cartPricing = async () => {
	const rows = await prisma.setting.findMany({ where: { key: { in: ["shipping", "tax"] } } })
	const stored = new Map(rows.map((row) => [row.key, row.value]))
	return {
		freeShippingThreshold: parseStoredGroup("shipping", stored.get("shipping")).freeShippingThreshold,
		vatRate: parseStoredGroup("tax", stored.get("tax")).defaultVatRate,
	}
}

const view = async (cartId: string | null) => {
	const rows = cartId
		? await prisma.cartItem.findMany({ where: { cartId }, orderBy: { createdAt: "asc" }, select: itemSelect })
		: []
	const items = rows.map(toLine)
	const [recommendations, pricing] = await Promise.all([
		recommendationsFor([...new Set(items.map((i) => i.product.id))]),
		cartPricing(),
	])
	return { items, recommendations, summary: summarizeCart(items, pricing) }
}

// ── Actions ──────────────────────────────────────────────────────────────────

const limitError = (limit: number) =>
	new ApiError(
		httpStatus.CONFLICT,
		limit === 0 ? "This item is sold out" : `Only ${limit} of this item can be in your cart`
	)

const get = async (ctx: CartContext) => {
	const { cartId, cookie } = await resolve(ctx, false)
	return { cart: await view(cartId), cookie }
}

const addItem = async (ctx: CartContext, input: { variantId: string; quantity: number }) => {
	const variant = await prisma.productVariant.findFirst({
		where: { id: input.variantId, isActive: true, product: { status: "PUBLISHED" } },
		select: { id: true, manageStock: true, stock: true, allowBackorder: true },
	})
	if (!variant) throw new ApiError(httpStatus.NOT_FOUND, "This product is not available")

	const { cartId, cookie } = await resolve(ctx, true)
	const id = cartId!
	const existing = await prisma.cartItem.findUnique({
		where: { cartId_variantId: { cartId: id, variantId: variant.id } },
		select: { quantity: true },
	})
	const limit = maxQuantity(variant)
	const quantity = (existing?.quantity ?? 0) + input.quantity
	if (quantity > limit) throw limitError(limit)

	await prisma.cartItem.upsert({
		where: { cartId_variantId: { cartId: id, variantId: variant.id } },
		create: { cartId: id, variantId: variant.id, quantity },
		update: { quantity },
	})
	await prisma.cart.update({ where: { id }, data: { updatedAt: new Date() } })
	return { cart: await view(id), cookie }
}

/** The line, only if it is in this request's cart. */
const ownLine = async (ctx: CartContext, itemId: string) => {
	const { cartId, cookie } = await resolve(ctx, false)
	const line = cartId
		? await prisma.cartItem.findFirst({
				where: { id: itemId, cartId },
				select: { id: true, variant: { select: { manageStock: true, stock: true, allowBackorder: true } } },
			})
		: null
	if (!line) throw new ApiError(httpStatus.NOT_FOUND, "This item is not in your cart")
	return { cartId: cartId!, line, cookie }
}

const updateItem = async (ctx: CartContext, itemId: string, quantity: number) => {
	const { cartId, line, cookie } = await ownLine(ctx, itemId)
	const limit = maxQuantity(line.variant)
	if (quantity > limit) throw limitError(limit)
	await prisma.cartItem.update({ where: { id: line.id }, data: { quantity } })
	return { cart: await view(cartId), cookie }
}

const removeItem = async (ctx: CartContext, itemId: string) => {
	const { cartId, line, cookie } = await ownLine(ctx, itemId)
	await prisma.cartItem.delete({ where: { id: line.id } })
	return { cart: await view(cartId), cookie }
}

/** The cart's lines for checkout (no recommendations). Never creates a cart. */
const lines = async (ctx: CartContext) => {
	const { cartId, cookie } = await resolve(ctx, false)
	const rows = cartId
		? await prisma.cartItem.findMany({ where: { cartId }, orderBy: { createdAt: "asc" }, select: itemSelect })
		: []
	return { cartId, cookie, items: rows.map(toLine) }
}

export type CartLine = ReturnType<typeof toLine>

export const CartService = { get, addItem, updateItem, removeItem, lines }
