# Daily Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing Aspire Reimbursement app in a responsive shell with a left sidebar (desktop) / bottom tab bar (mobile) that quick-launches Outlook, ChatGPT, and NAB in new tabs and keeps Aspire as the main view.

**Architecture:** A new `DashboardShell` component renders navigation chrome around a main content slot. The existing `App` is passed as the shell's child in `index.tsx`, so Aspire renders unchanged inside the main area. Navigation data lives in a separate pure module (`components/dashboardNav.ts`) so it can be unit-tested without rendering React. External nav items are native `<a target="_blank">` links; the Aspire item is the default-active internal view.

**Tech Stack:** Vite + React 19, TypeScript, Tailwind (CDN), lucide-react icons, Jest + ts-jest (jsdom). No new dependencies.

---

### Task 1: Navigation config module

**Files:**
- Create: `components/dashboardNav.ts`
- Test: `__tests__/dashboardNav.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/dashboardNav.test.ts
import { DASHBOARD_NAV_ITEMS } from '../components/dashboardNav';

describe('DASHBOARD_NAV_ITEMS', () => {
  it('lists the four services in order', () => {
    expect(DASHBOARD_NAV_ITEMS.map((i) => i.id)).toEqual([
      'outlook',
      'chatgpt',
      'nab',
      'aspire',
    ]);
  });

  it('marks the three services as external new-tab links with correct urls', () => {
    const byId = Object.fromEntries(DASHBOARD_NAV_ITEMS.map((i) => [i.id, i]));
    expect(byId.outlook).toMatchObject({
      kind: 'external',
      url: 'https://outlook.cloud.microsoft/mail/',
    });
    expect(byId.chatgpt).toMatchObject({
      kind: 'external',
      url: 'https://chatgpt.com/g/g-699802c766cc8191bee84a10f244db53-av2',
    });
    expect(byId.nab).toMatchObject({
      kind: 'external',
      url: 'https://ib.nab.com.au/login',
    });
  });

  it('marks aspire as the internal default item', () => {
    const aspire = DASHBOARD_NAV_ITEMS.find((i) => i.id === 'aspire');
    expect(aspire).toMatchObject({ kind: 'internal', isDefault: true });
  });

  it('gives every item a label and an icon name', () => {
    for (const item of DASHBOARD_NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/dashboardNav.test.ts`
Expected: FAIL — cannot find module `../components/dashboardNav`.

- [ ] **Step 3: Write minimal implementation**

```ts
// components/dashboardNav.ts
export type DashboardNavItem = {
  id: 'outlook' | 'chatgpt' | 'nab' | 'aspire';
  label: string;
  /** lucide-react icon name, resolved by the shell component */
  icon: 'Mail' | 'Bot' | 'Landmark' | 'ClipboardList';
} & (
  | { kind: 'external'; url: string }
  | { kind: 'internal'; isDefault: boolean }
);

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    id: 'outlook',
    label: 'Outlook',
    icon: 'Mail',
    kind: 'external',
    url: 'https://outlook.cloud.microsoft/mail/',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    icon: 'Bot',
    kind: 'external',
    url: 'https://chatgpt.com/g/g-699802c766cc8191bee84a10f244db53-av2',
  },
  {
    id: 'nab',
    label: 'NAB',
    icon: 'Landmark',
    kind: 'external',
    url: 'https://ib.nab.com.au/login',
  },
  {
    id: 'aspire',
    label: 'Aspire',
    icon: 'ClipboardList',
    kind: 'internal',
    isDefault: true,
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/dashboardNav.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add components/dashboardNav.ts __tests__/dashboardNav.test.ts
git commit -m "feat: add dashboard nav config module"
```

---

### Task 2: DashboardShell component

**Files:**
- Create: `components/DashboardShell.tsx`

This is a presentational React component. The repo has no React Testing Library and the spec forbids new deps, so verification is by `typecheck` + manual render. Follow the existing Tailwind/lucide style used in `App.tsx`.

- [ ] **Step 1: Write the component**

