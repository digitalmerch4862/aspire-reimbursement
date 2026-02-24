export const normalizeMoneyValue = (val: string, fallback = '0.00'): string => {
    if (!val) return fallback;
    const clean = val.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(clean);
    if (isNaN(parsed)) return fallback;
    return parsed.toFixed(2);
};

export const toDateKey = (dateStr: string): string => {
    if (!dateStr) return '';
    const clean = dateStr.trim().toLowerCase();
    const match = clean.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!match) return clean;
    const d = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    let y = match[3];
    if (y.length === 2) y = '20' + y;
    return `${d}/${m}/${y}`;
};

export const normalizeNameKey = (name: string): string => {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const normalizeTextKey = (text: string): string => {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const isValidNabReference = (value: string | null | undefined): boolean => {
    if (!value) return false;
    const clean = value.trim().toUpperCase();
    if (!clean || clean.length < 5) return false;
    // Standard NAB refs are alphanumeric, usually starting with a letter
    return /^[A-Z0-9]{6,15}$/.test(clean);
};
