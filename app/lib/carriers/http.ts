import { CarrierError, type FetchImpl } from "./types";

/**
 * Thin fetch wrapper for adapters. Keeps request/response handling uniform and ensures
 * courier failures surface as CarrierError (never leaking credentials). Adapters pass
 * their injected fetch so tests can stub responses with fixtures.
 */
export async function httpJson<T = unknown>(
  fetchImpl: FetchImpl,
  courierKey: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    throw new CarrierError(
      `${courierKey}: network error calling courier API`,
      courierKey,
      undefined,
      (err as Error)?.message,
    );
  }

  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text; // some endpoints return non-JSON (e.g. raw PDF/HTML)
    }
  }

  if (!res.ok) {
    throw new CarrierError(
      `${courierKey}: courier API returned HTTP ${res.status}`,
      courierKey,
      res.status,
      body,
    );
  }

  return body as T;
}

export function resolveFetch(fetchImpl?: FetchImpl): FetchImpl {
  return fetchImpl ?? fetch;
}
