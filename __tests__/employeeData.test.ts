import {
    parseEmployeeData,
    serializeEmployeeData,
    mergeEmployeesByAccount,
    upsertEmployeeById,
    removeEmployeeById,
    xlsxRowsToRawText,
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

describe('mergeEmployeesByAccount', () => {
    const current: Employee[] = [
        { id: 'c1', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '923100', account: '65609461' },
        { id: 'c2', firstName: 'Jane', surname: 'Doe', fullName: 'Jane Doe', bsb: '062676', account: '10260865' },
    ];

    test('updates matching account, keeps id, recomputes fullName', () => {
        const incoming: Employee[] = [
            { id: 'x', firstName: 'Aaron', surname: 'Grayson', fullName: 'Aaron Grayson', bsb: '999999', account: '65609461' },
        ];
        const { merged, pendingDeactivation } = mergeEmployeesByAccount(current, incoming);
        const updated = merged.find((e) => e.account === '65609461')!;
        expect(updated.id).toBe('c1');
        expect(updated.surname).toBe('Grayson');
        expect(updated.bsb).toBe('999999');
        expect(updated.fullName).toBe('Aaron Grayson');
        expect(pendingDeactivation.map((e) => e.account)).toEqual(['10260865']);
        expect(merged.some((e) => e.account === '10260865')).toBe(true);
    });

    test('adds new accounts', () => {
        const incoming: Employee[] = [
            { id: 'x', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '923100', account: '65609461' },
            { id: 'y', firstName: 'New', surname: 'Hire', fullName: 'New Hire', bsb: '012345', account: '99999999' },
        ];
        const { merged, pendingDeactivation } = mergeEmployeesByAccount(current, incoming);
        expect(merged.some((e) => e.account === '99999999')).toBe(true);
        expect(pendingDeactivation.map((e) => e.account)).toEqual(['10260865']);
    });

    test('collapses duplicate account rows within the incoming file (last wins)', () => {
        const incoming: Employee[] = [
            { id: 'x', firstName: 'New', surname: 'Hire', fullName: 'New Hire', bsb: '012345', account: '99999999' },
            { id: 'y', firstName: 'New', surname: 'Hire-Updated', fullName: 'New Hire-Updated', bsb: '777777', account: '99999999' },
        ];
        const { merged } = mergeEmployeesByAccount(current, incoming);
        const dupes = merged.filter((e) => e.account === '99999999');
        expect(dupes).toHaveLength(1);
        expect(dupes[0].surname).toBe('Hire-Updated');
        expect(dupes[0].bsb).toBe('777777');
    });

    test('never produces two rows with the same account number', () => {
        const incoming: Employee[] = [
            { id: 'x', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '923100', account: '65609461' },
            { id: 'x2', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '923100', account: '65609461' },
            { id: 'y', firstName: 'New', surname: 'Hire', fullName: 'New Hire', bsb: '012345', account: '99999999' },
        ];
        const { merged } = mergeEmployeesByAccount(current, incoming);
        const accounts = merged.map((e) => e.account);
        expect(new Set(accounts).size).toBe(accounts.length);
    });

    test('dedupes pre-existing duplicate accounts in the current list', () => {
        const dupeCurrent: Employee[] = [
            { id: 'c1', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '923100', account: '65609461' },
            { id: 'c1b', firstName: 'Aaron', surname: 'Gray', fullName: 'Aaron Gray', bsb: '923100', account: '65609461' },
        ];
        const incoming: Employee[] = [
            { id: 'x', firstName: 'New', surname: 'Hire', fullName: 'New Hire', bsb: '012345', account: '99999999' },
        ];
        const { merged, pendingDeactivation } = mergeEmployeesByAccount(dupeCurrent, incoming);
        expect(merged.filter((e) => e.account === '65609461')).toHaveLength(1);
        // duplicate '65609461' surfaces once in the deactivation queue, not twice
        expect(pendingDeactivation.filter((e) => e.account === '65609461')).toHaveLength(1);
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
