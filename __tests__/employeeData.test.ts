import {
    parseEmployeeData,
    serializeEmployeeData,
    dedupeByAccount,
    isValidAccount,
    upsertEmployeeById,
    removeEmployeeById,
    xlsxRowsToRawText,
    sanitizeEmployeeNameParts,
    Employee,
} from '../logic/employeeData';

const sample: Employee[] = [
    { id: 'a', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '923100', account: '65609461' },
    { id: 'b', firstName: 'Jane', surname: 'Doe', fullName: 'Jane Doe', bsb: '062676', account: '10260865' },
];

describe('serializeEmployeeData / parseEmployeeData', () => {
    test('serialize emits tab-delimited rows that the Supabase tab-split can read', () => {
        const out = serializeEmployeeData(sample);
        const lines = out.split('\n');
        expect(lines[0]).toBe('First Names\tSurname\tConcatenate\tBSB\tAccount');
        const parts = lines[1].split('\t');
        expect(parts[0]).toBe('Aaron');
        expect(parts[1]).toBe('Gray');
        expect(parts[3]).toBe('923100');
        expect(parts[4]).toBe('65609461');
    });

    test('round-trips data through serialize -> parse', () => {
        const reparsed = parseEmployeeData(serializeEmployeeData(sample));
        expect(reparsed.map((e) => [e.firstName, e.surname, e.bsb, e.account]))
            .toEqual([['Aaron', 'Gray', '923100', '65609461'], ['Jane', 'Doe', '062676', '10260865']]);
    });
});

describe('isValidAccount', () => {
    test('accepts all-digit accounts, rejects garbage', () => {
        expect(isValidAccount('65609461')).toBe(true);
        expect(isValidAccount(' 10260865 ')).toBe(true);
        expect(isValidAccount('Edit/Delete')).toBe(false);
        expect(isValidAccount('')).toBe(false);
        expect(isValidAccount('12-345')).toBe(false);
    });
});

describe('dedupeByAccount (replace-all upload)', () => {
    test('keeps one row per account, last occurrence wins', () => {
        const incoming: Employee[] = [
            { id: 'x', firstName: 'New', surname: 'Hire', fullName: 'New Hire', bsb: '012345', account: '99999999' },
            { id: 'y', firstName: 'New', surname: 'Hire-Updated', fullName: 'wrong', bsb: '777777', account: '99999999' },
        ];
        const out = dedupeByAccount(incoming);
        expect(out).toHaveLength(1);
        expect(out[0].surname).toBe('Hire-Updated');
        expect(out[0].bsb).toBe('777777');
        expect(out[0].fullName).toBe('New Hire-Updated');
    });

    test('result count equals number of unique valid accounts (no accumulation)', () => {
        const incoming: Employee[] = [
            { id: '1', firstName: 'A', surname: 'One', fullName: 'A One', bsb: '062107', account: '11206991' },
            { id: '2', firstName: 'B', surname: 'Two', fullName: 'B Two', bsb: '064148', account: '10813011' },
            { id: '3', firstName: 'B', surname: 'Two', fullName: 'B Two', bsb: '064148', account: '10813011' },
        ];
        expect(dedupeByAccount(incoming).map((e) => e.account)).toEqual(['11206991', '10813011']);
    });

    test('drops garbage rows whose account is not numeric', () => {
        const incoming: Employee[] = [
            { id: '1', firstName: 'Abdul', surname: 'Kargbo', fullName: 'Abdul Kargbo', bsb: '062107', account: '11206991' },
            { id: '2', firstName: 'Abdul Kargbo', surname: 'Payee', fullName: 'junk', bsb: '11206991', account: 'Edit/Delete' },
        ];
        const out = dedupeByAccount(incoming);
        expect(out).toHaveLength(1);
        expect(out[0].account).toBe('11206991');
    });

    test('no two rows share an account number', () => {
        const incoming: Employee[] = [
            { id: '1', firstName: 'A', surname: 'One', fullName: 'A One', bsb: '062107', account: '11206991' },
            { id: '2', firstName: 'A', surname: 'One', fullName: 'A One', bsb: '062107', account: '11206991' },
            { id: '3', firstName: 'B', surname: 'Two', fullName: 'B Two', bsb: '064148', account: '10813011' },
        ];
        const accounts = dedupeByAccount(incoming).map((e) => e.account);
        expect(new Set(accounts).size).toBe(accounts.length);
    });
});

describe('sanitizeEmployeeNameParts', () => {
    test('collapses duplicated payee imports into single clean full name', () => {
        expect(sanitizeEmployeeNameParts('Adeleke Kuye Adeleke Kuye', 'Payee'))
            .toEqual({
                firstName: 'Adeleke',
                surname: 'Kuye',
                fullName: 'Adeleke Kuye',
            });
    });

    test('leaves normal names unchanged', () => {
        expect(sanitizeEmployeeNameParts('Aaron', 'Gray'))
            .toEqual({
                firstName: 'Aaron',
                surname: 'Gray',
                fullName: 'Aaron Gray',
            });
    });

    test('collapses duplicated mononym into single displayed name', () => {
        expect(sanitizeEmployeeNameParts('Sangeeta', 'Sangeeta'))
            .toEqual({
                firstName: 'Sangeeta',
                surname: '',
                fullName: 'Sangeeta',
            });
    });
});

describe('upsert/remove by id', () => {
    const list: Employee[] = [
        { id: 'a', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '923100', account: '65609461' },
    ];

    test('upsert replaces same id', () => {
        const next = upsertEmployeeById(list, { id: 'a', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '111111', account: '65609461' });
        expect(next).toHaveLength(1);
        expect(next[0].bsb).toBe('111111');
    });

    test('upsert appends new id', () => {
        const next = upsertEmployeeById(list, { id: 'b', firstName: 'New', surname: 'Hire', fullName: 'New Hire', bsb: '012345', account: '99999999' });
        expect(next).toHaveLength(2);
    });

    test('remove drops the id', () => {
        expect(removeEmployeeById(list, 'a')).toHaveLength(0);
        expect(removeEmployeeById(list, 'zzz')).toHaveLength(1);
    });
});

describe('xlsxRowsToRawText', () => {
    test('maps named header columns (any order) to standard tab text', () => {
        const rows = [
            ['First Names', 'Surname', 'BSB', 'Account'],
            ['Aaron', 'Gray', 923100, 65609461],
        ];
        const text = xlsxRowsToRawText(rows);
        const parts = text.split('\n')[1].split('\t');
        expect(parts[0]).toBe('Aaron');
        expect(parts[1]).toBe('Gray');
        expect(parts[3]).toBe('923100');
        expect(parts[4]).toBe('65609461');
    });

    test('falls back to positional columns when header not recognized', () => {
        const rows = [
            ['col1', 'col2', 'concat', 'col4', 'col5'],
            ['Jane', 'Doe', 'Doe, Jane', '062676', '10260865'],
        ];
        const text = xlsxRowsToRawText(rows);
        const parts = text.split('\n')[1].split('\t');
        expect(parts[0]).toBe('Jane');
        expect(parts[1]).toBe('Doe');
        expect(parts[3]).toBe('062676');
        expect(parts[4]).toBe('10260865');
    });
});
