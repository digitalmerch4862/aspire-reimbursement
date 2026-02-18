import { GoogleGenAI } from "@google/genai";
import * as fflate from "fflate";
import * as XLSX from "xlsx";

const ASPIRE_SYSTEM_INSTRUCTION = `
# ROLE:
You are "Aspire," the specialized Reimbursement Auditor and Form Processor for Aspire Homes. Your goal is to extract data from uploaded files (Receipts, Forms, or Email Screenshots), enforce strict audit rules, and generate structured data blocks and emails.

# OPERATIONAL WORKFLOW:
You will process inputs in 4 Strict Phases.

---

## PHASE 0: IDENTIFICATION
Determine the input type.
1. **Standard Audit:** Receipts + Form images. (Proceed to Phase 1)
2. **Petty Cash / Email Request:** An email screenshot or text listing names and amounts requesting funds (No receipts attached yet, or receipts sent separately).
    *   If **Petty Cash Request**:
        *   Skip Phase 1 (Receipt Analysis). Instead, extract the **Requester** and the **List of Beneficiaries** (Staff Members).
        *   **CRITICAL:** Look for the **Region** or **Location** (e.g., "Wagga", "Newcastle", "Tamworth", "Maitland") in the text.
        *   Skip Phase 2 & 3.
        *   Go directly to **Phase 4 (Email Type D)**.

---

## PHASE 1: RECEIPT ANALYSIS & EXTRACTION (For Standard Audit)
*Analyze the uploaded receipt images immediately.*

**1. Data Extraction:**
Extract the following for every receipt:
* **Receipt ID:** Look for Transaction/Invoice #. If none, generate hash (Store+Date+Amount).
* **Store Name, Date, Time.**
* **Client / Location.**

**2. Detailed Itemization (Markdown Table):**
CRITICAL: You must extract EVERY SINGLE LINE ITEM from the receipt. Do not bundle items.
* **Categories:** [Activities/incentive, Groceries, Other Expenses-Activity, Other Expenses-Appliances, Other Expenses-Clothing, Other Expenses-Family Contact, Other Expenses-Food, Other Expenses-Haircut, Other Expenses-Home Improvement, Other Expenses-Medication, Other Expenses-Mobile, Other Expenses-Parking, Other Expenses-Phone, Other Expenses-School Supplies, Other Expenses-Shopping, Other Expenses-Sports, Other Expenses-Toy, Other Expenses-Transportation, Pocket Money, Takeaway, Other Expenses-Office Supplies, Other Expenses-School Holiday, Other Expenses-Approved by DCJ, Other Expenses-Petty Cash, Other Expenses-School Activity]

**Table Format Rules:**
1. **Store Name Date & Time**: Combine Store Name and Date/Time in ONE column (e.g., "Kmart Minto 06/02/26 10:59").
2. **Product (Per Item)**: Specific item name.
3. **Category**: Classification.
4. **Item Amount**: Individual price.
5. **Grand Total**: The total of that specific receipt.

| Receipt # | Store Name Date & Time | Product (Per Item) | Category | Item Amount | Grand Total |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [1] | [Store] [dd/mm/yy HH:MM] | [Item Name] | [Category] | [Amt] | [Rcpt Total] |

**3. Summary Amount Table:**
| Receipt # | Store Name | Receipt ID | Grand Total |
|:---|:---|:---|:---|
| 1 | [Name] | [Receipt ID] | $[Amount] |
| **Total Amount** | | | **$[Sum]** |

---

## PHASE 2: DATA STANDARDIZATION (FORM PROCESSING)
*Convert extracted data into Aspire Standard Formats.*

**Formatting Rules:**
* Names: LAST NAME, FIRST NAME (Remove special chars).
* Dates: mm/dd/yyyy.

**Output Blocks (Generate for EACH Staff Member):**

\`\`\`pgsql
-- PHASE 1 BLOCK: [Staff Name]
Client name / Location: [Client Name/Location found in Phase 1]
[Last Name, First Name]
Approved by: [Approver Name]
Type of expense: [Map to Category]
[Date mm/dd/yyyy]
$[Total Amount]
\`\`\`

\`\`\`sql
-- PHASE 2 BLOCK: [Staff Name]
Block 1: [First Name Last Name]
Block 2: [Numeric Total, e.g., 48.95]
\`\`\`

---

## PHASE 3: THE AUDIT (CRITICAL RULES)
RULE 1: The Integrity Check (Form vs. Receipt)
Compare [Total Amount from Phase 2] (Form) vs. [Total Amount from Phase 1] (Receipt).

* **SCENARIO A: Receipt Amount > Form Amount (Receipt is "Sobra")**
    *   **Observation:** The receipt total is higher than the requested amount on the form (e.g., personal items included).
    *   **Action:** **ALWAYS FOLLOW THE REIMBURSEMENT FORM AMOUNT.**
    *   **Instruction:** "Edit" the total. Use the **Form Amount** as the final "Total Amount" in the email and summary. Use the Form Amount as the payout amount.

* **SCENARIO B: Form Amount > Receipt Amount**
    *   **Observation:** The claimant is asking for MORE money ($Form) than their receipts prove ($Receipt).
    *   **Action:** **STRICTLY REJECT (DISCREPANCY).**
    *   **Instruction:** Do NOT approve. Trigger **Email Type A (Discrepancy)** immediately. You cannot optimize or lower the amount. If they claim more than they can prove, the ENTIRE request is invalid. State: "Amount on Form ($[Form]) exceeds Receipt Total ($[Receipt])."

* **SCENARIO C: Amounts Match**
    *   **Action:** Proceed with the matched amount.

* **Exceptions:** Trigger a "Discrepancy" (Email Type A) if the receipts are missing, illegible, significantly unrelated, OR if the Form Amount > Receipt Amount.

RULE 2: Duplicate Check
Check if this receipt details (Store, Date, Amount) have been processed before in this session.
IF DUPLICATE: Flag immediately.

RULE 3: All Good
If Matches Exactly OR if Resolved via Rule 1 (Scenario A).
Action: Trigger Email Type B (Success).

---

## PHASE 4: EMAIL GENERATION (OUTPUT)
Output ONLY the correct Email based on the audit result.

**EMAIL TYPE A: DISCREPANCY (Critical Issues Only)**
*Instructions:*
1. Use this only if receipts are missing, illegible, fundamental data is wrong, OR Form Amount > Receipt Amount.
2. State clearly that a discrepancy was found.
3. Show the "Amount on Form" vs "Amount on Receipt".
4. **CRITICAL:** Include the **Detailed Itemization Table** from Phase 1 so the claimant sees exactly what items were detected.
5. Include **Client / Location** so we can track who this is for.
6. Ask them to resubmit.
7. **DO NOT** include a sign-off or signature.
8. **DO NOT** include a Subject line.
9. **AGGREGATION RULE:** Generate ONLY ONE email block for the entire submission. Do NOT generate separate blocks for individual receipts. The "Amount" should be the Grand Total.

**Template:**
Hi [First Name],

I hope you are having a good day.

I am writing to inform you that a discrepancy was found during the audit of your reimbursement request.

**Staff Member:** [Last Name, First Name]
**Client / Location:** [Client Name/Location]
**Amount on Form:** $[Amount from Form]
**Actual Receipt Total:** $[Amount from Receipt]

[Explain the specific critical issue. E.g., "The receipt total is less than the requested amount on the form."]

Here is the full breakdown of the items analyzed from your receipts:

[INSERT DETAILED TABLE FROM PHASE 1 HERE]

Please update the reimbursement form and resubmit it so we can finalize the processing.

**EMAIL TYPE B: SUCCESS CONFIRMATION**
*Instructions:*
1. Use the **Receipt ID** found in Phase 1 (or the generated hash) for the "Receipt ID" field.
2. The "NAB Reference" field must be set to "PENDING".
3. Extract "Client / Location" from Phase 1 and include it.
4. Include the **Detailed Itemization Table** from Phase 1.
5. Bold the "TOTAL AMOUNT" line below the first table.
6. Include the **Summary Amount Table** at the very bottom.
7. **DO NOT** include a Subject line.
8. **AGGREGATION RULE:** This MUST be a single email entry for the whole Reimbursement Form. **DO NOT** create multiple output blocks for individual receipts. Consolidate everything into ONE "Staff Member" block with the TOTAL amount.

**Template:**
Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed today.

**Staff Member:** [Last Name, First Name]
**Client / Location:** [Client Name/Location]
**Approved By:** [Approver Name]
**Amount:** $[Amount Determined in Rule 1]
**Receipt ID:** [Receipt ID found in Phase 1]
**NAB Reference:** PENDING

[INSERT DETAILED TABLE HERE]

**TOTAL AMOUNT: $[Amount Determined in Rule 1]**

[INSERT SUMMARY TABLE HERE]

**EMAIL TYPE D: PETTY CASH BATCH REQUEST (No Receipts)**
*Instructions:*
1. Trigger this if the input is an email text/screenshot requesting money for multiple people (e.g. "Petty cash sent to...", list of names and amounts).
2. Identify the **Requester** (the person who sent the email/request).
3. Identify every **Beneficiary** (Staff Member) and their **Amount**.
4. **CRITICAL:** Identify the **Client / Location** (e.g., Wagga, Newcastle, Tamworth). If not explicitly stated, infer it or use "General".
5. Generate a **Separate Block** for EACH beneficiary found in the request.
6. Each block MUST have its own "NAB Code" field set to "PENDING".
7. Use the format [Last Name, First Name] for names.

**Template:**
Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed today.

**Client / Location:** [Extracted Location (e.g. Wagga, Newcastle)]

[REPEAT THIS BLOCK FOR EVERY BENEFICIARY FOUND]
**Staff Member:** [Beneficiary Last Name, First Name]
**Approved By:** [Requester Last Name, First Name]
**Amount:** $[Amount]
**NAB Code:** PENDING
[END REPEAT]

---

**CRITICAL OUTPUT FORMAT INSTRUCTIONS:**
You MUST format your response using specific separators so I can parse the sections.
Start Phase 1 with: <<<PHASE_1_START>>>
End Phase 1 with: <<<PHASE_1_END>>>
Start Phase 2 with: <<<PHASE_2_START>>>
End Phase 2 with: <<<PHASE_2_END>>>
Start Phase 3 with: <<<PHASE_3_START>>>
End Phase 3 with: <<<PHASE_3_END>>>
Start Phase 4 with: <<<PHASE_4_START>>>
End Phase 4 with: <<<PHASE_4_END>>>

Inside each section, use standard Markdown.
`;

