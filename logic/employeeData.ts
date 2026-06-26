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
