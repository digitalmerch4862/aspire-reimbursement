# Employee Database Payee-List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the System Settings → Employee Database textarea into a NAB-style payee list with per-employee Edit/Delete modals (single update) and an Excel/CSV upload that smart-merges by account number (mass update).

**Architecture:** Extract the employee data primitives out of the monolithic `App.tsx` into a pure, unit-tested module `logic/employeeData.ts` (matching the existing `logic/`/`utils/` pattern). Build the new merge/upsert/remove/xlsx-conversion logic there under TDD. Then wire React UI (list + pagination + search, Add/Edit modal, Delete confirm, upload flow) into `App.tsx`, with one central `persistEmployeeList` writer.

**Tech Stack:** React 19 + TypeScript, Vite, jest + ts-jest (jsdom), `read-excel-file` (already a dependency), Supabase JS, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-06-26-employee-database-payee-list-design.md`

---

## File Structure

- **Create** `logic/employeeData.ts` — pure employee data layer: `Employee` type, `normalizeEmployeeName`, `parseDelimitedLine`, `parseEmployeeData`, `serializeEmployeeData` (tab-delimited, fixed), `makeEmployeeId`, `mergeEmployeesByAccount`, `upsertEmployeeById`, `removeEmployeeById`, `xlsxRowsToRawText`.
- **Create** `__tests__/employeeData.test.ts` — unit tests for the module.
- **Modify** `App.tsx` — delete the now-extracted inline helpers and import them; add `persistEmployeeList`; rewrite upload flow; add list/pagination/search state + UI; add Add/Edit modal; add Delete confirm.

Identity rules (locked from spec): **edit keys by `id`**, **mass-merge keys by `account`**, account-name is derived (`\`${surname}, ${firstName}\`.toUpperCase()`), no schema/stored-field changes.

---

### Task 1: Extract + fix employee data primitives

Move the existing primitives into a testable module and fix the serialize delimiter bug
(`serializeEmployeeData` emitted commas; `saveEmployeesToSupabase` splits on tabs → null rows).

**Files:**
- Create: `logic/employeeData.ts`
- Create: `__tests__/employeeData.test.ts`
- Modify: `App.tsx` (delete inline copies at: `interface Employee` ~37-44, `normalizeEmployeeName` ~61-65, `parseDelimitedLine` ~147-177, `parseEmployeeData` ~179-214, `serializeEmployeeData` ~216-220; add import)

- [ ] **Step 1: Create the module with moved primitives + fixed serialize**

Create `logic/employeeData.ts`:

```ts
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

// Tab-delimited + Concatenate column so it round-trips through parseEmployeeData
// (auto-detects tab) AND saveEmployeesToSupabase (splits each line on tab).
export const serializeEmployeeData = (employees: Employee[]): string => {
    const header = 'First Names\tSurname\tConcatenate\tBSB\tAccount';
    const rows = employees.map((e) =>
        `${e.firstName}\t${e.surname}\t${e.surname}, ${e.firstName}\t${e.bsb}\t${e.account}`);
    return [header, ...rows].join('\n');
};
```

- [ ] **Step 2: Write the failing round-trip test**

Create `__tests__/employeeData.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx jest __tests__/employeeData.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Delete the inline copies in `App.tsx` and import from the module**

In `App.tsx`, delete these inline declarations: `interface Employee {...}`, `const normalizeEmployeeName = ...`, `const parseDelimitedLine = ...`, `const parseEmployeeData = ...`, `const serializeEmployeeData = ...`.
Add to the import block near the top (after line 22 `import * as ModeLogic ...`):

```ts
import {
    Employee,
    normalizeEmployeeName,
    parseEmployeeData,
    serializeEmployeeData,
    makeEmployeeId,
    mergeEmployeesByAccount,
    upsertEmployeeById,
    removeEmployeeById,
    xlsxRowsToRawText,
} from './logic/employeeData';
```

(The last four names are added in Tasks 2-4; importing them now is fine — they will exist before the build step in Step 5 runs only if Tasks 2-4 are done. If executing strictly in order, import just the five existing names here and extend the import in each later task.)

- [ ] **Step 5: Typecheck + tests + commit**

Run: `npm run typecheck && npx jest __tests__/employeeData.test.ts`
Expected: no type errors; tests PASS.

```bash
git add logic/employeeData.ts __tests__/employeeData.test.ts App.tsx
git commit -m "refactor: extract employee data helpers to logic/employeeData; fix serialize delimiter"
```

---

### Task 2: `mergeEmployeesByAccount`

Smart-merge an uploaded roster into the current list, keyed by account number.

**Files:**
- Modify: `logic/employeeData.ts`
- Modify: `__tests__/employeeData.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `__tests__/employeeData.test.ts`:

