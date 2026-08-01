import React from 'react';

/**
 * Native passthrough.
 *
 * On mobile, detail screens push over the tab bar with normal back behaviour,
 * which is what you want on a phone. The sidebar shell is a web-only concern —
 * see web-detail-shell.web.tsx.
 */
export function WebDetailShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
