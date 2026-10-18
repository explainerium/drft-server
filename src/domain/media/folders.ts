/**
 * Would moving `folderId` under `newParentId` create a cycle?
 *
 * Walks up from the new parent; reaching the folder itself means the move puts
 * a folder inside its own subtree. A loop already present in the data also
 * counts as a cycle, so a corrupt tree is never made worse.
 */
export const wouldCreateCycle = (
	folderId: string,
	newParentId: string | null,
	parentOf: ReadonlyMap<string, string | null>
): boolean => {
	const seen = new Set<string>()
	let current = newParentId

	while (current) {
		if (current === folderId || seen.has(current)) return true
		seen.add(current)
		current = parentOf.get(current) ?? null
	}

	return false
}