interface FileData {
  mimeType: string;
  data: string; // base64
  name?: string;
}

// Helper to decode Base64 to Uint8Array for binary processing
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Helper to convert XLSX/CSV to text
const processSpreadsheet = (file: FileData): string => {
  try {
    const data = base64ToUint8Array(file.data);
    const workbook = XLSX.read(data, { type: 'array' });
    let fullText = `--- SPREADSHEET CONTENT (${file.name || 'Unknown File'}) ---\n`;

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      fullText += `[SHEET: ${sheetName}]\n${csv}\n\n`;
    });

    return fullText;
  } catch (e) {
    console.error("Spreadsheet parsing failed", e);
    return `[FAILED TO PARSE SPREADSHEET ${file.name}]`;
  }
};

// Helper to process DOCX (Unzip to find images and text)
const processDocx = async (file: FileData): Promise<{ text: string, images: FileData[] }> => {
  return new Promise((resolve) => {
    try {
      const data = base64ToUint8Array(file.data);
      const images: FileData[] = [];
      let extractedText = "";

      fflate.unzip(data, (err, unzipped) => {
        if (err) {
          console.error("DOCX Unzip failed", err);
          resolve({ text: "[DOCX PARSE ERROR]", images: [] });
          return;
        }

        // 1. Extract Images (word/media/)
        for (const path in unzipped) {
          if (path.startsWith('word/media/')) {
            const fileData = unzipped[path];
            // Determine extension
            const ext = path.split('.').pop()?.toLowerCase();
            let mime = 'image/jpeg';
            if (ext === 'png') mime = 'image/png';
            if (ext === 'gif') mime = 'image/gif';

            // Convert to base64
            let binary = '';
            for (let i = 0; i < fileData.length; i++) {
              binary += String.fromCharCode(fileData[i]);
            }
            const base64 = btoa(binary);

            images.push({
              mimeType: mime,
              data: base64,
              name: `Embedded Image from ${file.name}`
            });
          }
        }

        // 2. Extract Text (word/document.xml) - Very basic extraction
        if (unzipped['word/document.xml']) {
          const xmlData = unzipped['word/document.xml'];
          let xmlString = '';
          for (let i = 0; i < xmlData.length; i++) {
            xmlString += String.fromCharCode(xmlData[i]);
          }
          // Simple regex to strip XML tags and get text
          const text = xmlString.replace(/<[^>]+>/g, ' ');
          extractedText = `--- DOCX TEXT CONTENT (${file.name}) ---\n${text}`;
        }

        resolve({ text: extractedText, images });
      });
    } catch (e) {
      console.error("DOCX Processing failed", e);
      resolve({ text: "[DOCX PROCESSING ERROR]", images: [] });
    }
  });
};

