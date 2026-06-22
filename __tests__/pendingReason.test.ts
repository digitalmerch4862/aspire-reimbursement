import { upsertPendingReason, extractPendingReason, stripPendingReasonTag } from '../utils/pendingReason';

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