```ts
import { mergeEmployeesByAccount } from '../logic/employeeData';

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
        // Jane absent from incoming -> queued for deactivation, not deleted
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/employeeData.test.ts -t mergeEmployeesByAccount`
Expected: FAIL ("mergeEmployeesByAccount is not a function" / undefined).

- [ ] **Step 3: Implement**

Append to `logic/employeeData.ts`:

```ts
export const mergeEmployeesByAccount = (
    current: Employee[],
    incoming: Employee[],
): { merged: Employee[]; pendingDeactivation: Employee[] } => {
    const currentByAccount = new Map(current.map((e) => [e.account.trim(), e]));
    const incomingAccounts = new Set(incoming.map((e) => e.account.trim()));

    const merged: Employee[] = current.map((e) => e); // start from current (preserves order/ids)

    incoming.forEach((row) => {
        const key = row.account.trim();
        const existing = currentByAccount.get(key);
        if (existing) {
            const idx = merged.findIndex((e) => e.id === existing.id);
            merged[idx] = {
                ...existing,
                firstName: row.firstName,
                surname: row.surname,
                bsb: row.bsb,
                fullName: `${row.firstName} ${row.surname}`,
            };
        } else {
            merged.push({
                ...row,
                fullName: `${row.firstName} ${row.surname}`,
                id: makeEmployeeId(row.firstName, row.surname, key, `add_${key}`),
            });
        }
    });

    const pendingDeactivation = current.filter((e) => !incomingAccounts.has(e.account.trim()));
    return { merged, pendingDeactivation };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/employeeData.test.ts -t mergeEmployeesByAccount`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add logic/employeeData.ts __tests__/employeeData.test.ts
git commit -m "feat: mergeEmployeesByAccount for smart roster merge"
```

---

### Task 3: `upsertEmployeeById` + `removeEmployeeById`

Single-record list mutations keyed by stable id (used by the Edit/Add modal and Delete).

**Files:**
- Modify: `logic/employeeData.ts`
- Modify: `__tests__/employeeData.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `__tests__/employeeData.test.ts`:

```ts
import { upsertEmployeeById, removeEmployeeById } from '../logic/employeeData';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/employeeData.test.ts -t "upsert/remove by id"`
Expected: FAIL (functions undefined).

- [ ] **Step 3: Implement**

Append to `logic/employeeData.ts`:

```ts
export const upsertEmployeeById = (list: Employee[], rec: Employee): Employee[] => {
    const idx = list.findIndex((e) => e.id === rec.id);
    if (idx === -1) return [...list, rec];
    const next = list.slice();
    next[idx] = rec;
    return next;
};

export const removeEmployeeById = (list: Employee[], id: string): Employee[] =>
    list.filter((e) => e.id !== id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/employeeData.test.ts -t "upsert/remove by id"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add logic/employeeData.ts __tests__/employeeData.test.ts
git commit -m "feat: upsertEmployeeById/removeEmployeeById single-record mutations"
```

---

### Task 4: `xlsxRowsToRawText` (Excel rows → parseable text)

Pure converter so the React handler can pass `read-excel-file` output straight into
`parseEmployeeData`. Tests stay pure (no `read-excel-file` import — we feed it row arrays).

