# Aspire Homes Reimbursement Audit — AI Agent Turnover Document
**Date of session:** 11 May 2026
**Prepared by:** Claude (Cowork Mode)
**For:** Any future AI agent continuing this work for Maggie Garcia

---

## 1. WHO IS MAGGIE AND WHAT IS HER DAILY JOB

Maggie works at Aspire Homes as a reimbursement auditor. Her daily task:

1. **Receive emails** at `reimbursement@aspire-homes.com.au` (Outlook) with reimbursement forms + receipt photos attached
2. **Audit each email** — verify that the reimbursement form total matches the receipts total
3. **Encode PASS entries** into a custom web app as "Pending" (awaiting NAB bank code before payment)
4. **Flag REVIEW entries** — save to CSV for follow-up (missing receipts, self-approval, amount mismatch, etc.)

---

## 2. TOOLS IN PLAY

| Tool | Purpose |
|------|---------|
| **Outlook** (reimbursement@aspire-homes.com.au) | Source of all reimbursement emails |
| **Custom ChatGPT** | Maggie manually drags receipt images → it extracts structured receipt data in pipe-separated markdown format |
| **Aspire Reimbursement Auditor app** | Local web app at `http://localhost:3000` — Maggie's database. Has Solo Mode, Group Mode, Manual Mode, Receipt Mode |
| **Claude (you)** | Audits emails, saves PASS entries to app via `window.claudeAPI`, puts REVIEW entries in CSV |

---

## 3. REIMBURSEMENT FORM FORMAT (what goes in the app's left field)

```
Client's full name: [name]
Address: [address]
Staff member to reimburse: [name]
Approved by: [name]

Particular | Date Purchased | Amount | On Charge Y/N
[category] | [date DD/MM/YYYY] | $[amount] | [Y or N]

Total Amount: $[total]
```

---

## 4. RECEIPT DETAILS FORMAT (what goes in the app's right field)

This is the exact format from Maggie's Custom ChatGPT. Use this EXACTLY:

```
Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Grand Total of All Receipts | Notes
1 | [RRN or Auth code] | [Store Name] | [DD MMM YYYY HH:MM] | [Item description] | [Category from approved list] | $[item amount] | $[receipt total — only on FIRST row of each receipt, $0.00 for rest] | $[grand total — only on VERY FIRST row, $0.00 for rest] | [- or note]
```

**Date format MUST be:** DD MMM YYYY (e.g., 08 May 2026)

**Approved Category List:**
Activities/incentive, Groceries, Other Expenses-Activity, Other Expenses-Appliances, Other Expenses-Clothing, Other Expenses-Family Contact, Other Expenses-Food, Other Expenses-Haircut, Other Expenses-Home Improvement, Other Expenses-Medication, Other Expenses-Mobile, Other Expenses-Parking, Other Expenses-Phone, Other Expenses-School Supplies, Other Expenses-Shopping, Other Expenses-Sports, Other Expenses-Toy, Other Expenses-Transportation, Pocket Money, Takeaway, Other Expenses-Office Supplies, Other Expenses-School Holiday, Other Expenses-Approved by DCJ, Other Expenses-Petty Cash, Other Expenses-School Activity

**Receipt Total rule:** Show the total only on the first item row of each receipt. For all other rows of the same receipt: `$0.00`

**Grand Total rule:** Show the combined total of ALL receipts only on the very first row. All other rows: `$0.00`

---

## 5. AUDIT WORKFLOW (what Claude does per email)

1. Open email in Outlook
2. Open the reimbursement form attachment (usually .docx) → read all fields
3. Open each receipt image → zoom in to read:
   - Store name, date, time
   - Individual items and amounts
   - Receipt total
   - Unique ID (RRN > ARN > Auth code > receipt number)
4. Check: **Does form total = sum of all receipt totals?**
5. Check: **Are all receipts readable?**
6. Check: **Any flags?** (self-approval, missing receipt, >$300, >60 days old, name mismatch)
7. If **PASS** → save to app as Pending via `window.claudeAPI.submitPending()`
8. If **REVIEW** → add to CSV file

