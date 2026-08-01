import type Feather from '@expo/vector-icons/Feather';

/**
 * The web sidebar's destinations, in order.
 *
 * SOURCE OF TRUTH FOR `web-detail-shell.web.tsx`, which reproduces the sidebar
 * around root-stack detail screens.
 *
 * `app-tabs.web.tsx` deliberately still hand-writes its `TabTrigger`s rather
 * than mapping this list. That is not an oversight: expo-router's TabList
 * parser only recurses into Fragments and nested TabLists, never other
 * wrappers, and the triggers there are load-bearing enough that the documented
 * gotcha (PROJECT_STATUS.md §7) makes refactoring them a poor trade. Keep the
 * two in step by hand — if you add a sidebar destination, add it in both.
 */
export interface WebNavItem {
  href: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  adminOnly?: boolean;
}

export const WEB_NAV: WebNavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/quote', label: 'Quote', icon: 'file-text' },
  { href: '/new-sales', label: 'New Sale', icon: 'plus-circle' },
  { href: '/records', label: 'Records', icon: 'archive' },
  { href: '/board', label: 'Production Board', icon: 'layout' },
  { href: '/clients', label: 'Clients', icon: 'users' },
  { href: '/expenses', label: 'Expenses', icon: 'dollar-sign' },
  { href: '/analytics', label: 'Analytics', icon: 'bar-chart-2', adminOnly: true },
  { href: '/settings', label: 'Settings', icon: 'settings', adminOnly: true },
  { href: '/cash', label: 'Daily Cash', icon: 'dollar-sign', adminOnly: true },
];
