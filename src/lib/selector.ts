import { selectorMatches } from "./workloads";

/** Parse a label query like "app=frontend,tier=web" into a selector map. */
export function parseSelectorQuery(
  query: string,
): Record<string, string> | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const out: Record<string, string> = {};
  for (const pair of trimmed.split(",")) {
    const [k, ...rest] = pair.split("=");
    const key = k?.trim();
    if (!key) continue;
    out[key] = rest.join("=").trim();
  }
  return Object.keys(out).length ? out : null;
}

/** True when labels satisfy every key/value in the parsed query. */
export function labelsMatchQuery(
  labels: Record<string, string> | undefined,
  query: string,
): boolean {
  const parsed = parseSelectorQuery(query);
  if (!parsed) return true; // no active query → everything "matches"
  return selectorMatches(labels, parsed);
}