**Files:**
- Modify: `logic/employeeData.ts`
- Modify: `__tests__/employeeData.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `__tests__/employeeData.test.ts`:

```ts
import { xlsxRowsToRawText } from '../logic/employeeData';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/employeeData.test.ts -t xlsxRowsToRawText`
Expected: FAIL (function undefined).

- [ ] **Step 3: Implement**

Append to `logic/employeeData.ts`:

```ts
type Cell = string | number | boolean | Date | null | undefined;

// Converts read-excel-file output (array of row arrays) into the standard
// tab-delimited text that parseEmployeeData consumes.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/employeeData.test.ts`
Expected: PASS (all employeeData tests).

- [ ] **Step 5: Commit**

```bash
git add logic/employeeData.ts __tests__/employeeData.test.ts
git commit -m "feat: xlsxRowsToRawText converter for Excel uploads"
```

---

### Task 5: Central `persistEmployeeList` writer (DRY)

Collapse the duplicated state+localStorage+Supabase writes into one helper.

**Files:**
- Modify: `App.tsx` (add helper near `handleSaveEmployeeList` ~2188; refactor `handleSaveEmployeeList`, `handleKeepPendingEmployee` ~2258)

- [ ] **Step 1: Add the helper**

Insert above `handleSaveEmployeeList` in `App.tsx`:

```tsx
const persistEmployeeList = async (next: Employee[]): Promise<void> => {
    const serialized = serializeEmployeeData(next);
    setEmployeeList(next);
    setEmployeeRawText(serialized);
    localStorage.setItem('aspire_employee_list', serialized);
    if (hasSupabaseEnv) {
        const result = await saveEmployeesToSupabase(serialized);
        if (!result.success) {
            showWarningToast(`Saved locally. Supabase sync failed: ${result.error}`);
        }
    }
};
```

- [ ] **Step 2: Refactor `handleSaveEmployeeList` to use it**

Replace the body of `handleSaveEmployeeList` with:

```tsx
const handleSaveEmployeeList = async () => {
    await persistEmployeeList(parseEmployeeData(employeeRawText));
    setSaveEmployeeStatus('saved');
    setTimeout(() => setSaveEmployeeStatus('idle'), 2000);
};
```

- [ ] **Step 3: Refactor `handleKeepPendingEmployee` to use it**

Replace its persist block (the `setEmployeeList` + `serializeEmployeeData` + `localStorage` + `saveEmployeesToSupabase` lines) with a single call. The function becomes:

```tsx
const handleKeepPendingEmployee = async (account: string) => {
    const target = pendingDeactivationEmployees.find((employee) => employee.account === account);
    if (!target) return;
    const nextActive = employeeList.some((employee) => employee.account === target.account)
        ? employeeList
        : [...employeeList, target];
    await persistEmployeeList(nextActive);
    const nextPending = pendingDeactivationEmployees.filter((employee) => employee.account !== account);
    persistPendingDeactivationEmployees(nextPending);
    setCsvImportMessage(`Kept account ${account} as active.`);
};
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "refactor: central persistEmployeeList writer; DRY save/keep paths"
```

---

### Task 6: Wire Excel + smart-merge into the upload flow

**Files:**
- Modify: `App.tsx` (`handleCsvFileChange` ~2222; import already extended in Task 1)

- [ ] **Step 1: Add the `read-excel-file` import**

Near the other imports at the top of `App.tsx`:

```ts
import readXlsxFile from 'read-excel-file';
```

- [ ] **Step 2: Rewrite `handleCsvFileChange` for xlsx + smart-merge + preview**

Replace the whole `handleCsvFileChange` function with:

