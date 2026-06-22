// Persists the manual "why is this pending" reason inside a record's
// full_email_content as an HTML comment, mirroring the PENDING_FOLLOWED_UP_AT
// pattern in App.tsx. The reason recurs in the EOD Status column across days.

export const extractPendingReason = (content: string): string => {
  const match = String(content || '').match(/<!--\s*PENDING_REASON:\s*([\s\S]*?)\s*-->/i);
  return match?.[1]?.trim() || '';
};

export const upsertPendingReason = (content: string, reason: string): string => {
  if (!reason?.trim()) return String(content || '');
  const body = stripPendingReasonTag(content);
  const tag = `<!-- PENDING_REASON: ${reason} -->`;
  return `${tag}\n${body.trim()}`;
};

export const stripPendingReasonTag = (content: string): string => {
  return String(content || '').replace(/\n*<!--\s*PENDING_REASON:[\s\S]*?-->\s*/gi, '\n').trim();
};
