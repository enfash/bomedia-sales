/**
 * Tabs group layout. Renders the app's tab navigator (AppTabs) — a brand
 * bottom bar on native (app-tabs.tsx) and a themed sidebar on web
 * (app-tabs.web.tsx). This group is nested inside the root Stack so detail
 * screens (transaction, invoice) push over the tabs with correct back behaviour.
 */
export { default } from '@/components/app-tabs';