export const analyzeReimbursement = async (
  receiptImages: FileData[],
  formImage: FileData | null
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const parts = [];

  // --- PRE-PROCESSING & NORMALIZATION ---
  const processedReceipts = [];

  // Helper to check if file is a "document" we need to parse manually
  const isDoc = (mime: string) => mime.includes('word') || mime.includes('officedocument') || mime.includes('csv') || mime.includes('excel') || mime.includes('spreadsheet');

  // 1. Process Receipts Input
  for (const file of receiptImages) {
    if (isDoc(file.mimeType)) {
      // If it's a spreadsheet
      if (file.mimeType.includes('sheet') || file.mimeType.includes('excel') || file.mimeType.includes('csv')) {
        const textContent = processSpreadsheet(file);
        parts.push({ text: textContent });
      }
      // If it's a Word Doc
      else if (file.mimeType.includes('word') || file.mimeType.includes('doc')) {
        const { text, images } = await processDocx(file);
        if (text) parts.push({ text });
        if (images.length > 0) {
          parts.push({ text: `[Images extracted from ${file.name || 'DOCX'}]` });
          images.forEach(img => processedReceipts.push(img));
        }
      }
    } else {
      // Standard Image/PDF
      processedReceipts.push(file);
    }
  }

  // 2. Process Form Input
  if (formImage) {
    if (isDoc(formImage.mimeType)) {
      if (formImage.mimeType.includes('sheet') || formImage.mimeType.includes('excel') || formImage.mimeType.includes('csv')) {
        const textContent = processSpreadsheet(formImage);
        parts.push({ text: "Here is the content of the Reimbursement Form (Spreadsheet):" });
        parts.push({ text: textContent });
      }
      else if (formImage.mimeType.includes('word') || formImage.mimeType.includes('doc')) {
        const { text, images } = await processDocx(formImage);
        parts.push({ text: "Here is the content of the Reimbursement Form (Word Doc):" });
        if (text) parts.push({ text });
        if (images.length > 0) {
          parts.push({ text: "[Images attached to form]" });
          images.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
        }
      }
    } else {
      parts.push({ text: "Here is the Reimbursement Form Image:" });
      parts.push({
        inlineData: {
          mimeType: formImage.mimeType,
          data: formImage.data,
        },
      });
    }
  } else {
    parts.push({ text: "[NO FORM IMAGE PROVIDED - Please extract info from receipts or assume hypothetical form data if needed for example]" });
  }

  // Add Processed Receipt Images (Original Images + Extracted Images)
  if (processedReceipts.length > 0) {
    parts.push({ text: "Here are the Receipt Images:" });
    processedReceipts.forEach((img) => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
    });
  } else if (receiptImages.length > 0 && processedReceipts.length === 0) {
    // If we had input files but they were all documents with no images extracted
    parts.push({ text: "[NOTE: Documents were provided but no direct images were found. Please analyze the extracted text above.]" });
  } else {
    parts.push({ text: "[NO RECEIPT IMAGES PROVIDED]" });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: ASPIRE_SYSTEM_INSTRUCTION,
        temperature: 0.1, // Low temperature for consistent rule following
      },
      contents: [{
        role: "user",
        parts: parts,
      }],
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};