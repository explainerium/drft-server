/**
 * Pure helpers for the category tree. The service loads the flat list once
 * (categories are a short list) and these work on it in memory.
 */
export interface CategoryNode {
	id: string
	parentId: string | null
}

export interface SortableCategoryNode extends CategoryNode {
	sortOrder: number
	name: string
}

export type TreeNode<T> = T & { children: TreeNode<T>[] }

const parentMap = (nodes: Iterable<CategoryNode>): Map<string, string | null> => {
	const map = new Map<string, string | null>()
	for (const n of nodes) map.set(n.id, n.parentId)
	return map
}

/**
 * Would putting `id` under `newParentId` make a category its own ancestor?
 * Walks up from the new parent; meeting `id` on the way means a loop.
 * Data that is already looped (should never happen) also counts as a cycle.
 */
export const wouldCreateCycle = (id: string, newParentId: string | null, nodes: Iterable<CategoryNode>): boolean => {
	if (!newParentId) return false
	const parentOf = parentMap(nodes)
	const seen = new Set<string>()
	let cursor: string | null = newParentId
	while (cursor) {
		if (cursor === id || seen.has(cursor)) return true
		seen.add(cursor)
		cursor = parentOf.get(cursor) ?? null
	}
	return false
}

/** The category and everything below it. Empty when `rootId` is not in `nodes`. */
export const descendantIds = (rootId: string, nodes: Iterable<CategoryNode>): string[] => {
	const list = [...nodes]
	if (!list.some((n) => n.id === rootId)) return []

	const childrenOf = new Map<string, string[]>()
	for (const n of list) {
		if (!n.parentId) continue
		const siblings = childrenOf.get(n.parentId) ?? []
		siblings.push(n.id)
		childrenOf.set(n.parentId, siblings)
	}

	const result: string[] = []
	const seen = new Set<string>()
	const queue = [rootId]
	while (queue.length) {
		const current = queue.shift()!
		if (seen.has(current)) continue
		seen.add(current)
		result.push(current)
		queue.push(...(childrenOf.get(current) ?? []))
	}
	return result
}

/** Ancestors of `id`, root first, without the category itself. For breadcrumbs. */
export const ancestorsOf = <T extends CategoryNode>(id: string, nodes: T[]): T[] => {
	const byId = new Map(nodes.map((n) => [n.id, n]))
	const trail: T[] = []
	const seen = new Set<string>([id])
	let cursor = byId.get(id)?.parentId ?? null
	while (cursor && !seen.has(cursor)) {
		seen.add(cursor)
		const node = byId.get(cursor)
		if (!node) break
		trail.unshift(node)
		cursor = node.parentId
	}
	return trail
}

const compareNodes = (a: SortableCategoryNode, b: SortableCategoryNode): number =>
	a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)

/**
 * Nested tree, each level sorted by sortOrder then name.
 *
 * Only nodes reachable from a root (parentId null) are kept. When the caller
 * has filtered out hidden categories, their subtrees disappear with them —
 * a visible child of a hidden parent must not pop up as a new root.
 */
export const buildTree = <T extends SortableCategoryNode>(nodes: T[]): TreeNode<T>[] => {
	const childrenOf = new Map<string | null, T[]>()
	for (const n of nodes) {
		const siblings = childrenOf.get(n.parentId) ?? []
		siblings.push(n)
		childrenOf.set(n.parentId, siblings)
	}

	const seen = new Set<string>()
	const build = (parentId: string | null): TreeNode<T>[] =>
		[...(childrenOf.get(parentId) ?? [])]
			.filter((n) => !seen.has(n.id))
			.sort(compareNodes)
			.map((n) => {
				seen.add(n.id)
				return { ...n, children: build(n.id) }
			})

	return build(null)
}

/** Depth-first search of a built tree. */
export const findInTree = <T>(tree: TreeNode<T>[], match: (node: TreeNode<T>) => boolean): TreeNode<T> | undefined => {
	for (const node of tree) {
		if (match(node)) return node
		const found = findInTree(node.children, match)
		if (found) return found
	}
	return undefined
}
