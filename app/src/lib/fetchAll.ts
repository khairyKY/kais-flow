// PostgREST on Supabase returns at most 1000 rows per request and says nothing when it stops
// (audit H2): a user past 1000 tasks silently lost the tail of the sort — undated tasks first.
// Pages until a short page. The query must be ordered by something unique (end with `id`).
export const PAGE_SIZE = 1000

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  /** Called with the running total after each page (an export's "tasks 1,200"). */
  onPage?: (rows: number) => void,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    onPage?.(rows.length)
    if (!data || data.length < PAGE_SIZE) return rows
  }
}
