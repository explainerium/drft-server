import { Prisma } from "@prisma/client"
import { maxQuantity } from "../../../domain/cart/cartRules"
import httpStatus from "../../../shared/httpStatus"
import { prisma } from "../../../shared/prisma"
import ApiError from "../../errors/ApiError"
import { cardSelect, toCard } from "../product/product.service"

const itemSelect = {
	id: true,
	createdAt: true,
	product: { select: cardSelect },
	variant: {
		select: {
			id: true,
			price: true,
			isActive: true,
			manageStock: true,
			stock: true,
			allowBackorder: true,
			attributeValues: {
				select: {
					attributeValue: { select: { label: true, attribute: { select: { name: true, sortOrder: true } } } },
				},
			},
		},
	},
} satisfies Prisma.WishlistItemSelect

type ItemRow = Prisma.WishlistItemGetPayload<{ select: typeof itemSelect }>

type VariantRow = NonNullable<ItemRow["variant"]>

const toItem = (row: ItemRow, onlyVariant?: VariantRow) => {
	// A product sold in one version needs no choice: that version stands in for a saved one.
	const variant = row.variant ?? onlyVariant ?? null
	return {
		id: row.id,
		createdAt: row.createdAt,
		product: toCard(row.product),
		// The saved size/colour, while it is still sold; it can be added to the cart directly.
		variant:
			variant && variant.isActive
				? {
						id: variant.id,
						price: variant.price.toFixed(2),
						available: maxQuantity(variant) > 0,
						options: variant.attributeValues
							.map(({ attributeValue: v }) => ({ name: v.attribute.name, value: v.label, sortOrder: v.attribute.sortOrder }))
							.sort((a, b) => a.sortOrder - b.sortOrder)
							.map(({ name, value }) => ({ name, value })),
					}
				: null,
	}
}

/** The customer's saved products, newest first. Unpublished products are hidden (and come back if republished). */
const list = async (userId: string) => {
	const rows = await prisma.wishlistItem.findMany({
		where: { userId, product: { status: "PUBLISHED" } },
		orderBy: { createdAt: "desc" },
		select: itemSelect,
	})

	const withoutVariant = rows.filter((r) => !r.variant).map((r) => r.product.id)
	const candidates = withoutVariant.length
		? await prisma.productVariant.findMany({
				where: { productId: { in: withoutVariant }, isActive: true },
				select: { ...itemSelect.variant.select, productId: true },
			})
		: []
	const byProduct = new Map<string, VariantRow[]>()
	for (const { productId, ...variant } of candidates) {
		byProduct.set(productId, [...(byProduct.get(productId) ?? []), variant])
	}

	return rows.map((row) => {
		const only = byProduct.get(row.product.id)
		return toItem(row, only?.length === 1 ? only[0] : undefined)
	})
}

/** Saves a product (again: updates the remembered variant). Answers with the whole list. */
const add = async (userId: string, input: { productId: string; variantId?: string | null }) => {
	const product = await prisma.product.findFirst({
		where: { id: input.productId, status: "PUBLISHED" },
		select: { id: true },
	})
	if (!product) throw new ApiError(httpStatus.NOT_FOUND, "This product is not available")

	if (input.variantId) {
		const variant = await prisma.productVariant.count({ where: { id: input.variantId, productId: product.id } })
		if (!variant) throw new ApiError(httpStatus.BAD_REQUEST, "This option does not belong to the product")
	}

	const variantId = input.variantId ?? null
	await prisma.wishlistItem.upsert({
		where: { userId_productId: { userId, productId: product.id } },
		create: { userId, productId: product.id, variantId },
		// Saving without a variant keeps the one remembered before.
		update: variantId ? { variantId } : {},
	})
	return list(userId)
}

const remove = async (userId: string, productId: string) => {
	// deleteMany: removing something already gone is not an error.
	await prisma.wishlistItem.deleteMany({ where: { userId, productId } })
	return list(userId)
}

export const WishlistService = { list, add, remove }