---

## 6. THE APP — HOW CLAUDE SAVES ENTRIES (window.claudeAPI)

The app has a hidden programmatic API added by Claude specifically for automation. It bypasses all UI interaction.

**App URL (local):** `http://localhost:3000`
**App must be running:** `cd "C:\Users\Admin\Desktop\App\Aspire Reimbursement" && npm run dev`

### How to save as Pending:
```javascript
// In browser via mcp__Claude_in_Chrome__javascript_tool
const formText = `Client's full name: Hezekiah & Rollo Hinton
Address: 15 Planthopper Street, Melonba
Staff member to reimburse: Maria Tuuholoaki
Approved by: Ana Mafoa

Particular | Date Purchased | Amount | On Charge Y/N
Takeaway | 08/05/2026 | $27.45 | N
Family Contact - Parking | 08/05/2026 | $5.58 | Y

Total Amount: $33.03`;

const receiptText = `Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Grand Total of All Receipts | Notes
1 | Receipt #249 | McDonalds Marsden Park | 08 May 2026 17:31 | 2x McNugget Meal + sides | Takeaway | $27.45 | $27.45 | $33.03 | -
2 | TRAN:0000001c020e39fd | City of Parramatta Council | 08 May 2026 16:51 | Parking - Square EX212 | Other Expenses-Parking | $5.58 | $5.58 | $0.00 | On Charge Y`;

const result = await window.claudeAPI.submitPending(formText, receiptText);
console.log(result.message);
// Returns: ✅ Saved as Pending: Maria Tuuholoaki $33.03
```

### How to check current pending list:
```javascript
window.claudeAPI.listPending()
```

### Where claudeAPI is defined in the code:
`App.tsx` — `useEffect` block just before `if (loadingSplash)` (search for `CLAUDE API` comment)

---

## 7. CSV FILE FOR REVIEW EMAILS

**File location:** `C:\Users\Admin\Documents\Claude\Projects\aspirehomes\Reimbursement_Audit_Sample.csv`

**CSV Headers:**
`Sender Name, Email Date, Reimbursement Form, Receipt Details, Audit Status, Audit Notes`

**Emails flagged as REVIEW (do NOT save to app — need human follow-up):**

| Sender | Amount | Reason |
|--------|--------|--------|
| Gabriele Blaauw | $307.90 | Self-approved + missing receipt for Clothing/Shoes $237 (On Charge Y) |
| Adrian Russell | $330.00 | Group petty cash form (non-standard) — no individual receipts attached |
| Ana Mafoa (for Jerisa Nigo) | $36.70 | Self-approved by Jerisa Nigo + Bolt cutter listed but no amount/receipt |

---

## 8. STATUS OF 5 SAMPLE EMAILS (from 11 May 2026 session)

| # | Sender | Client | Amount | Audit | App Status |
|---|--------|--------|--------|-------|-----------|
| 1 | **Nadia White** | Boney Siblings | $451.00 | ✅ PASS | ✅ **In Pending** (was already there) |
| 2 | **Gabriele Blaauw** | Logan Out | $307.90 | ⚠️ REVIEW | 📄 In CSV |
| 3 | **Adrian Russell** | N/A (Group) | $330.00 | ⚠️ REVIEW | 📄 In CSV |
| 4 | **Ana Mafoa** (Jerisa Nigo) | Casey & Emily Mckenzie | $36.70 | ⚠️ REVIEW | 📄 In CSV |
| 5 | **Ana Mafoa** (Maria Tuuholoaki) | Hezekiah & Rollo Hinton | $33.03 | ✅ PASS | ✅ **Saved (11 May 2026)** |

> **Email #5 COMPLETE:** Maria Tuuholoaki $33.03 saved to app via claudeAPI. Use `window.claudeAPI.submitPending()` with the formText and receiptText from Section 6 above.

---

## 9. EMAILS STILL TO AUDIT (in Inbox as of 11 May 2026)

