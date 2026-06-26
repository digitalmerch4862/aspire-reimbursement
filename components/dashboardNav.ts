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
