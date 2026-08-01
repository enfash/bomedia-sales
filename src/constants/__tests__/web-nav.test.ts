/**
 * Keeps the web sidebar and `WEB_NAV` in step.
 *
 * WHY THIS IS A SOURCE-LEVEL CHECK, WHICH IS UGLY
 *
 * The sidebar's destinations cannot be introspected at runtime. Two reasons:
 *
 *   1. expo-router's `TabList` parser only recurses into Fragments and nested
 *      TabLists, never other wrappers, so the `TabTrigger`s must be literal,
 *      hand-written direct children (PROJECT_STATUS.md §7). They cannot be
 *      mapped from `WEB_NAV`, which is what would have made drift impossible.
 *   2. Rendering `AppTabs` to inspect the tree would need the whole expo-router
 *      Tabs navigator plus auth, theme and settings context — and jest-expo
 *      resolves the NATIVE `app-tabs.tsx` by default, not the `.web.tsx`
 *      variant under test.
 *
 * So this reads the file as text and pulls the destinations out with regexes.
 * That is genuinely fragile: it verifies the strings are present, not that the
 * component renders them. Rename a prop or change the navigation call and this
 * test goes quiet rather than red.
 *
 * It is still worth having. The failure it catches — adding a sidebar
 * destination in one place and not the other — is the likely mistake, and it
 * catches it at the moment it happens instead of relying on someone reading a
 * doc note. If the parse itself breaks, the guard below fails loudly rather
 * than silently passing on an empty set.
 */

import { WEB_NAV } from '@/constants/web-nav';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SIDEBAR_SRC = join(__dirname, '..', '..', 'components', 'app-tabs.web.tsx');
const source = readFileSync(SIDEBAR_SRC, 'utf8');

/** `<TabTrigger name="records" href="/records" asChild>` — tab routes. */
function tabTriggerHrefs(src: string): string[] {
  return [...src.matchAll(/<TabTrigger[^>]*?href="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Root-stack routes reached from the sidebar. These are NOT TabTriggers —
 * they live outside the `(tabs)` group, so they navigate directly.
 */
function directNavHrefs(src: string): string[] {
  return [
    ...[...src.matchAll(/location\.assign\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]),
    ...[...src.matchAll(/router\.push\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]),
  ];
}

const triggers = tabTriggerHrefs(source);
const direct = directNavHrefs(source);
const sidebar = [...new Set([...triggers, ...direct])].sort();
const declared = [...new Set(WEB_NAV.map((i) => i.href))].sort();

describe('web sidebar destinations match WEB_NAV', () => {
  // If the regexes stop matching, every assertion below would trivially pass
  // on empty sets. Fail loudly instead.
  it('the source parse actually found something', () => {
    expect(source.length).toBeGreaterThan(0);
    expect(triggers.length).toBeGreaterThan(5);
    expect(direct.length).toBeGreaterThan(0);
  });

  it('every WEB_NAV destination is reachable from the sidebar', () => {
    const missing = declared.filter((href) => !sidebar.includes(href));
    expect(missing).toEqual([]);
  });

  it('every sidebar destination is declared in WEB_NAV', () => {
    const undeclared = sidebar.filter((href) => !declared.includes(href));
    expect(undeclared).toEqual([]);
  });

  it('the two lists are identical', () => {
    expect(sidebar).toEqual(declared);
  });

  it('declares no duplicate hrefs', () => {
    expect(WEB_NAV.map((i) => i.href)).toHaveLength(declared.length);
  });

  // /cash is a root-stack route, so it is reached by a plain navigation call
  // rather than a TabTrigger. If someone "tidies" it into a TabTrigger it will
  // silently stop working — the route is not in the (tabs) group.
  it('routes outside the (tabs) group are NOT wired as TabTriggers', () => {
    const rootStackRoutes = ['/cash'];
    for (const href of rootStackRoutes) {
      expect(direct).toContain(href);
      expect(triggers).not.toContain(href);
    }
  });

  it('every entry has a label and an icon', () => {
    for (const item of WEB_NAV) {
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(String(item.icon).trim().length).toBeGreaterThan(0);
    }
  });
});
