export interface Employee {
    id: string;
    firstName: string;
    surname: string;
    fullName: string;
    bsb: string;
    account: string;
}

export const normalizeEmployeeName = (value: string): string => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const parseDelimitedLine = (line: string, delimiter: ',' | '\t'): string[] => {
    if (delimiter === '\t') return line.split('\t').map((cell) => cell.trim());

    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    values.push(current.trim());
    return values;
};

export const makeEmployeeId = (firstName: string, surname: string, account: string, salt: string | number = ''): string =>
    `${normalizeEmployeeName(firstName)}_${normalizeEmployeeName(surname)}_${String(account).trim()}_${salt}`;

export const parseEmployeeData = (rawData: string): Employee[] => {
    const rows = rawData
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (rows.length === 0) return [];

    const delimiter: ',' | '\t' = rows[0].includes('\t') ? '\t' : ',';
    const header = parseDelimitedLine(rows[0], delimiter).map((col) => normalizeEmployeeName(col));

    const firstNameIndex = header.findIndex((col) => col === 'first names' || col === 'first name' || col === 'firstname');
    const surnameIndex = header.findIndex((col) => col === 'surname' || col === 'last name' || col === 'lastname');
    const bsbIndex = header.findIndex((col) => col === 'bsb');
    const accountIndex = header.findIndex((col) => col === 'account' || col === 'account number' || col === 'account #');

    return rows.slice(1)
        .map((line, index) => {
            const cols = parseDelimitedLine(line, delimiter);
            const firstName = firstNameIndex >= 0 ? (cols[firstNameIndex] || '').trim() : (cols[0] || '').trim();
            const surname = surnameIndex >= 0 ? (cols[surnameIndex] || '').trim() : (cols[1] || '').trim();
            const bsb = bsbIndex >= 0 ? (cols[bsbIndex] || '').trim() : (cols[3] || '').trim();
            const account = accountIndex >= 0 ? (cols[accountIndex] || '').trim() : (cols[4] || '').trim();
            if (!firstName || !surname || !bsb || !account) return null;
            return {
                id: makeEmployeeId(firstName, surname, account, index),
                firstName,
                surname,
                fullName: `${firstName} ${surname}`,
                bsb,
                account,
            };
        })
        .filter((item): item is Employee => item !== null);
};

// BUG FIX: Was comma-delimited but saveEmployeesToSupabase splits on tab → null rows.
// Now tab-delimited + Concatenate column to round-trip correctly.
export const serializeEmployeeData = (employees: Employee[]): string => {
    const header = 'First Names\tSurname\tConcatenate\tBSB\tAccount';
    const rows = employees.map((e) =>
        `${e.firstName}\t${e.surname}\t${e.surname}, ${e.firstName}\t${e.bsb}\t${e.account}`);
    return [header, ...rows].join('\n');
};

// An account number is valid only when it is all digits (Australian bank accounts).
// This filters out garbage rows produced by misaligned uploads, e.g. a scraped
// payee list where the account column held UI text like "Edit/Delete".
export const isValidAccount = (account: string): boolean => /^\d+$/.test(String(account || '').trim());

// Collapses a roster so that no two rows share an account number. Garbage rows with a
// non-numeric account are dropped. When the same account appears more than once the
// LAST occurrence wins (newest data replaces the old), keeping the first-seen position.
// Used for file uploads where the file is the single source of truth (replace-all).
export const dedupeByAccount = (list: Employee[]): Employee[] => {
    const byAccount = new Map<string, Employee>();
    list.forEach((e) => {
        const key = e.account.trim();
        if (!isValidAccount(key)) return;
        // Map keeps the first insertion position for a key while letting us overwrite
        // its value, so order = first occurrence, data = last occurrence.
        byAccount.set(key, { ...e, account: key, fullName: `${e.firstName} ${e.surname}` });
    });
    return Array.from(byAccount.values());
};

export const upsertEmployeeById = (list: Employee[], rec: Employee): Employee[] => {
    const idx = list.findIndex((e) => e.id === rec.id);
    if (idx === -1) return [...list, rec];
    const next = list.slice();
    next[idx] = rec;
    return next;
};

export const removeEmployeeById = (list: Employee[], id: string): Employee[] =>
    list.filter((e) => e.id !== id);

type Cell = string | number | boolean | Date | null | undefined;

export const xlsxRowsToRawText = (rows: Cell[][]): string => {
    const cleaned = rows
        .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))
        .map((r) => r.map((c) => String(c ?? '').trim()));
    if (cleaned.length === 0) return 'First Names\tSurname\tConcatenate\tBSB\tAccount';

    const header = cleaned[0].map((c) => normalizeEmployeeName(c));
    const firstNameIndex = header.findIndex((c) => c === 'first names' || c === 'first name' || c === 'firstname');
    const surnameIndex = header.findIndex((c) => c === 'surname' || c === 'last name' || c === 'lastname');
    const bsbIndex = header.findIndex((c) => c === 'bsb');
    const accountIndex = header.findIndex((c) => c === 'account' || c === 'account number' || c === 'account #');
    const recognized = firstNameIndex >= 0 && surnameIndex >= 0 && bsbIndex >= 0 && accountIndex >= 0;

    const out: string[] = ['First Names\tSurname\tConcatenate\tBSB\tAccount'];
    cleaned.slice(1).forEach((cols) => {
        const firstName = recognized ? (cols[firstNameIndex] || '') : (cols[0] || '');
        const surname = recognized ? (cols[surnameIndex] || '') : (cols[1] || '');
        const bsb = recognized ? (cols[bsbIndex] || '') : (cols[3] || '');
        const account = recognized ? (cols[accountIndex] || '') : (cols[4] || '');
        if (!firstName || !surname || !bsb || !account) return;
        out.push(`${firstName}\t${surname}\t${surname}, ${firstName}\t${bsb}\t${account}`);
    });
    return out.join('\n');
};
