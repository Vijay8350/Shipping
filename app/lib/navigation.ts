/**
 * Sidebar navigation groups for the merchant dashboard (CLAUDE.md §1 + the 16 modules
 * in the spec / FULL-APP-MASTER-PROMPT). Routes are placeholders in Phase 0 — most
 * point at "#" until their feature phase builds them. Keep this as the single source
 * of nav structure so later phases just flip a url.
 */
export interface NavItem {
  label: string;
  url: string;
  /** Phase that builds the real screen (for our own tracking, not shown to users). */
  phase: number;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    items: [{ label: "Dashboard", url: "/dashboard", phase: 0 }],
  },
  {
    title: "Fulfilment",
    items: [
      { label: "All Orders", url: "/orders", phase: 1 },
      { label: "Shipping / AWB", url: "#", phase: 2 },
      { label: "Order Tracking", url: "#", phase: 3 },
      { label: "Pickup Requests", url: "#", phase: 3 },
      { label: "Automation Rules", url: "#", phase: 3 },
    ],
  },
  {
    title: "Post-purchase",
    items: [
      { label: "NDR", url: "#", phase: 4 },
      { label: "RTO", url: "#", phase: 4 },
      { label: "Returns", url: "#", phase: 4 },
    ],
  },
  {
    title: "Customer experience",
    items: [
      { label: "Tracking Page", url: "#", phase: 5 },
      { label: "Estimated Delivery (EDD)", url: "#", phase: 5 },
      { label: "Return Page", url: "#", phase: 5 },
    ],
  },
  {
    title: "Configuration",
    items: [
      { label: "Logistics Config", url: "/logistics", phase: 2 },
      { label: "Notifications", url: "#", phase: 4 },
      { label: "Billing & Plans", url: "#", phase: 6 },
      { label: "Settings", url: "#", phase: 6 },
    ],
  },
];
