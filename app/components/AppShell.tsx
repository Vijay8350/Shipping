import { useState, useCallback } from "react";
import { useLocation, useNavigate } from "@remix-run/react";
import {
  AppProvider,
  Frame,
  Navigation,
  TopBar,
  Text,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { NAVIGATION } from "../lib/navigation";

/** Inline SVG "JSY Logistics" wordmark (prototype branding) used as the Frame logo —
 *  avoids a broken <img> and needs no asset file. */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="30" viewBox="0 0 150 30"><text x="0" y="22" font-family="'Plus Jakarta Sans',system-ui,sans-serif" font-size="20" font-weight="800" fill="#3b4fe4">JSY</text><text x="48" y="22" font-family="'Plus Jakarta Sans',system-ui,sans-serif" font-size="14" font-weight="600" fill="#1a1a2e">Logistics</text></svg>`;
const LOGO_URI = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO_SVG)}`;

/**
 * Standalone Polaris shell rendered on OUR domain (CLAUDE.md §2: non-embedded —
 * this is NOT inside the Shopify admin iframe). Collapsible sidebar + top bar with
 * store name and logout. Reused by every authenticated page in later phases.
 */
export function AppShell({
  shop,
  children,
}: {
  shop: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileNavActive, setMobileNavActive] = useState(false);
  const [userMenuActive, setUserMenuActive] = useState(false);

  const toggleMobileNav = useCallback(
    () => setMobileNavActive((active) => !active),
    [],
  );
  const toggleUserMenu = useCallback(
    () => setUserMenuActive((active) => !active),
    [],
  );

  const navMarkup = (
    <Navigation location={location.pathname}>
      {NAVIGATION.map((section, i) => (
        <Navigation.Section
          key={section.title ?? `section-${i}`}
          title={section.title}
          items={section.items.map((item) => ({
            label: item.label,
            url: item.url,
            selected: location.pathname === item.url,
            disabled: item.url === "#",
            onClick:
              item.url === "#"
                ? undefined
                : () => navigate(item.url), // client-side nav within our standalone app
          }))}
        />
      ))}
    </Navigation>
  );

  const userMenuMarkup = (
    <TopBar.UserMenu
      actions={[
        {
          items: [
            {
              content: "Log out",
              onAction: () => navigate("/logout"),
            },
          ],
        },
      ]}
      name={shop}
      detail="JSY Logistics"
      initials={shop.slice(0, 1).toUpperCase()}
      open={userMenuActive}
      onToggle={toggleUserMenu}
    />
  );

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      userMenu={userMenuMarkup}
      onNavigationToggle={toggleMobileNav}
    />
  );

  return (
    <AppProvider i18n={enTranslations}>
      <Frame
        topBar={topBarMarkup}
        navigation={navMarkup}
        showMobileNavigation={mobileNavActive}
        onNavigationDismiss={toggleMobileNav}
        logo={{
          width: 150,
          topBarSource: LOGO_URI,
          accessibilityLabel: "JSY Logistics",
          url: "/dashboard",
        }}
      >
        {children}
      </Frame>
    </AppProvider>
  );
}

/** Minimal Polaris provider for unauthenticated pages (e.g. the login screen). */
export function PolarisOnly({ children }: { children: React.ReactNode }) {
  return <AppProvider i18n={enTranslations}>{children}</AppProvider>;
}

export { Text };
