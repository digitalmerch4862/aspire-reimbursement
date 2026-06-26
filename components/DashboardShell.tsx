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
    const isActive = activeId === item.id;
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
          // Stable window name (item.id) instead of "_blank":
          // re-clicking reuses & focuses the same tab rather than
          // spawning a new one each time.
          target={item.id}
          rel="noopener noreferrer"
          title={item.label}
          className={className}
          onClick={(e) => {
            e.preventDefault();
            window.open(item.url, item.id);
            setActiveId(item.id);
          }}
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