```tsx
// components/DashboardShell.tsx
import React, { useState } from 'react';
import { Mail, Bot, Landmark, ClipboardList, LucideIcon } from 'lucide-react';
import { DASHBOARD_NAV_ITEMS, DashboardNavItem } from './dashboardNav';

const ICONS: Record<DashboardNavItem['icon'], LucideIcon> = {
  Mail,
  Bot,
  Landmark,
  ClipboardList,
};

interface DashboardShellProps {
  children: React.ReactNode;
}

const DashboardShell: React.FC<DashboardShellProps> = ({ children }) => {
  const defaultItem =
    DASHBOARD_NAV_ITEMS.find((i) => i.kind === 'internal' && i.isDefault) ??
    DASHBOARD_NAV_ITEMS[DASHBOARD_NAV_ITEMS.length - 1];
  const [activeId, setActiveId] = useState<DashboardNavItem['id']>(defaultItem.id);

  const renderNavButton = (item: DashboardNavItem, layout: 'side' | 'bottom') => {
    const Icon = ICONS[item.icon];
    const isActive = item.kind === 'internal' && activeId === item.id;
    const base =
      'group flex items-center justify-center transition-colors rounded-xl ' +
      (layout === 'side'
        ? 'w-11 h-11 flex-col'
        : 'flex-1 flex-col gap-0.5 py-2');
    const state = isActive
      ? 'bg-indigo-600 text-white'
      : 'text-slate-400 hover:text-white hover:bg-white/5';
    const className = `${base} ${state}`;

    if (item.kind === 'external') {
      return (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title={item.label}
          className={className}
        >
          <Icon size={20} />
          {layout === 'bottom' && (
            <span className="text-[10px] font-semibold">{item.label}</span>
          )}
        </a>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        title={item.label}
        onClick={() => setActiveId(item.id)}
        className={className}
      >
        <Icon size={20} />
        {layout === 'bottom' && (
          <span className="text-[10px] font-semibold">{item.label}</span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen flex bg-[#0f1115]">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col items-center gap-2 w-[60px] shrink-0 bg-[#0b0d11] border-r border-white/5 py-4">
        {DASHBOARD_NAV_ITEMS.map((item) => renderNavButton(item, 'side'))}
      </nav>

      {/* Main content area (Aspire app) */}
      <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch gap-1 px-2 py-1 bg-[#0b0d11] border-t border-white/5">
        {DASHBOARD_NAV_ITEMS.map((item) => renderNavButton(item, 'bottom'))}
      </nav>
    </div>
  );
};

export default DashboardShell;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no TypeScript errors (confirms `LucideIcon` import, prop types, and the `DashboardNavItem` union narrow correctly).

- [ ] **Step 3: Commit**

```bash
git add components/DashboardShell.tsx
git commit -m "feat: add DashboardShell sidebar/bottom-bar component"
```

---

### Task 3: Mount the shell around App

**Files:**
- Modify: `index.tsx`

Current `index.tsx` renders `<App />` directly. Wrap it in `DashboardShell` so the shell chrome surrounds the existing app.

- [ ] **Step 1: Edit index.tsx**

Replace the file contents with:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import DashboardShell from './components/DashboardShell';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <DashboardShell>
      <App />
    </DashboardShell>
  </React.StrictMode>
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS — `vite build` completes, `dist/` produced, no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the local URL.
Confirm:
- Desktop width: a ~60px dark sidebar on the left with 4 icons (Mail, Bot, Landmark, Clipboard); Aspire fills the rest; Aspire icon highlighted.
- Clicking Outlook/ChatGPT/NAB opens the correct URL in a new tab; main area stays on Aspire.
- Narrow width (<768px, devtools responsive): sidebar hidden, bottom tab bar visible with icon + label; Aspire content not hidden behind the bar (bottom padding present).
- Existing Aspire functionality (upload, modes, etc.) works unchanged.

- [ ] **Step 5: Commit**

```bash
git add index.tsx
git commit -m "feat: mount Aspire app inside DashboardShell"
```

---

### Task 4: Full health check

**Files:** none (verification only)

- [ ] **Step 1: Run the full health script**

Run: `npm run health`
Expected: PASS — typecheck, full Jest suite (including the new `dashboardNav` test), and `vite build` all succeed.

- [ ] **Step 2: Commit (only if any lockfile/snapshot changed)**

If `git status` is clean, skip. Otherwise:

```bash
git add -A
git commit -m "chore: health check artifacts for dashboard shell"
```

---

## Notes

- **No backend / no new deps:** All four nav targets are static. lucide-react and Tailwind are already in the project.
- **Deploy:** Same Vercel project. After merge to `main`, the existing git-integration build deploys prod. Do not push without the user's explicit confirmation (per project commit/push gate).