```tsx
const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const isXlsx = /\.xlsx$/i.test(file.name);
        let raw: string;
        if (isXlsx) {
            const rows = await readXlsxFile(file);
            raw = xlsxRowsToRawText(rows as any);
        } else {
            raw = await file.text();
        }

        const incoming = parseEmployeeData(raw);
        if (incoming.length === 0) {
            setCsvImportMessage('No valid rows found. Check headers: First Names, Surname, BSB, Account.');
            return;
        }

        const { merged, pendingDeactivation } = mergeEmployeesByAccount(employeeList, incoming);
        const incomingAccounts = new Set(incoming.map((e) => e.account.trim()));
        const updatedCount = employeeList.filter((e) => incomingAccounts.has(e.account.trim())).length;
        const newCount = incoming.length - updatedCount;

        await persistEmployeeList(merged);
        persistPendingDeactivationEmployees(pendingDeactivation);
        setCsvImportMessage(`Merged: ${updatedCount} updated, ${newCount} new, ${pendingDeactivation.length} moved to approval-to-deactivate.`);
    } catch (error) {
        console.error('Roster import failed:', error);
        setCsvImportMessage('Import failed. Use a clean .xlsx or .csv with the expected columns.');
    } finally {
        if (event.target) event.target.value = '';
    }
};
```

- [ ] **Step 3: Update the file input `accept` to include xlsx**

Find the employee CSV `<input ref={employeeCsvInputRef} ...>` (~line 8658) and set:

```tsx
accept=".xlsx,.csv,text/csv,.txt"
```

Also update the button label text from `Upload .CSV for Update` to `Upload File (Excel/CSV)`.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open Settings → Employee Database, click Upload File, choose
`C:\Users\Admin\Documents\Downloads\Aspire\Updated Details (26.06.26).xlsx`.
Expected: a "Merged: X updated, Y new, Z moved..." message; list count changes accordingly.

- [ ] **Step 6: Commit**

```bash
git add App.tsx
git commit -m "feat: Excel upload + smart-merge-by-account roster import"
```

---

### Task 7: Payee-list UI — search, pagination, cards, kebab

**Files:**
- Modify: `App.tsx` (lucide import ~line 2-8; new state near other Employee state ~1721; JSX replacing the textarea block ~8703-8710, keeping it as collapsible Advanced)

- [ ] **Step 1: Extend the lucide-react import**

Add to the `from 'lucide-react'` import list: `MoreVertical, ChevronLeft, ChevronRight, ChevronDown`.

- [ ] **Step 2: Add view + menu state**

Near the other Employee state (after `employeeCsvInputRef`, ~line 1728):

```tsx
const [employeeSearch, setEmployeeSearch] = useState('');
const [employeePage, setEmployeePage] = useState(0);
const [employeePageSize, setEmployeePageSize] = useState(10);
const [openEmployeeMenuId, setOpenEmployeeMenuId] = useState<string | null>(null);
const [showAdvancedEmployee, setShowAdvancedEmployee] = useState(false);
```

- [ ] **Step 3: Add derived filtered/paged memo**

After the state above (inside the component, near other `useMemo`s):

```tsx
const filteredEmployees = useMemo(() => {
    const q = normalizeEmployeeName(employeeSearch);
    if (!q) return employeeList;
    return employeeList.filter((e) =>
        normalizeEmployeeName(getEmployeeDisplayName(e)).includes(q) ||
        e.account.includes(employeeSearch.trim()) ||
        e.bsb.includes(employeeSearch.trim()));
}, [employeeList, employeeSearch]);

const pagedEmployees = useMemo(() => {
    const start = employeePage * employeePageSize;
    return filteredEmployees.slice(start, start + employeePageSize);
}, [filteredEmployees, employeePage, employeePageSize]);
```

- [ ] **Step 4: Replace the textarea block with the list UI + collapsible Advanced**

Replace the `<div className="bg-black/30 rounded-xl border border-white/10 p-1">…textarea…</div>`
block (~8703-8710) with:

