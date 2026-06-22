import { upsertPendingReason, extractPendingReason, stripPendingReasonTag, formatPendingEodStatus } from '../utils/pendingReason';

describe('pendingReason tag helpers', () => {
  it('extract returns empty string when no tag present', () => {
    expect(extractPendingReason('Hello body')).toBe('');
  });

  it('upsert prepends a tag and extract reads it back', () => {
    const out = upsertPendingReason('Body text', 'For Julian\'s Approval');
    expect(out).toContain('<!-- PENDING_REASON: For Julian\'s Approval -->');
    expect(extractPendingReason(out)).toBe('For Julian\'s Approval');
  });

  it('upsert replaces an existing tag instead of duplicating', () => {
    const first = upsertPendingReason('Body', 'NAB details C/o Bindi');
    const second = upsertPendingReason(first, 'For Julian\'s Approval');
    const matches = second.match(/PENDING_REASON:/g) || [];
    expect(matches.length).toBe(1);
    expect(extractPendingReason(second)).toBe('For Julian\'s Approval');
  });

  it('strip removes the tag and leaves the body', () => {
    const out = upsertPendingReason('Body text', 'NAB details C/o Bindi');
    expect(stripPendingReasonTag(out)).toBe('Body text');
  });

  it('helpers tolerate null/undefined input', () => {
    expect(extractPendingReason(undefined as unknown as string)).toBe('');
    expect(stripPendingReasonTag(null as unknown as string)).toBe('');
  });

  it('upsert with empty reason returns content unchanged', () => {
    expect(upsertPendingReason('Body', '')).toBe('Body');
    expect(upsertPendingReason('Body', '   ')).toBe('Body');
  });
});

describe('formatPendingEodStatus', () => {
  test('packs reason, pending-since date, and aging on one line', () => {
    const since = new Date('2026-06-18T09:00:00.000Z');
    expect(formatPendingEodStatus('For Julian\'s Approval', since, 4))
      .toBe("For Julian's Approval · Pending since 18 Jun · 4d aging");
  });

  test('falls back to "For Approval" when reason empty', () => {
    const since = new Date('2026-06-18T09:00:00.000Z');
    expect(formatPendingEodStatus('', since, 0))
      .toBe('For Approval · Pending since 18 Jun · 0d aging');
  });

  test('omits the date segment when sinceDate is null or invalid', () => {
    expect(formatPendingEodStatus('NAB details C/o Bindi', null, 2))
      .toBe('NAB details C/o Bindi · 2d aging');
    expect(formatPendingEodStatus('NAB details C/o Bindi', new Date('not-a-date'), 2))
      .toBe('NAB details C/o Bindi · 2d aging');
  });

  test('clamps negative aging to 0', () => {
    expect(formatPendingEodStatus('For Approval', null, -3))
      .toBe('For Approval · 0d aging');
  });
});
