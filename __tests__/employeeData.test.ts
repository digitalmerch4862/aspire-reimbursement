import { parseEmployeeData, serializeEmployeeData, Employee } from '../logic/employeeData';

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