```tsx
{/* Search + count + page size */}
<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
    <div className="relative w-full md:w-80">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
            value={employeeSearch}
            onChange={(e) => { setEmployeeSearch(e.target.value); setEmployeePage(0); }}
            placeholder="Search name, account, BSB…"
            className="w-full pl-9 pr-3 py-2 rounded-full bg-black/30 border border-white/10 text-sm text-white outline-none focus:border-indigo-500/50"
        />
    </div>
    <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>
            {filteredEmployees.length === 0 ? '0' :
                `${employeePage * employeePageSize + 1}–${Math.min((employeePage + 1) * employeePageSize, filteredEmployees.length)}`} of {filteredEmployees.length}
        </span>
        <select
            value={employeePageSize}
            onChange={(e) => { setEmployeePageSize(Number(e.target.value)); setEmployeePage(0); }}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white outline-none"
        >
            {[10, 25, 50].map((n) => <option key={n} value={n}>{n}/page</option>)}
        </select>
    </div>
</div>

{/* Employee cards */}
<div className="space-y-2">
    {pagedEmployees.length === 0 && (
        <p className="text-xs text-slate-500">No employees match.</p>
    )}
    {pagedEmployees.map((emp) => (
        <div key={emp.id} className="relative rounded-xl border border-white/10 bg-white/5 p-4 flex items-start justify-between">
            <div className="space-y-1">
                <p className="text-sm font-semibold text-white">{getEmployeeDisplayName(emp)}</p>
                <p className="text-[11px] text-slate-400 uppercase">{`${emp.surname}, ${emp.firstName}`.toUpperCase()}</p>
                <div className="flex gap-6 pt-1 text-xs text-slate-300">
                    <span><span className="text-slate-500">BSB </span>{emp.bsb}</span>
                    <span><span className="text-slate-500">Account </span>{emp.account}</span>
                </div>
            </div>
            <div className="relative">
                <button
                    onClick={() => setOpenEmployeeMenuId(openEmployeeMenuId === emp.id ? null : emp.id)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"
                    aria-label="Row actions"
                >
                    <MoreVertical size={16} />
                </button>
                {openEmployeeMenuId === emp.id && (
                    <div className="absolute right-0 mt-1 z-10 w-32 rounded-lg border border-white/10 bg-slate-800 shadow-lg overflow-hidden">
                        <button
                            onClick={() => { openEmployeeModal('edit', emp); setOpenEmployeeMenuId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
                        >
                            <Edit2 size={14} /> Edit
                        </button>
                        <button
                            onClick={() => { setEmployeeDeleteTarget(emp); setOpenEmployeeMenuId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                        >
                            <Trash2 size={14} /> Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    ))}
</div>

{/* Pagination */}
<div className="flex items-center justify-end gap-2 text-xs">
    <button
        disabled={employeePage === 0}
        onClick={() => setEmployeePage((p) => Math.max(0, p - 1))}
        className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-slate-300 disabled:opacity-40"
    ><ChevronLeft size={14} /></button>
    <button
        disabled={(employeePage + 1) * employeePageSize >= filteredEmployees.length}
        onClick={() => setEmployeePage((p) => p + 1)}
        className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-slate-300 disabled:opacity-40"
    ><ChevronRight size={14} /></button>
</div>

{/* Advanced raw edit (escape hatch) */}
<div>
    <button
        onClick={() => setShowAdvancedEmployee((v) => !v)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
    >
        <ChevronDown size={14} className={showAdvancedEmployee ? 'rotate-180 transition' : 'transition'} />
        Advanced (raw edit)
    </button>
    {showAdvancedEmployee && (
        <div className="mt-2 bg-black/30 rounded-xl border border-white/10 p-1">
            <textarea
                value={employeeRawText}
                onChange={(e) => setEmployeeRawText(e.target.value)}
                className="w-full h-64 bg-transparent border-none text-slate-300 font-mono text-xs p-4 focus:ring-0 resize-y"
                spellCheck={false}
            />
        </div>
    )}
</div>
```

