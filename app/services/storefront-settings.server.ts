import prisma from "../db.server";

/** Customer-experience settings (tracking page / EDD / returns). Returns defaults when
 *  no row exists so storefront routes always have a usable config. */

export interface StorefrontConfig {
  logoUrl: string | null;
  themeColor: string;
  customCss: string | null;
  dateFormat: string;
  trackingEnabled: boolean;
  eddEnabled: boolean;
  returnsEnabled: boolean;
  eddMinDays: number;
  eddMaxDays: number;
  supportEmail: string | null;
}

export const DEFAULT_CONFIG: StorefrontConfig = {
  logoUrl: null,
  themeColor: "#1a73e8",
  customCss: null,
  dateFormat: "DD MMM YYYY",
  trackingEnabled: true,
  eddEnabled: true,
  returnsEnabled: true,
  eddMinDays: 2,
  eddMaxDays: 7,
  supportEmail: null,
};

async function getShopId(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  if (!shop) throw new Error(`No Shop row for ${shopDomain}`);
  return shop.id;
}

export async function getStorefrontConfig(shopDomain: string): Promise<StorefrontConfig> {
  const shop = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { storefront: true },
  });
  const s = shop?.storefront;
  if (!s) return { ...DEFAULT_CONFIG };
  return {
    logoUrl: s.logoUrl,
    themeColor: s.themeColor,
    customCss: s.customCss,
    dateFormat: s.dateFormat,
    trackingEnabled: s.trackingEnabled,
    eddEnabled: s.eddEnabled,
    returnsEnabled: s.returnsEnabled,
    eddMinDays: s.eddMinDays,
    eddMaxDays: s.eddMaxDays,
    supportEmail: s.supportEmail,
  };
}

export async function upsertStorefrontConfig(
  shopDomain: string,
  data: Partial<StorefrontConfig>,
): Promise<void> {
  const shopId = await getShopId(shopDomain);
  await prisma.storefrontSettings.upsert({
    where: { shopId },
    create: { shopId, ...stripUndefined(data) },
    update: stripUndefined(data),
  });
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
