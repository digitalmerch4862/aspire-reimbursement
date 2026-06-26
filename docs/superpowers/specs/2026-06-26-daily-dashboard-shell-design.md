# Daily Dashboard Shell — Design Spec

**Date:** 2026-06-26
**Status:** Approved

## Problem

Every morning the user opens 4 browser tabs manually:

1. Outlook mail — `https://outlook.cloud.microsoft/mail/`
2. ChatGPT custom GPT (AV2) — `https://chatgpt.com/g/g-699802c766cc8191bee84a10f244db53-av2`
3. NAB internet banking — `https://ib.nab.com.au/login`
4. Aspire Reimbursement app — already deployed on Vercel

The user wants a single home-base app that gathers all daily destinations in one place, with a responsive layout that works on both desktop (PC mode) and mobile.

## Goals

- One app as the morning starting point.
- Quick access to all 4 services from a single screen.
- Aspire Reimbursement fully usable inside the app (it is the same codebase).
- External services (Outlook, ChatGPT, NAB) open in a new browser tab via quick-launch.
- Responsive: desktop shows a left sidebar; mobile shows a bottom tab bar.

## Non-Goals (YAGNI)

- No iframe embedding of external services. Outlook, ChatGPT, and NAB all block iframe embedding via X-Frame-Options / CSP. Iframes are not attempted.
- No summary widgets / API integrations. Earlier considered email unread counts (Microsoft Graph) and NAB balances (Open Banking / CDR). Both rejected:
  - Microsoft Graph requires Azure AD app registration and likely work-IT approval.
  - NAB CDR requires accredited data recipient status, not feasible for an individual.
  - All external services are quick-launch buttons only.
- No separate codebases or builds for desktop vs mobile. One responsive React app.
- No backend changes. No new external APIs.

## Approach

Extend the existing Aspire Reimbursement React app (Vite + React 19) with a wrapper shell. The shell provides navigation (sidebar / bottom bar) around the existing Aspire app, which renders unchanged in the main content area.

### Layout: Sidebar + Main Area (chosen)

- **Desktop (≥768px):** Fixed left sidebar (~60px wide), always visible. Aspire app fills the remaining width on the right.
- **Mobile (<768px):** Sidebar collapses into a fixed bottom tab bar. Aspire app fills the area above it.

### Navigation items

Four items, in order:

| Item | Icon | Action |
|------|------|--------|
| Outlook | mail | new-tab link → `https://outlook.cloud.microsoft/mail/` |
| ChatGPT | bot / message | new-tab link → `https://chatgpt.com/g/g-699802c766cc8191bee84a10f244db53-av2` |
| NAB | landmark / bank | new-tab link → `https://ib.nab.com.au/login` |
| Aspire | clipboard | Sets main view to Aspire (default active item) |

- Aspire is the default active item. Its main area always shows the existing Aspire app.
- Clicking Outlook / ChatGPT / NAB opens a new tab and leaves the main area on Aspire.
- Active item is visually highlighted. Desktop: hover shows a text tooltip/label. Mobile: label rendered below each icon.

## Components

### `components/DashboardShell.tsx` (new)

- Renders the sidebar (desktop) / bottom tab bar (mobile) and a main content slot.
- Accepts the Aspire app content as `children` (or renders it directly).
- Holds the nav config (label, icon, type: `link` | `internal`, url).
- External items render as `<a href={url} target="_blank" rel="noopener noreferrer">` so the browser handles new-tab opening natively (avoids popup-blocker issues). Internal item (Aspire) is a `<button>` that sets active view.
- Responsive behavior via CSS (media query / Tailwind breakpoints) — no JS resize logic required.

### `App.tsx` (modify)

- Wrap the existing top-level render in `<DashboardShell>`. The existing Aspire UI becomes the main-area child.
- No change to existing Aspire logic, state, or modes.

### Styles (modify)

- Sidebar/bottom-bar styling matching existing visual patterns (the app uses lucide-react icons and an existing style approach).
- Desktop: vertical 60px sidebar, dark background, contrasts with main area.
- Mobile: horizontal bottom bar, icons with small text labels, active highlight.

## Data Flow

- No external data. Nav config is a static array inside `DashboardShell`.
- Active-view state is local component state in `DashboardShell` (default `aspire`). Since only Aspire renders internally, this is effectively a highlight indicator; external clicks do not change it.

## Error Handling

- External items are native anchor tags with `rel="noopener noreferrer"`, so the browser handles new-tab opening — no popup-blocker risk, no JS error path.

## Testing

- Manual: verify each external button opens the correct URL in a new tab; verify Aspire app renders and functions unchanged in the main area.
- Responsive: verify sidebar at desktop width, bottom bar at mobile width (resize / devtools).
- Existing Aspire tests (Jest) continue to pass unchanged.

## Deployment

- Same Vercel project, same build (`vite build`). Push to deploy.

## File Change Summary

- **New:** `components/DashboardShell.tsx`
- **Modify:** `App.tsx` (wrap content in shell)
- **Modify:** styles (sidebar / bottom-bar responsive rules)
