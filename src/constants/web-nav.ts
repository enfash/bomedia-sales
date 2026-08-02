import type Feather from '@expo/vector-icons/Feather';

/**
 * The web sidebar's destinations, in order.
 *
 * SOURCE OF TRUTH for BOTH web sidebars — `app-tabs.web.tsx` (the tabs shell)
 * and `web-detail-shell.web.tsx` (root-stack detail screens). They used to
 * disagree: the tabs shell hand-wrote its labels while the detail shell mapped
 * this list, so opening /cash silently renamed Home to "Dashboard", dropped the
 * divider and restyled the active row. The sidebar appeared to rearrange itself
 * mid-navigation.
 *
 * Now both read their label, icon and grouping from here, and both render the
 * shared `SidebarNavItem`, so the two cannot drift apart in appearance.
 *
 * What still cannot be shared is the *structure* of the tabs shell:
 * expo-router's TabList parser only recurses into Fragments and nested
 * TabLists, never other wrappers, so its `TabTrigger`s must stay literal,
 * hand-written children (PROJECT_STATUS.md §7) rather than a map over this
 * list. Adding a destination therefore still means adding it in both files —
 * `web-nav.test.ts` fails if you forget.
 */
export interface WebNavItem {
  href: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  adminOnly?: boolean;
  /** Draws the group separator after this item, in every sidebar. */
  dividerAfter?: boolean;
}

export const WEB_NAV: WebNavItem[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/quote', label: 'Quotes', icon: 'file-text' },
  { href: '/new-sales', label: 'New Sale', icon: 'plus-circle' },
  { href: '/records', label: 'Records', icon: 'archive', dividerAfter: true },
  { href: '/board', label: 'Production Board', icon: 'layout' },
  { href: '/clients', label: 'Clients', icon: 'users' },
  { href: '/expenses', label: 'Expenses', icon: 'dollar-sign' },
  { href: '/analytics', label: 'Analytics', icon: 'bar-chart-2', adminOnly: true },
  { href: '/settings', label: 'Settings', icon: 'settings', adminOnly: true },
  { href: '/cash', label: 'Daily Cash', icon: 'dollar-sign', adminOnly: true },
];

/** Lookup by route, so no sidebar has to restate a label or an icon. */
export function webNavItem(href: string): WebNavItem | undefined {
  return WEB_NAV.find((i) => i.href === href);
}

/** How many rows the admin block occupies — used to reserve its space. */
export const WEB_NAV_ADMIN_COUNT = WEB_NAV.filter((i) => i.adminOnly).length;
