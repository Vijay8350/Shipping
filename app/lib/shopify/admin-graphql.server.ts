import { ADMIN_API_VERSION } from "./api-version";

/**
 * Minimal GraphQL Admin API client over plain fetch (CLAUDE.md §10). Used by the WORKER
 * process, which has no Remix request context to call authenticate.admin(). The caller
 * passes the DECRYPTED offline access token — never log it.
 */
export class AdminGraphqlError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdminGraphqlError";
  }
}

export async function adminGraphql<T = unknown>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!res.ok) {
    throw new AdminGraphqlError(
      `Shopify Admin GraphQL HTTP ${res.status}`,
      res.status,
      await safeText(res),
    );
  }

  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    throw new AdminGraphqlError("Shopify Admin GraphQL returned errors", 200, json.errors);
  }
  return json.data as T;
}

async function safeText(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}
