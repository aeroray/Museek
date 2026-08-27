/** Song-categories domain — shared by local library and favorites. */

export type CategoryFilter = "all" | "none" | string

export type CategoryRecord = {
  id: string
  name: string
}

export type CatDialog =
  | { mode: "create" }
  | { mode: "rename"; id: string; name: string }
  | null

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

export function categoryNameMap(categories: CategoryRecord[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of categories) map.set(c.id, c.name)
  return map
}

export function labelForCategoryFilter(
  filter: CategoryFilter,
  names: Map<string, string>,
  labels: { all: string; none: string },
): string {
  if (filter === "all") return labels.all
  if (filter === "none") return labels.none
  return names.get(filter) ?? labels.all
}

export function filterByCategoryId<T>(
  items: T[],
  filter: CategoryFilter,
  getCategoryId: (item: T) => string | null | undefined,
): T[] {
  if (filter === "all") return items
  if (filter === "none") return items.filter((item) => !getCategoryId(item))
  return items.filter((item) => getCategoryId(item) === filter)
}

export function findActiveCategory(
  categories: CategoryRecord[],
  filter: CategoryFilter,
): CategoryRecord | undefined {
  if (filter === "all" || filter === "none") return undefined
  return categories.find((c) => c.id === filter)
}

/** Shared category of a selection: `null` = all uncategorized, `undefined` = mixed. */
export function sharedCategoryId(
  values: Array<string | null | undefined>,
): string | null | undefined {
  if (values.length === 0) return undefined
  const first = values[0] ?? null
  return values.every((value) => (value ?? null) === first) ? first : undefined
}
