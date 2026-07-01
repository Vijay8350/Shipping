import prisma from "../db.server";

/**
 * Automation rules management (CLAUDE.md §8 AutomationRule). This is the CRUD/management
 * layer used by the Automation Rules screen. Rule EXECUTION (auto-assign courier /
 * auto-ship on order events) is applied by the worker where noted — see applyAutomation.
 */

export type AutomationTrigger = "order_created" | "order_paid";
export type AutomationActionType = "assign_courier" | "auto_ship";

export interface RuleAction {
  type: AutomationActionType;
  courierKey?: string;
  cod?: boolean;
  weightGrams?: number;
}

async function getShopId(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  if (!shop) throw new Error(`No Shop row for ${shopDomain}`);
  return shop.id;
}

export async function listRules(shopDomain: string) {
  const shopId = await getShopId(shopDomain);
  return prisma.automationRule.findMany({
    where: { shopId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

export async function createRule(
  shopDomain: string,
  input: { trigger: AutomationTrigger; action: RuleAction; enabled?: boolean },
) {
  const shopId = await getShopId(shopDomain);
  const count = await prisma.automationRule.count({ where: { shopId } });
  return prisma.automationRule.create({
    data: {
      shopId,
      trigger: input.trigger,
      conditions: {},
      action: input.action as object,
      enabled: input.enabled ?? true,
      priority: count,
    },
  });
}

export async function setRuleEnabled(shopDomain: string, id: string, enabled: boolean) {
  const shopId = await getShopId(shopDomain);
  await prisma.automationRule.updateMany({ where: { id, shopId }, data: { enabled } });
}

export async function deleteRule(shopDomain: string, id: string) {
  const shopId = await getShopId(shopDomain);
  await prisma.automationRule.deleteMany({ where: { id, shopId } });
}

/**
 * Apply enabled automation rules for a shop to a freshly-synced order. Called from the
 * order webhook processor. Auto-ship is intentionally conservative: it only runs when a
 * rule explicitly opts in, and it reuses the idempotent ship workflow (§9.1) so a repeat
 * never creates a duplicate AWB.
 */
export async function applyAutomation(
  shopDomain: string,
  orderId: string,
  trigger: AutomationTrigger,
): Promise<void> {
  const shopId = await getShopId(shopDomain);
  const rules = await prisma.automationRule.findMany({
    where: { shopId, enabled: true, trigger },
    orderBy: { priority: "asc" },
  });
  if (rules.length === 0) return;

  const { shipOrder } = await import("./shipping.server");
  for (const rule of rules) {
    const action = rule.action as unknown as RuleAction;
    if (action.type !== "auto_ship" || !action.courierKey) continue;
    try {
      await shipOrder(shopDomain, {
        orderId,
        courierKey: action.courierKey,
        weightGrams: action.weightGrams ?? 500,
        cod: action.cod ?? false,
      });
    } catch (err) {
      console.error(`[automation] rule ${rule.id} failed for order ${orderId}:`, (err as Error).message);
    }
  }
}
