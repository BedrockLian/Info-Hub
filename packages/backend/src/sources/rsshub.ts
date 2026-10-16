import { config } from "../config.ts";

/** Source definitions contain a route, never an origin, credential or URL override. */
export function rsshubRoute(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\s#]/.test(value)) throw new Error("RSSHub route must be a relative path starting with /");
  let decoded: string;
  try { decoded = decodeURIComponent(value.split("?")[0]!); }
  catch { throw new Error("RSSHub route has invalid encoding"); }
  if (decoded.startsWith("//") || decoded.includes("\\") || decoded.split("/").some((part) => part === "." || part === "..")) throw new Error("RSSHub route cannot escape its path");
  const url = new URL(value, "http://rsshub.invalid");
  if (url.origin !== "http://rsshub.invalid" || url.searchParams.has("key") || url.searchParams.has("code")) throw new Error("RSSHub route cannot override its origin or credentials");
  url.searchParams.sort();
  return url.pathname + url.search;
}

export function rsshubFeedUrl(value: unknown): string {
  const route = rsshubRoute(value);
  if (!config.rsshubBaseUrl) throw new Error("RSSHub is not configured on this server");
  return new URL(route, config.rsshubBaseUrl).toString();
}