(Note: `openEmployeeModal`, `setEmployeeDeleteTarget` are added in Tasks 8-9. If executing strictly in order, stub them as `() => {}` here and remove the stubs in Tasks 8-9, or implement Tasks 8-9 before this Step's typecheck.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: succeeds (after Tasks 8-9 provide `openEmployeeModal` / `setEmployeeDeleteTarget`).

- [ ] **Step 6: Commit**

```bash
git add App.tsx
git commit -m "feat: payee-list UI for Employee Database (search, pagination, kebab)"
```

---

### Task 8: Add / Edit modal with validation

**Files:**
- Modify: `App.tsx` (state near other Employee state ~1728; handlers near `persistEmployeeList`; modal JSX at end of the Settings panel / component render)

- [ ] **Step 1: Add modal state**

```tsx
type EmployeeDraft = { firstName: string; surname: string; bsb: string; account: string };
const emptyEmployeeDraft: EmployeeDraft = { firstName: '', surname: '', bsb: '', account: '' };
const [employeeModal, setEmployeeModal] = useState<
    { mode: 'add' | 'edit'; id: string | null; draft: EmployeeDraft; errors: Record<string, string> } | null
>(null);
```

- [ ] **Step 2: Add open/validate/save handlers**

Near `persistEmployeeList`:

```tsx
const openEmployeeModal = (mode: 'add' | 'edit', emp?: Employee) => {
    setEmployeeModal({
        mode,
        id: emp?.id ?? null,
        draft: emp
            ? { firstName: emp.firstName, surname: emp.surname, bsb: emp.bsb, account: emp.account }
            : { ...emptyEmployeeDraft },
        errors: {},
    });
};

const validateEmployeeDraft = (d: EmployeeDraft): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!d.firstName.trim()) errors.firstName = 'Required';
    if (!d.surname.trim()) errors.surname = 'Required';
    if (!/^\d{6}$/.test(d.bsb.trim())) errors.bsb = 'BSB must be 6 digits';
    if (!/^\d{6,10}$/.test(d.account.trim())) errors.account = 'Account must be 6–10 digits';
    return errors;
};

const handleSaveEmployeeModal = async () => {
    if (!employeeModal) return;
    const errors = validateEmployeeDraft(employeeModal.draft);
    if (Object.keys(errors).length > 0) {
        setEmployeeModal({ ...employeeModal, errors });
        return;
    }
    const d = employeeModal.draft;
    const rec: Employee = {
        id: employeeModal.id ?? makeEmployeeId(d.firstName, d.surname, d.account, `manual_${Date.now()}`),
        firstName: d.firstName.trim(),
        surname: d.surname.trim(),
        fullName: `${d.firstName.trim()} ${d.surname.trim()}`,
        bsb: d.bsb.trim(),
        account: d.account.trim(),
    };
    await persistEmployeeList(upsertEmployeeById(employeeList, rec));
    setCsvImportMessage(employeeModal.mode === 'add' ? `Added ${rec.fullName}.` : `Updated ${rec.fullName}.`);
    setEmployeeModal(null);
};
```

- [ ] **Step 3: Wire the "Add Employee" header button**

In the Employee Database header button row (~8657), add as the first button:

```tsx
<button
    onClick={() => openEmployeeModal('add')}
    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
>
    <Plus size={14} /> Add Employee
</button>
```

- [ ] **Step 4: Add the modal JSX**

At the end of the component's returned JSX (alongside other modals), add:

```tsx
{employeeModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEmployeeModal(null)}>
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{employeeModal.mode === 'add' ? 'Add employee' : 'Edit employee'}</h3>
                <button onClick={() => setEmployeeModal(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            {(['firstName', 'surname', 'bsb', 'account'] as const).map((field) => {
                const label = field === 'firstName' ? 'First Name' : field === 'surname' ? 'Surname' : field === 'bsb' ? 'BSB' : 'Account number';
                return (
                    <div key={field} className="space-y-1">
                        <label className="text-xs uppercase tracking-wider text-slate-400">{label}</label>
                        <input
                            value={employeeModal.draft[field]}
                            onChange={(e) => setEmployeeModal({ ...employeeModal, draft: { ...employeeModal.draft, [field]: e.target.value }, errors: { ...employeeModal.errors, [field]: '' } })}
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                        />
                        {employeeModal.errors[field] && <p className="text-[11px] text-red-400">{employeeModal.errors[field]}</p>}
                    </div>
                );
            })}
            <p className="text-[11px] text-slate-500">Account name: {`${employeeModal.draft.surname}, ${employeeModal.draft.firstName}`.toUpperCase()}</p>
            <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEmployeeModal(null)} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold uppercase tracking-wider">Cancel</button>
                <button onClick={handleSaveEmployeeModal} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Save size={14} /> Save</button>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual verification**

`npm run dev` → Settings → Add Employee → leave BSB blank → Save → inline "BSB must be 6 digits".
Fill valid values → Save → card appears, count increments. Edit a card → change BSB → persists.

- [ ] **Step 7: Commit**

```bash
git add App.tsx
git commit -m "feat: Add/Edit employee modal with validation"
```

---

### Task 9: Delete confirmation

**Files:**
- Modify: `App.tsx` (state ~1728; handler near `persistEmployeeList`; confirm JSX alongside the modal)

- [ ] **Step 1: Add delete state + handler**

```tsx
const [employeeDeleteTarget, setEmployeeDeleteTarget] = useState<Employee | null>(null);

const handleConfirmDeleteEmployee = async () => {
    if (!employeeDeleteTarget) return;
    await persistEmployeeList(removeEmployeeById(employeeList, employeeDeleteTarget.id));
    setCsvImportMessage(`Deleted ${getEmployeeDisplayName(employeeDeleteTarget)}.`);
    setEmployeeDeleteTarget(null);
};
```

- [ ] **Step 2: Add confirm dialog JSX**

Alongside the Add/Edit modal:

```tsx
{employeeDeleteTarget && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEmployeeDeleteTarget(null)}>
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white">Delete employee?</h3>
            <p className="text-sm text-slate-300">
                {getEmployeeDisplayName(employeeDeleteTarget)} — Account {employeeDeleteTarget.account}. This removes them from the active list.
            </p>
            <div className="flex justify-end gap-2">
                <button onClick={() => setEmployeeDeleteTarget(null)} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold uppercase tracking-wider">Cancel</button>
                <button onClick={handleConfirmDeleteEmployee} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Trash2 size={14} /> Delete</button>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

`npm run dev` → kebab → Delete → confirm → card disappears, count decrements.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat: delete-employee confirmation"
```

---

### Task 10: Full health check

**Files:** none (verification only)

- [ ] **Step 1: Run the full health script**

Run: `npm run health`
Expected: typecheck clean, all jest tests pass, build succeeds.

- [ ] **Step 2: Manual end-to-end**

`npm run dev`, then in Settings → Employee Database:
1. Upload `Updated Details (26.06.26).xlsx` → merge message sane.
2. Search a name → list filters; pagination works.
3. Add an employee → appears.
4. Edit that employee's account → persists (reload page; value retained).
5. Delete it → gone.

- [ ] **Step 3: Final commit (if any stray changes)**

```bash
git add -A
git commit -m "chore: employee database payee-list final verification"
```

---

## Self-Review Notes

- **Spec coverage:** list UI + search + pagination (Task 7), Add/Edit modal core-4 + validation (Task 8), Delete (Task 9), xlsx+csv smart-merge upload + approval queue retained (Tasks 4, 6), serialize delimiter fix (Task 1), central persist + DRY (Task 5), tests for merge/upsert/remove/xlsx/round-trip (Tasks 1-4). All spec sections mapped.
- **No BSB lookup / no new stored fields** — honored (modal is core-4 only; no Supabase schema change).
- **Type consistency:** `Employee`, `mergeEmployeesByAccount`, `upsertEmployeeById`, `removeEmployeeById`, `xlsxRowsToRawText`, `makeEmployeeId`, `persistEmployeeList`, `openEmployeeModal`, `employeeDeleteTarget` names used consistently across tasks.
- **Cross-task dependency note:** Task 7 references `openEmployeeModal` (Task 8) and `setEmployeeDeleteTarget` (Task 9). If executing strictly top-to-bottom, defer Task 7's typecheck/build until 8-9 are in, or stub then unstub (noted inline). Subagent-driven execution should land 7-9 before the next green build.