The inbox was scrolled through. Emails from oldest to newest after the 5 samples:

- Ana Mafoa — REIMBURSEMENT - SATISI LIKIAFU 8/5/26 (Fri 21:27)
- Isha Jalloh — Reimbursement (Sat 09:31, 09:43, 10:15)
- Tagilima Maua — Brendan Reimbursement (Sat 11:49, 12:06, 12:15, 12:25, 12:33)
- Tagilima Maua — Atanah Reimbursement (Sat 12:25)
- Jade Nwokedi — Reimbursement (Sat 18:36, 18:53)
- Chinh Nguyen — Reimbursement for Chinh Nguyen (Sun 22:45)
- Jo-anne Yeo — Reimbursement - Jett Oldfield (Sun 22:03)
- Ljiljana Jojic — Reimbursement for Ljiljana Jojic (Sun 20:39)
- Tim Oliver — Barry Siblings Reimbursements (Sun 18:33)
- Clifford Ubiebi — Reimbursement (Sun 15:56)
- Alicia Wilson — Approved Reimbursement - Hoorulain Affendi (Today x3: 06:57, 06:59, 07:10)

**Total inbox unread as of session end:** ~38 emails

---

## 10. EXISTING PENDING ENTRIES IN APP (as of 11 May 2026)

These 9 entries already existed — do NOT duplicate:

| Name | Amount | Oldest Pending |
|------|--------|---------------|
| Kristie Kolokythas | $1,080.75 | 59 days |
| Julius Taavao | $1,100.00 | 59 days |
| Kieren Biggs | $572.00 | 59 days |
| Xavier Solomua | $42.16 | 55 days |
| Ally Hayes | $10.70 | 30 days |
| Dean Masters | $9.10 | 23 days |
| Amit Kumar | $89.95 | 3 days |
| **Nadia White** | **$451.00** | 3 days |
| Henry Adile | $82.60 | 2 days |

> Always run `window.claudeAPI.listPending()` or search the Pending section before saving to avoid duplicates.

---

## 11. HOW TO START A NEW AUDIT SESSION

1. Start the local app: `cd "C:\Users\Admin\Desktop\App\Aspire Reimbursement" && npm run dev`
2. Navigate to Outlook: `reimbursement@aspire-homes.com.au`
3. Start from oldest unread email
4. For each email:
   - If **form + receipts match** and **no flags** → `window.claudeAPI.submitPending(formText, receiptText)`
   - If **issues found** → add row to `Reimbursement_Audit_Sample.csv` with `REVIEW` status
5. Navigate to `http://localhost:3000` to verify entries saved in Pending section

---

## 12. AUDIT FLAGS REFERENCE (when to mark REVIEW)

| Flag | Description |
|------|-------------|
| Amount mismatch | Form total ≠ receipt total |
| Missing receipt | Item on form but no receipt photo |
| Unreadable receipt | Too blurry / dark to verify amount |
| Self-approved | Approved by = Staff member to reimburse |
| >$300 | Needs Julian's approval before saving as Pending |
| >60 days old | Receipts older than 60 days — needs Julian's approval |
| Duplicate photo | Same receipt photographed twice (count only once) |
| Group form | Non-standard format (like Adrian Russell's petty cash) — no individual receipts |
| Name correction | Staff name was corrected via follow-up email |

---

## 13. FILE LOCATIONS

| File | Path |
|------|------|
| Audit CSV | `C:\Users\Admin\Documents\Claude\Projects\aspirehomes\Reimbursement_Audit_Sample.csv` |
| This turnover doc | `C:\Users\Admin\Documents\Claude\Projects\aspirehomes\TURNOVER.md` |
| App source code | `C:\Users\Admin\Desktop\App\Aspire Reimbursement\App.tsx` |
| App logic (Solo) | `C:\Users\Admin\Desktop\App\Aspire Reimbursement\logic\modes\soloMode.ts` |

---

*End of turnover document — prepared 11 May 2026*
