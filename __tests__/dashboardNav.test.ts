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
