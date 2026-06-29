import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, defaultTemplate, renderTemplate } from "./templates";
import { NOTIFICATION_EVENTS } from "./types";

describe("notification templates (CLAUDE.md §9.6)", () => {
  it("renders {{variables}} and leaves unknown ones blank", () => {
    const out = renderTemplate("Hi {{customer_name}}, {{order_name}} via {{courier}}", {
      customer_name: "Asha",
      order_name: "#1001",
      courier: "Delhivery",
    });
    expect(out).toBe("Hi Asha, #1001 via Delhivery");
    expect(renderTemplate("AWB {{awb}}", {})).toBe("AWB ");
  });

  it("has email + sms defaults for every event", () => {
    for (const event of NOTIFICATION_EVENTS) {
      expect(DEFAULT_TEMPLATES[event].email.body).toBeTruthy();
      expect(DEFAULT_TEMPLATES[event].sms.body).toBeTruthy();
    }
  });

  it("exposes default enabled flags (templates gate firing)", () => {
    expect(defaultTemplate("ORDER_SHIPPED", "email").enabled).toBe(true);
    expect(defaultTemplate("RTO_INITIATED", "sms").enabled).toBe(false);
  });
});
