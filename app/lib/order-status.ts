/** Status badge tone mapping for the Orders screen (pure, shared). */
type BadgeTone = "success" | "attention" | "warning" | "critical" | "info" | undefined;

export function financialStatusTone(status: string | null): BadgeTone {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
    case "authorized":
      return "attention";
    case "partially_paid":
    case "partially_refunded":
      return "warning";
    case "refunded":
    case "voided":
      return "critical";
    default:
      return undefined;
  }
}

export function fulfillmentStatusTone(status: string | null): BadgeTone {
  switch (status) {
    case "fulfilled":
      return "success";
    case "partial":
    case "partially_fulfilled":
      return "warning";
    case "unfulfilled":
    case null:
      return "attention";
    default:
      return "info";
  }
}

export function formatMoney(minorUnits: number, currency: string): string {
  const major = (minorUnits / 100).toFixed(2);
  return `${currency} ${major}`;
}

/** Fulfillment-status tabs shown on the Orders screen. */
export const ORDER_TABS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "unfulfilled", label: "Unfulfilled" },
  { id: "partial", label: "Partial" },
  { id: "fulfilled", label: "Fulfilled" },
];
