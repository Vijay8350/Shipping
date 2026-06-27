import prisma from "../db.server";
import { decrypt, encrypt } from "../lib/crypto.server";
import { createAdapter } from "../lib/carriers/registry";
import type { AdapterContext, CarrierAdapter } from "../lib/carriers/types";

/**
 * CourierAccount management (CLAUDE.md §7, §9.3). Credentials are an encrypted JSON blob
 * at rest; they are decrypted ONLY here, in memory, when constructing an adapter — never
 * logged, never returned to the client.
 */

export interface CourierAccountView {
  id: string;
  courierKey: string;
  testMode: boolean;
  enabled: boolean;
  /** Which credential field names are set (NOT their values). */
  configuredFields: string[];
  updatedAt: string;
}

async function getShopId(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { id: true },
  });
  if (!shop) throw new Error(`No Shop row for ${shopDomain}`);
  return shop.id;
}

/** Safe view of connected couriers for the UI — secrets are never included. */
export async function listCourierAccounts(
  shopDomain: string,
): Promise<CourierAccountView[]> {
  const shopId = await getShopId(shopDomain);
  const accounts = await prisma.courierAccount.findMany({
    where: { shopId },
    orderBy: { courierKey: "asc" },
  });
  return accounts.map((a) => {
    let configuredFields: string[] = [];
    try {
      configuredFields = Object.keys(JSON.parse(decrypt(a.credentials)));
    } catch {
      configuredFields = [];
    }
    return {
      id: a.id,
      courierKey: a.courierKey,
      testMode: a.testMode,
      enabled: a.enabled,
      configuredFields,
      updatedAt: a.updatedAt.toISOString(),
    };
  });
}

/** Connect or update a courier. Credentials are encrypted before storage (§9.3). */
export async function upsertCourierAccount(
  shopDomain: string,
  courierKey: string,
  credentials: Record<string, unknown>,
  opts: { testMode?: boolean; enabled?: boolean } = {},
): Promise<void> {
  const shopId = await getShopId(shopDomain);
  const encrypted = encrypt(JSON.stringify(credentials));
  await prisma.courierAccount.upsert({
    where: { shopId_courierKey: { shopId, courierKey } },
    create: {
      shopId,
      courierKey,
      credentials: encrypted,
      testMode: opts.testMode ?? true,
      enabled: opts.enabled ?? true,
    },
    update: {
      credentials: encrypted,
      ...(opts.testMode !== undefined ? { testMode: opts.testMode } : {}),
      ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
    },
  });
}

export async function setCourierFlags(
  shopDomain: string,
  courierKey: string,
  flags: { testMode?: boolean; enabled?: boolean },
): Promise<void> {
  const shopId = await getShopId(shopDomain);
  await prisma.courierAccount.update({
    where: { shopId_courierKey: { shopId, courierKey } },
    data: flags,
  });
}

/**
 * Build a ready-to-use adapter for a shop's courier (CLAUDE.md §7). Decrypts credentials
 * and honors the per-merchant test-mode toggle. Throws if the courier isn't connected or
 * is disabled.
 */
export async function getAdapterForShop(
  shopDomain: string,
  courierKey: string,
  fetchImpl?: AdapterContext["fetchImpl"],
): Promise<CarrierAdapter> {
  const shopId = await getShopId(shopDomain);
  const account = await prisma.courierAccount.findUnique({
    where: { shopId_courierKey: { shopId, courierKey } },
  });
  if (!account) throw new Error(`Courier ${courierKey} is not connected for ${shopDomain}`);
  if (!account.enabled) throw new Error(`Courier ${courierKey} is disabled for ${shopDomain}`);

  const credentials = JSON.parse(decrypt(account.credentials)) as Record<string, unknown>;
  return createAdapter(courierKey, {
    credentials,
    testMode: account.testMode,
    fetchImpl,
  });
}
