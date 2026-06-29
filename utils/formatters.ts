const amountFormatter = new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const titleCaseWord = (word: string): string =>
    word.replace(/[A-Za-z]+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase());

export const formatPersonName = (value: string): string => {
    const trimmed = String(value || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return '';

    return trimmed
        .split(' ')
        .map((part) => part
            .split('-')
            .map((hyphenPart) => hyphenPart
                .split("'")
                .map((apostrophePart) => titleCaseWord(apostrophePart))
                .join("'"))
            .join('-'))
        .join(' ');
};

export const formatEmployeeAccountName = (firstName: string, surname: string): string => {
    const cleanFirst = formatPersonName(firstName);
    const cleanSurname = formatPersonName(surname);
    if (cleanFirst && cleanSurname) return `${cleanSurname}, ${cleanFirst}`;
    return cleanSurname || cleanFirst;
};

export const formatAmountDisplay = (value: string | number, options?: { currency?: boolean }): string => {
    const raw = typeof value === 'number' ? value : Number(String(value || '').replace(/[^0-9.\-]/g, ''));
    const safeNumber = Number.isFinite(raw) ? raw : 0;
    const formatted = amountFormatter.format(safeNumber);
    return options?.currency ? `$${formatted}` : formatted;
};
