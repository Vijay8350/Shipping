import { describe, expect, it } from "vitest";
import {
  mapGraphqlOrder,
  mapRestOrder,
  toMinorUnits,
  toOrderGid,
} from "./order-mapper";

describe("order-mapper", () => {
  it("converts decimal money strings to integer minor units", () => {
    expect(toMinorUnits("1234.50")).toBe(123450);
    expect(toMinorUnits("0.99")).toBe(99);
    expect(toMinorUnits(null)).toBe(0);
    expect(toMinorUnits("not-a-number")).toBe(0);
  });

  it("normalizes ids to order GIDs", () => {
    expect(toOrderGid(450789469)).toBe("gid://shopify/Order/450789469");
    expect(toOrderGid("gid://shopify/Order/1")).toBe("gid://shopify/Order/1");
  });

  it("maps a REST/webhook order payload", () => {
    const data = mapRestOrder({
      id: 1001,
      name: "#1001",
      email: "buyer@example.com",
      financial_status: "paid",
      fulfillment_status: null,
      total_price: "499.00",
      currency: "INR",
      tags: "vip, prepaid",
      created_at: "2026-06-01T10:00:00Z",
      line_items: [{ quantity: 2 }, { quantity: 1 }],
      customer: { first_name: "Asha", last_name: "Rao" },
      shipping_address: { city: "Pune", province: "MH", zip: "411001", country: "India" },
    });

    expect(data.shopifyId).toBe("gid://shopify/Order/1001");
    expect(data.totalPrice).toBe(49900);
    expect(data.customerName).toBe("Asha Rao");
    expect(data.fulfillmentStatus).toBe("unfulfilled"); // null -> default
    expect(data.lineItemsCount).toBe(3);
    expect(data.shippingCity).toBe("Pune");
    expect(data.shopifyCreatedAt).toBeInstanceOf(Date);
  });

  it("maps a GraphQL order node", () => {
    const data = mapGraphqlOrder({
      id: "gid://shopify/Order/2002",
      name: "#2002",
      email: null,
      displayFinancialStatus: "PAID",
      displayFulfillmentStatus: "FULFILLED",
      currentTotalPriceSet: { shopMoney: { amount: "1200.00", currencyCode: "INR" } },
      subtotalLineItemsQuantity: 4,
      tags: ["cod"],
      customer: { firstName: "Ravi", lastName: null },
      shippingAddress: { city: "Delhi" },
    });

    expect(data.shopifyId).toBe("gid://shopify/Order/2002");
    expect(data.financialStatus).toBe("paid");
    expect(data.fulfillmentStatus).toBe("fulfilled");
    expect(data.totalPrice).toBe(120000);
    expect(data.lineItemsCount).toBe(4);
    expect(data.customerName).toBe("Ravi");
    expect(data.tags).toBe("cod");
  });
});
