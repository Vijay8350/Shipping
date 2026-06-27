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
      detail="Shipping Management"
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
          width: 140,
          topBarSource: undefined,
          accessibilityLabel: "Shipping Management",
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
