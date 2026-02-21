import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Upload, X, FileText, FileSpreadsheet, CheckCircle, Loader2,
    HelpCircle, AlertCircle, RefreshCw, Send, LayoutDashboard, Edit2, Check,
    Copy, CreditCard, ClipboardList, Calendar, BarChart3, PieChart, TrendingUp,
    Users, Database, Search, Download, Save, CloudUpload, Trash2
} from 'lucide-react';
import FileUpload from './components/FileUpload';
import MarkdownRenderer from './components/MarkdownRenderer';
import Logo from './components/Logo';
import { FileWithPreview, ProcessingResult, ProcessingState } from './types';
import { supabase } from './services/supabaseClient';

// Default Data for Employee List
const DEFAULT_EMPLOYEE_DATA = `First Names	Surname	Concatenate	BSB	Account
John	Smith	Smith, John	000000	00000000
Jane	Doe	Doe, Jane	000000	00000000`;

interface Employee {
    firstName: string;
    surname: string;
    fullName: string;
    bsb: string;
    account: string;
}

const parseEmployeeData = (rawData: string): Employee[] => {
    return rawData.split('\n')
        .slice(1) // Skip header
        .filter(line => line.trim().length > 0)
        .map(line => {
            const cols = line.split('\t');
            if (cols.length < 3) return null; // Relaxed check
            return {
                firstName: cols[0]?.trim() || '',
                surname: cols[1]?.trim() || '',
                fullName: cols[2]?.trim() || `${cols[1] || ''}, ${cols[0] || ''}`,
                bsb: cols[3]?.trim() || '',
                account: cols[4]?.trim() || ''
            };
        })
        .filter(item => item !== null) as Employee[];
};

const findBestEmployeeMatch = (scannedName: string, employees: Employee[]): Employee | null => {
    if (!scannedName) return null;
    const normalizedInput = scannedName.toLowerCase().replace(/[^a-z ]/g, '');
    let bestMatch: Employee | null = null;

    for (const emp of employees) {
        const full = emp.fullName.toLowerCase();
        if (normalizedInput.includes(full) || full.includes(normalizedInput)) {
            return emp;
        }
    }
    return null;
};

const stripUidFallbackMeta = (text: string): string => {
    return text.replace(/<!--\s*UID_FALLBACKS:.*?-->\s*/gi, '');
};

const stripClientLocationLine = (text: string): string => {
    return String(text || '')
        .replace(/^\*\*Client\s*\/\s*Location:\*\*\s*.*(?:\r?\n|$)/gim, '')
        .replace(/^Client\s*\/\s*Location:\s*.*(?:\r?\n|$)/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const stripClientLocationFromElement = (element: HTMLElement): void => {
    const targets = element.querySelectorAll('p, li, div, span, td, th');
    targets.forEach((node) => {
        const text = String(node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (text.startsWith('client / location:')) {
            node.remove();
        }
    });
};

const isValidNabReference = (value: string | null | undefined): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;

    const invalidValues = [
        'pending',
        'nab code is pending',
        'n/a',
        'enter nab code',
        'enter nab reference',
        '[enter nab code]',
        '[enter nab reference]'
    ];

    return !invalidValues.includes(normalized);
};

const isPendingNabCodeValue = (value: string | null | undefined): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return [
        'pending',
        'nab code is pending',
        'enter nab code',
        'enter nab reference',
        '[enter nab code]',
        '[enter nab reference]'
    ].includes(normalized);
};

const extractFieldValue = (content: string, patterns: RegExp[]): string => {
    for (const pattern of patterns) {
        const match = content.match(pattern);
        const value = match?.[1]?.replace(/\*\*/g, '').trim();
        if (value) return value;
    }
    return '';
};

interface NormalizedReceiptRow {
    receiptNum: string;
    uniqueId: string;
    storeName: string;
    dateTime: string;
    product: string;
    category: string;
    itemAmount: string;
    receiptTotal: string;
    notes: string;
}

interface ManualAuditIssue {
    level: 'warning' | 'error';
    message: string;
}

interface PendingStaffGroup {
    key: string;
    staffName: string;
    records: any[];
    count: number;
    latestDate: string;
    oldestAgeDays: number;
}

interface GroupPettyCashEntry {
    staffName: string;
    amount: number;
}

interface InputTransactionFingerprint {
    staffName: string;
    amount: number;
    uid: string;
    storeName: string;
    rawDate: string;
    dateKey: string;
    signatureKey: string;
}

interface RuleStatusItem {
    id: string;
    title: string;
    detail: string;
    severity: 'critical' | 'high' | 'medium' | 'info';
    status: 'pass' | 'warning' | 'blocked';
}

interface RuleConfig {
    id: string;
    title: string;
    detail: string;
    severity: 'critical' | 'high' | 'medium' | 'info';
    enabled: boolean;
    isBuiltIn: boolean;
    updatedAt: string;
}

interface RulePendingAction {
    type: 'add' | 'edit' | 'delete';
    ruleId?: string;
    nextRule?: RuleConfig;
}

type DuplicateTrafficLight = 'red' | 'yellow' | 'green';

interface DuplicateMatchEvidence {
    txStaffName: string;
    txDateKey: string;
    txAmount: string;
    txReference: string;
    historyStaffName: string;
    historyDateKey: string;
    historyAmount: string;
    historyReference: string;
    historyProcessedAt: string;
}

interface DuplicateCheckResult {
    signal: DuplicateTrafficLight;
    redMatches: DuplicateMatchEvidence[];
    yellowMatches: DuplicateMatchEvidence[];
}

interface SaveModalDecision {
    mode: 'nab' | 'red' | 'yellow';
    detail: string;
}

type RequestMode = 'solo' | 'group';

type QuickEditFieldKey =
    | 'staffMember'
    | 'clientFullName'
    | 'clientLocation'
    | 'address'
    | 'approvedBy'
    | 'amount'
    | 'receiptId'
    | 'nabCode';

interface QuickEditFieldConfig {
    key: QuickEditFieldKey;
    label: string;
}

interface QuickEditFieldState extends QuickEditFieldConfig {
    value: string;
    missing: boolean;
}

const DELETE_RULE_CONFIRMATION_PHRASE = 'yes i have decided to delete this rule with my own risk';

const getDefaultBuiltInRules = (): RuleConfig[] => {
    const now = new Date().toISOString();
    return [
        { id: 'r1', title: 'Duplicate in Current Upload', detail: 'Checks duplicate receipts in current upload.', severity: 'high', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r2', title: 'Already Processed Check', detail: 'Checks if receipt appears in processed history.', severity: 'critical', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r3', title: 'Amount Threshold (> $300)', detail: 'Flags transactions that exceed $300.', severity: 'medium', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r4', title: 'Receipt Age (> 30 days)', detail: 'Flags receipts older than 30 days from purchase date.', severity: 'medium', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r5', title: 'Required Fields', detail: 'Checks mandatory fields from reimbursement form.', severity: 'high', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r6', title: 'Subject for Approval', detail: 'Marks if request needs approval based on rule outcomes.', severity: 'info', enabled: true, isBuiltIn: true, updatedAt: now }
    ];
};

const dateLikeRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\btime\b|\b\d{1,2}:\d{2}\s*(?:am|pm)?\b)/i;

const isDateLike = (value: string): boolean => dateLikeRegex.test(value || '');

const normalizeMoneyValue = (value: string, fallback = '0.00'): string => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    const numeric = raw.replace(/[^0-9.\-]/g, '');
    if (!numeric) return fallback;
    const parsed = Number(numeric);
    if (Number.isNaN(parsed)) return fallback;
    return parsed.toFixed(2);
};

const parseGroupPettyCashEntries = (rawText: string): GroupPettyCashEntry[] => {
    const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
    const extracted: GroupPettyCashEntry[] = [];

    for (const line of lines) {
        const match = line.match(/^([A-Za-z][A-Za-z .,'’\-]{1,80}?)(?:\s*[:\-]\s*|\s+)\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*$/);
        if (!match) continue;

        const staffName = match[1].replace(/\s+/g, ' ').trim();
        const amount = Number(match[2]);
        if (!staffName || Number.isNaN(amount) || amount <= 0) continue;

        extracted.push({ staffName, amount });
    }

    return extracted;
};

const parseDateValue = (value: string): Date | null => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;

    const slashMatch = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!slashMatch) return null;

    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const yearRaw = Number(slashMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
};

const toDateKey = (value: string): string => {
    const parsed = parseDateValue(value);
    if (!parsed) return String(value || '').trim().toLowerCase();
    return parsed.toISOString().slice(0, 10);
};

const normalizeNameKey = (value: string): string => {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeReferenceKey = (value: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (!isValidNabReference(raw)) return '';
    return raw.toLowerCase();
};

const upsertStatusTag = (content: string, status: 'PENDING' | 'PAID'): string => {
    const statusTag = `<!-- STATUS: ${status} -->`;
    if (content.includes('<!-- STATUS:')) {
        return content.replace(/<!--\s*STATUS:\s*(?:PENDING|PAID)\s*-->/gi, statusTag);
    }
    return `${content}${content.endsWith('\n') ? '' : '\n\n'}${statusTag}`;
};

const appendDuplicateAuditMeta = (
    content: string,
    payload?: { signal: DuplicateTrafficLight; reason?: string; detail?: string; lookbackDays: number }
): string => {
    if (!payload) return content;

    const safeReason = String(payload.reason || '')
        .replace(/-->/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const safeDetail = String(payload.detail || '')
        .replace(/-->/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const checkedAt = new Date().toISOString();
    const meta = `<!-- DUPLICATE_AUDIT: signal=${payload.signal.toUpperCase()}; lookback_days=${payload.lookbackDays}; reason=${safeReason || 'none'}; detail=${safeDetail || 'none'}; checked_at=${checkedAt} -->`;
    const stripped = content.replace(/\n*<!--\s*DUPLICATE_AUDIT:.*?-->\s*/gi, '\n');
    return `${stripped.trimEnd()}\n\n${meta}`;
};

const extractPendingFollowedUpAt = (content: string): string => {
    const match = String(content || '').match(/<!--\s*PENDING_FOLLOWED_UP_AT:\s*(.*?)\s*-->/i);
    return match?.[1]?.trim() || '';
};

const upsertPendingFollowedUpAt = (content: string, isoTimestamp: string): string => {
    const tag = `<!-- PENDING_FOLLOWED_UP_AT: ${isoTimestamp} -->`;
    if (/<!--\s*PENDING_FOLLOWED_UP_AT:/i.test(content)) {
        return content.replace(/<!--\s*PENDING_FOLLOWED_UP_AT:\s*.*?\s*-->/i, tag);
    }
    return `${content}${content.endsWith('\n') ? '' : '\n\n'}${tag}`;
};

const getPendingAgeDays = (record: any): number => {
    const followedUpAt = extractPendingFollowedUpAt(record?.full_email_content || '');
    const baseline = followedUpAt || String(record?.created_at || '');
    const baselineMs = new Date(baseline).getTime();
    if (Number.isNaN(baselineMs)) return 0;
    const age = Math.floor((Date.now() - baselineMs) / (24 * 60 * 60 * 1000));
    return Math.max(0, age);
};

const getPendingAgingBucket = (ageDays: number): 'fresh' | 'watch' | 'stale' => {
    if (ageDays >= 8) return 'stale';
    if (ageDays >= 3) return 'watch';
    return 'fresh';
};

const QUICK_EDIT_FIELD_CONFIGS: QuickEditFieldConfig[] = [
    { key: 'staffMember', label: 'Staff Member' },
    { key: 'clientFullName', label: "Client's Full Name" },
    { key: 'clientLocation', label: 'Client / Location' },
    { key: 'address', label: 'Address' },
    { key: 'approvedBy', label: 'Approved By' },
    { key: 'amount', label: 'Amount' },
    { key: 'receiptId', label: 'Receipt ID' }
];

const getQuickFieldPatterns = (key: QuickEditFieldKey): RegExp[] => {
    const base = {
        staffMember: [/\*\*Staff Member:\*\*\s*(.*?)(?:\n|$)/i],
        clientFullName: [/\*\*Client(?:'|’)?s\s+Full\s+Name:\*\*\s*(.*?)(?:\n|$)/i],
        clientLocation: [/\*\*Client\s*\/\s*Location:\*\*\s*(.*?)(?:\n|$)/i],
        address: [/\*\*Address:\*\*\s*(.*?)(?:\n|$)/i],
        approvedBy: [/\*\*Approved\s*By:\*\*\s*(.*?)(?:\n|$)/i, /\*\*Approved\s*by:\*\*\s*(.*?)(?:\n|$)/i],
        amount: [/\*\*Amount:\*\*\s*(.*?)(?:\n|$)/i],
        receiptId: [/\*\*Receipt\s*ID:\*\*\s*(.*?)(?:\n|$)/i],
        nabCode: [/\*\*NAB\s*(?:Code|Reference):\*\*\s*(.*?)(?:\n|$)/i]
    };

    return base[key];
};

const getQuickEditFieldValue = (content: string, key: QuickEditFieldKey): string => {
    const patterns = getQuickFieldPatterns(key);
    for (const pattern of patterns) {
        const match = content.match(pattern);
        const value = match?.[1]?.trim();
        if (value !== undefined) return value;
    }
    return '';
};

const isQuickEditFieldMissing = (key: QuickEditFieldKey, rawValue: string): boolean => {
    const value = String(rawValue || '').trim();
    if (!value) return true;
    if (/^\[.*\]$/.test(value)) return true;
    if (/^(n\/a|na)$/i.test(value)) return true;
    if (/^enter\b/i.test(value)) return true;
    if (key === 'amount' && !/[0-9]/.test(value)) return true;
    return false;
};

const applyQuickEditFieldValue = (content: string, key: QuickEditFieldKey, nextRawValue: string): string => {
    const nextValue = String(nextRawValue || '').trim();
    if (!nextValue) return content;

    const formattedValue = key === 'amount'
        ? (nextValue.startsWith('$') ? nextValue : `$${nextValue}`)
        : nextValue;

    const patterns = getQuickFieldPatterns(key);
    for (const pattern of patterns) {
        if (pattern.test(content)) {
            return content.replace(pattern, (full, captured) => full.replace(captured, formattedValue));
        }
    }

    const fallbackLabel = QUICK_EDIT_FIELD_CONFIGS.find(field => field.key === key)?.label || key;
    return `${content}${content.endsWith('\n') ? '' : '\n'}**${fallbackLabel}:** ${formattedValue}\n`;
};

const normalizeReceiptRow = (
    parts: string[],
    fallbackTotal: string,
    fallbackStore: string,
    fallbackUid: string
): NormalizedReceiptRow | null => {
    if (!parts.length) return null;

    let normalized: NormalizedReceiptRow;

    if (parts.length >= 9) {
        normalized = {
            receiptNum: parts[0] || '',
            uniqueId: parts[1] || '',
            storeName: parts[2] || '',
            dateTime: parts[3] || '',
            product: parts[4] || '',
            category: parts[5] || 'Uncategorized',
            itemAmount: parts[6] || 'Included in total',
            receiptTotal: parts[7] || fallbackTotal,
            notes: parts[8] || ''
        };
    } else if (parts.length >= 8) {
        normalized = {
            receiptNum: parts[0] || '',
            uniqueId: parts[1] || fallbackUid,
            storeName: parts[2] || fallbackStore,
            dateTime: parts[3] || '',
            product: parts[4] || '',
            category: parts[5] || 'Uncategorized',
            itemAmount: parts[6] || 'Included in total',
            receiptTotal: parts[7] || fallbackTotal,
            notes: ''
        };
    } else if (parts.length >= 6) {
        const storeAndTime = parts[1] || '';
        const dateMatch = storeAndTime.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(?:\s+\d{1,2}:\d{2}(?:\s*[AP]M)?)?)/i);
        normalized = {
            receiptNum: parts[0] || '',
            uniqueId: fallbackUid,
            storeName: dateMatch ? storeAndTime.replace(dateMatch[1], '').trim() : (storeAndTime || fallbackStore),
            dateTime: dateMatch ? dateMatch[1].trim() : '',
            product: parts[2] || '',
            category: parts[3] || 'Uncategorized',
            itemAmount: parts[4] || 'Included in total',
            receiptTotal: parts[5] || fallbackTotal,
            notes: ''
        };
    } else if (parts.length === 5) {
        normalized = {
            receiptNum: parts[0] || '',
            uniqueId: fallbackUid,
            storeName: parts[1] || fallbackStore,
            dateTime: parts[2] || '',
            product: parts[3] || '',
            category: 'Uncategorized',
            itemAmount: 'Included in total',
            receiptTotal: parts[4] || fallbackTotal,
            notes: ''
        };
    } else if (parts.length === 4) {
        normalized = {
            receiptNum: parts[0] || '',
            uniqueId: fallbackUid,
            storeName: fallbackStore,
            dateTime: parts[1] || '',
            product: parts[2] || '',
            category: 'Uncategorized',
            itemAmount: 'Included in total',
            receiptTotal: parts[3] || fallbackTotal,
            notes: ''
        };
    } else {
        return null;
    }

    if (!normalized.receiptNum || /total|grand/i.test(normalized.receiptNum)) return null;

    if (!isDateLike(normalized.dateTime) && isDateLike(normalized.product)) {
        const swapped = normalized.dateTime;
        normalized.dateTime = normalized.product;
        normalized.product = swapped;
    }

    if (normalized.itemAmount.toLowerCase() !== 'included in total') {
        normalized.itemAmount = normalizeMoneyValue(normalized.itemAmount, normalizeMoneyValue(normalized.receiptTotal, '0.00'));
    }
    normalized.receiptTotal = normalizeMoneyValue(normalized.receiptTotal, normalizeMoneyValue(fallbackTotal, '0.00'));

    if (!normalized.storeName) normalized.storeName = fallbackStore;
    if (!normalized.uniqueId) normalized.uniqueId = fallbackUid;

    return normalized;
};

const buildManualAuditIssues = (
    items: Array<NormalizedReceiptRow & { amount: string; onCharge: string }>,
    formTotal: number,
    receiptGrandTotal: number | null,
    clientName: string,
    address: string,
    staffMember: string,
    approvedBy: string
): ManualAuditIssue[] => {
    const issues: ManualAuditIssue[] = [];

    if (!clientName) issues.push({ level: 'warning', message: "Missing 'Client's Full Name' in Reimbursement Form." });
    if (!address) issues.push({ level: 'warning', message: "Missing 'Address' in Reimbursement Form." });
    if (!staffMember) issues.push({ level: 'warning', message: "Missing 'Staff member to reimburse' in Reimbursement Form." });
    if (!approvedBy) issues.push({ level: 'warning', message: "Missing 'Approved by' in Reimbursement Form." });

    if (items.length === 0) {
        issues.push({ level: 'error', message: 'No valid receipt rows found. Check table format before continuing.' });
        return issues;
    }

    const duplicateUidMap = new Map<string, Array<{ rowNum: number; receiptNum: string; product: string; amount: string }>>();
    const duplicateReceiptKeyMap = new Map<string, Array<{ rowNum: number; receiptNum: string; product: string; amount: string }>>();

    items.forEach((item, idx) => {
        const rowNum = idx + 1;
        const uid = (item.uniqueId || '').trim().toLowerCase();
        const receiptNum = (item.receiptNum || '').trim();
        const product = (item.product || '').trim().toLowerCase();
        const amount = normalizeMoneyValue(item.receiptTotal || item.amount, '0.00');

        if (uid && uid !== '-' && uid !== 'n/a') {
            duplicateUidMap.set(uid, [
                ...(duplicateUidMap.get(uid) || []),
                { rowNum, receiptNum, product, amount }
            ]);
        }

        const key = [
            (item.storeName || '').trim().toLowerCase(),
            (item.dateTime || '').trim().toLowerCase(),
            amount
        ].join('|');

        if (key !== '||0.00') {
            duplicateReceiptKeyMap.set(key, [
                ...(duplicateReceiptKeyMap.get(key) || []),
                { rowNum, receiptNum, product, amount }
            ]);
        }

        if (!item.product || item.product.trim() === '' || item.product === '-') {
            issues.push({ level: 'warning', message: `Row ${rowNum}: missing Product (Per Item).` });
        }

        if (!item.dateTime || item.dateTime.trim() === '' || item.dateTime === '-') {
            issues.push({ level: 'warning', message: `Row ${rowNum}: missing Date & Time.` });
        }

        const totalNum = Number(normalizeMoneyValue(item.receiptTotal || item.amount, '0.00'));
        if (Number.isNaN(totalNum) || totalNum <= 0) {
            issues.push({ level: 'warning', message: `Row ${rowNum}: invalid Receipt Total.` });
        }
    });

    duplicateUidMap.forEach((entries) => {
        if (entries.length > 1) {
            const rowNums = entries.map(e => e.rowNum);
            const receiptNums = new Set(entries.map(e => e.receiptNum || ''));
            const sameLineItems = new Set(entries.map(e => `${e.product}|${e.amount}`));
            const isLikelyRealDuplicate = receiptNums.size > 1 || sameLineItems.size < entries.length;

            if (isLikelyRealDuplicate) {
                issues.push({ level: 'warning', message: `Possible double entry: same Unique ID / Fallback in rows ${rowNums.join(', ')}.` });
            }
        }
    });

    duplicateReceiptKeyMap.forEach((entries) => {
        if (entries.length > 1) {
            const rowNums = entries.map(e => e.rowNum);
            const productAmountPairs = new Set(entries.map(e => `${e.product}|${e.amount}`));
            const isLikelyRealDuplicate = productAmountPairs.size < entries.length;

            if (isLikelyRealDuplicate) {
                issues.push({ level: 'warning', message: `Possible duplicate receipt (same Store + Date/Time + Total) in rows ${rowNums.join(', ')}.` });
            }
        }
    });

    if (receiptGrandTotal !== null && formTotal > 0) {
        const diff = Math.abs(formTotal - receiptGrandTotal);
        if (diff > 0.01) {
            issues.push({
                level: 'warning',
                message: `Total mismatch: Form Total $${formTotal.toFixed(2)} vs Receipt GRAND TOTAL $${receiptGrandTotal.toFixed(2)}.`
            });
        }
    }

    return issues;
};

export const App = () => {
    const DUPLICATE_LOOKBACK_DAYS = 30;

    const [receiptFiles, setReceiptFiles] = useState<FileWithPreview[]>([]);
    const [formFiles, setFormFiles] = useState<FileWithPreview[]>([]);
    const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
    const [results, setResults] = useState<ProcessingResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

const [isEditing, setIsEditing] = useState(false);
    const [editableContent, setEditableContent] = useState('');

    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error' | 'duplicate'>('idle');
    const [isSaving, setIsSaving] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveModalDecision, setSaveModalDecision] = useState<SaveModalDecision | null>(null);
    const [reviewerOverrideReason, setReviewerOverrideReason] = useState('');
    const [quickEditDrafts, setQuickEditDrafts] = useState<Partial<Record<QuickEditFieldKey, string>>>({});
    const [pendingApprovalStaffGroup, setPendingApprovalStaffGroup] = useState<PendingStaffGroup | null>(null);
    const [pendingApprovalNabCode, setPendingApprovalNabCode] = useState('');
    const [isApprovingPending, setIsApprovingPending] = useState(false);
    const [followUpingGroupKey, setFollowUpingGroupKey] = useState<string | null>(null);
    const [manualAuditIssues, setManualAuditIssues] = useState<ManualAuditIssue[]>([]);
    const [showManualAuditModal, setShowManualAuditModal] = useState(false);
    const bypassManualAuditRef = useRef(false);

    // Processing status state
    const [ocrStatus, setOcrStatus] = useState<string>('');

    // Manual Input States
    const [reimbursementFormText, setReimbursementFormText] = useState('');
    const [receiptDetailsText, setReceiptDetailsText] = useState('');
    const [requestMode, setRequestMode] = useState<RequestMode>('solo');
    const reimbursementFormRef = useRef<HTMLTextAreaElement | null>(null);

    const [emailCopied, setEmailCopied] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [reportCopied, setReportCopied] = useState<'nab' | 'eod' | 'analytics' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'generated' | null>(null);

    const [activeTab, setActiveTab] = useState<'dashboard' | 'database' | 'nab_log' | 'eod' | 'analytics' | 'settings'>('dashboard');
    const [loadingSplash, setLoadingSplash] = useState(true);

    // Analytics Report State
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const [isEditingReport, setIsEditingReport] = useState(false);
    const [reportEditableContent, setReportEditableContent] = useState('');

    // Database / History State
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [dismissedIds, setDismissedIds] = useState<number[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Row Modal State
    const [selectedRow, setSelectedRow] = useState<any | null>(null);
    const [isRowModalOpen, setIsRowModalOpen] = useState(false);
    const [isRowEditMode, setIsRowEditMode] = useState(false);
    const [editedRowData, setEditedRowData] = useState<any>(null);

    // Employee Database State
    const [employeeList, setEmployeeList] = useState<Employee[]>([]);
    const [employeeRawText, setEmployeeRawText] = useState(DEFAULT_EMPLOYEE_DATA);
    const [saveEmployeeStatus, setSaveEmployeeStatus] = useState<'idle' | 'saved'>('idle');
    
    // Employee Selection State for Banking Details
    const [selectedEmployees, setSelectedEmployees] = useState<Map<number, Employee>>(new Map());
    const [employeeSearchQuery, setEmployeeSearchQuery] = useState<Map<number, string>>(new Map());
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState<Map<number, boolean>>(new Map());

    // Rules Management
    const [rulesConfig, setRulesConfig] = useState<RuleConfig[]>(getDefaultBuiltInRules());
    const [newRuleTitle, setNewRuleTitle] = useState('');
    const [newRuleDetail, setNewRuleDetail] = useState('');
    const [newRuleSeverity, setNewRuleSeverity] = useState<'critical' | 'high' | 'medium' | 'info'>('medium');
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [editingRuleDraft, setEditingRuleDraft] = useState<RuleConfig | null>(null);
    const [pendingRuleAction, setPendingRuleAction] = useState<RulePendingAction | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [showRestoreRulesModal, setShowRestoreRulesModal] = useState(false);
    const [selectedRestoreRuleIds, setSelectedRestoreRuleIds] = useState<Set<string>>(new Set());

    // Mass Edit State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isMassEditModalOpen, setIsMassEditModalOpen] = useState(false);
    const [massEditData, setMassEditData] = useState({
        uid: '',
        timestamp: '',
        nabCode: '',
        ypName: '',
        youngPersonName: '',
        staffName: '',
        expenseType: '',
        totalAmount: '',
        dateProcessed: ''
    });

    useEffect(() => {
        // Splash screen timer
        const timer = setTimeout(() => setLoadingSplash(false), 2000);

        // Load dismissed IDs
        const storedDismissed = localStorage.getItem('aspire_dismissed_discrepancies');
        if (storedDismissed) {
            setDismissedIds(JSON.parse(storedDismissed));
        }

        // Load Employee Data
        const storedEmployees = localStorage.getItem('aspire_employee_list');
        if (storedEmployees) {
            setEmployeeRawText(storedEmployees);
            setEmployeeList(parseEmployeeData(storedEmployees));
        } else {
            setEmployeeList(parseEmployeeData(DEFAULT_EMPLOYEE_DATA));
        }

        // Load Rules Config
        const storedRulesConfig = localStorage.getItem('aspire_rules_config');
        if (storedRulesConfig) {
            try {
                const parsed = JSON.parse(storedRulesConfig);
                if (Array.isArray(parsed)) {
                    const normalized = parsed
                        .filter((r: any) => r && typeof r.id === 'string' && typeof r.title === 'string' && typeof r.detail === 'string')
                        .map((r: any) => ({
                            id: r.id,
                            title: r.title,
                            detail: r.detail,
                            severity: (['critical', 'high', 'medium', 'info'].includes(r.severity) ? r.severity : 'medium') as RuleConfig['severity'],
                            enabled: Boolean(r.enabled),
                            isBuiltIn: Boolean(r.isBuiltIn),
                            updatedAt: r.updatedAt || new Date().toISOString()
                        })) as RuleConfig[];

                    const existingIds = new Set(normalized.map((r: RuleConfig) => r.id));
                    const defaults = getDefaultBuiltInRules().filter(rule => !existingIds.has(rule.id));
                    setRulesConfig([...normalized, ...defaults]);
                }
            } catch (error) {
                console.warn('Failed to parse stored rules config:', error);
            }
        }

        // Initial fetch
        fetchHistory();

        return () => clearTimeout(timer);
    }, []);

    const handleSaveEmployeeList = () => {
        localStorage.setItem('aspire_employee_list', employeeRawText);
        setEmployeeList(parseEmployeeData(employeeRawText));
        setSaveEmployeeStatus('saved');
        setTimeout(() => setSaveEmployeeStatus('idle'), 2000);
    };

    const persistRulesConfig = (nextRules: RuleConfig[]) => {
        setRulesConfig(nextRules);
        localStorage.setItem('aspire_rules_config', JSON.stringify(nextRules));
    };

    const handleRequestAddRule = () => {
        const title = newRuleTitle.trim();
        const detail = newRuleDetail.trim();
        if (!title || !detail) return;

        const newRule: RuleConfig = {
            id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            title,
            detail,
            severity: newRuleSeverity,
            enabled: true,
            isBuiltIn: false,
            updatedAt: new Date().toISOString()
        };
        setPendingRuleAction({ type: 'add', nextRule: newRule });
    };

    const handleStartEditRule = (rule: RuleConfig) => {
        setEditingRuleId(rule.id);
        setEditingRuleDraft({ ...rule });
    };

    const handleRequestSaveRuleEdit = () => {
        if (!editingRuleId || !editingRuleDraft) return;
        if (!editingRuleDraft.title.trim() || !editingRuleDraft.detail.trim()) return;
        setPendingRuleAction({
            type: 'edit',
            ruleId: editingRuleId,
            nextRule: {
                ...editingRuleDraft,
                title: editingRuleDraft.title.trim(),
                detail: editingRuleDraft.detail.trim(),
                updatedAt: new Date().toISOString()
            }
        });
    };

    const handleRequestDeleteRule = (ruleId: string) => {
        setDeleteConfirmText('');
        setPendingRuleAction({ type: 'delete', ruleId });
    };

    const handleConfirmRuleAction = () => {
        if (!pendingRuleAction) return;

        if (pendingRuleAction.type === 'add' && pendingRuleAction.nextRule) {
            const nextRules = [pendingRuleAction.nextRule, ...rulesConfig];
            persistRulesConfig(nextRules);
            setNewRuleTitle('');
            setNewRuleDetail('');
            setNewRuleSeverity('medium');
        }

        if (pendingRuleAction.type === 'edit' && pendingRuleAction.ruleId && pendingRuleAction.nextRule) {
            const nextRules = rulesConfig.map(rule => rule.id === pendingRuleAction.ruleId ? pendingRuleAction.nextRule! : rule);
            persistRulesConfig(nextRules);
            setEditingRuleId(null);
            setEditingRuleDraft(null);
        }

        if (pendingRuleAction.type === 'delete' && pendingRuleAction.ruleId) {
            if (deleteConfirmText !== DELETE_RULE_CONFIRMATION_PHRASE) return;
            const nextRules = rulesConfig.filter(rule => rule.id !== pendingRuleAction.ruleId);
            persistRulesConfig(nextRules);
            if (editingRuleId === pendingRuleAction.ruleId) {
                setEditingRuleId(null);
                setEditingRuleDraft(null);
            }
        }

        setPendingRuleAction(null);
        setDeleteConfirmText('');
    };

    const handleToggleRuleEnabled = (ruleId: string) => {
        const nextRules = rulesConfig.map(rule => {
            if (rule.id !== ruleId) return rule;
            return {
                ...rule,
                enabled: !rule.enabled,
                updatedAt: new Date().toISOString()
            };
        });
        persistRulesConfig(nextRules);
    };

    const missingBuiltInRules = useMemo(() => {
        const currentIds = new Set(rulesConfig.map(rule => rule.id));
        return getDefaultBuiltInRules().filter(rule => !currentIds.has(rule.id));
    }, [rulesConfig]);

    const toggleRestoreRuleSelection = (ruleId: string) => {
        setSelectedRestoreRuleIds(prev => {
            const next = new Set(prev);
            if (next.has(ruleId)) {
                next.delete(ruleId);
            } else {
                next.add(ruleId);
            }
            return next;
        });
    };

    const handleRestoreSelectedRules = () => {
        const defaults = getDefaultBuiltInRules().filter(rule => selectedRestoreRuleIds.has(rule.id));
        if (defaults.length === 0) return;
        const nextRules = [...rulesConfig, ...defaults.map(rule => ({ ...rule, updatedAt: new Date().toISOString() }))];
        persistRulesConfig(nextRules);
        setSelectedRestoreRuleIds(new Set());
        setShowRestoreRulesModal(false);
    };

    // Helper to parse extracting transactions from the email content (Dynamic for Batch and Single)
    const getParsedTransactions = () => {
        const content = isEditing ? editableContent : results?.phase4;
        if (!content) return [];

        // Split by "**Staff Member:**" to isolate blocks
        const parts = content.split('**Staff Member:**');

        // If only 1 part, it means no "**Staff Member:**" found (header only?), or maybe format issue.
        if (parts.length <= 1) {
            // Fallback attempt: check unbolded
            const unboldedParts = content.split('Staff Member:');
            if (unboldedParts.length > 1) {
                return unboldedParts.slice(1).map((part, index) => parseTransactionPart(part, index));
            }
            return [];
        }

        return parts.slice(1).map((part, index) => parseTransactionPart(part, index));
    };

    const parseTransactionPart = (part: string, index: number) => {
        const lines = part.split('\n');
        // Staff name is usually the immediate text after the split
        let staffName = lines[0].trim();

        // Find amount
        const amountMatch = part.match(/\*\*Amount:\*\*\s*(.*)/) || part.match(/Amount:\s*(.*)/);
        let amount = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';

        // Find NAB code
        const nabMatch = part.match(/NAB (?:Code|Reference):(?:\*\*|)\s*(.*)/i);
        let currentNabRef = nabMatch ? nabMatch[1].trim() : '';
        if (!isValidNabReference(currentNabRef)) currentNabRef = ''; // Clear placeholders/pending for input value

        // Find Receipt ID (if exists)
        const receiptMatch = part.match(/\*\*Receipt ID:\*\*\s*(.*)/) || part.match(/Receipt ID:\s*(.*)/);
        const receiptId = receiptMatch ? receiptMatch[1].trim() : 'N/A';

        // Format Name (Last, First -> First Last)
        let formattedName = staffName;
        if (staffName.includes(',')) {
            const p = staffName.split(',');
            if (p.length >= 2) formattedName = `${p[1].trim()} ${p[0].trim()}`;
        }

        return {
            index,
            staffName,
            formattedName,
            amount,
            receiptId,
            currentNabRef
        };
    };

    const parsedTransactions = getParsedTransactions();

    const activeEmailContent = isEditing ? editableContent : (results?.phase4 || '');

    const quickEditFields = useMemo<QuickEditFieldState[]>(() => {
        if (!activeEmailContent) return [];
        return QUICK_EDIT_FIELD_CONFIGS.map((field) => {
            const value = getQuickEditFieldValue(activeEmailContent, field.key);
            return {
                ...field,
                value,
                missing: isQuickEditFieldMissing(field.key, value)
            };
        });
    }, [activeEmailContent]);

    const missingQuickEditFields = useMemo(
        () => quickEditFields.filter(field => field.missing),
        [quickEditFields]
    );

    const handleQuickEditDraftChange = (key: QuickEditFieldKey, value: string) => {
        setQuickEditDrafts(prev => ({ ...prev, [key]: value }));
    };

    const handleApplyMissingFieldEdits = () => {
        if (!activeEmailContent || missingQuickEditFields.length === 0) return;

        let nextContent = activeEmailContent;
        missingQuickEditFields.forEach((field) => {
            const draft = String(quickEditDrafts[field.key] ?? field.value ?? '').trim();
            if (!draft) return;
            nextContent = applyQuickEditFieldValue(nextContent, field.key, draft);
        });

        if (nextContent === activeEmailContent) return;

        if (isEditing) {
            setEditableContent(nextContent);
        } else {
            setResults(prev => (prev ? { ...prev, phase4: nextContent } : prev));
        }
        setSaveStatus('idle');
    };

    const handleResetMissingFieldDrafts = () => {
        setQuickEditDrafts({});
    };

    const handleTransactionNabChange = (index: number, newVal: string) => {
        const content = isEditing ? editableContent : results?.phase4;
        if (!content) return;

        const marker = '**Staff Member:**';
        const parts = content.split(marker);

        // parts[0] is header. parts[1] is transaction 0, parts[2] is transaction 1...
        // So transaction index maps to parts[index + 1]
        const partIndex = index + 1;

        if (parts.length <= partIndex) return;

        let targetPart = parts[partIndex];

        // Replace NAB line
        if (targetPart.match(/NAB (?:Code|Reference):/i)) {
            targetPart = targetPart.replace(/NAB (?:Code|Reference):.*/i, `NAB Code: ${newVal}`);
        } else {
            if (targetPart.includes('Amount:')) {
                targetPart = targetPart.replace(/(Amount:.*)/, `$1\n**NAB Code:** ${newVal}`);
            } else {
                targetPart += `\n**NAB Code:** ${newVal}`;
            }
        }

        parts[partIndex] = targetPart;
        const newContent = parts.join(marker);

        if (isEditing) {
            setEditableContent(newContent);
        } else {
            setResults({ ...results!, phase4: newContent });
        }
    };

    // Employee Selection Handlers for Banking Details
    const handleEmployeeSelect = (txIndex: number, employee: Employee) => {
        setSelectedEmployees(prev => new Map(prev).set(txIndex, employee));
        setEmployeeSearchQuery(prev => new Map(prev).set(txIndex, employee.fullName));
        setShowEmployeeDropdown(prev => new Map(prev).set(txIndex, false));
    };

    const handleEmployeeSearchChange = (txIndex: number, query: string) => {
        setEmployeeSearchQuery(prev => new Map(prev).set(txIndex, query));
        setShowEmployeeDropdown(prev => new Map(prev).set(txIndex, true));
    };

    const handleEmployeeSearchFocus = (txIndex: number) => {
        setShowEmployeeDropdown(prev => new Map(prev).set(txIndex, true));
    };

    const handleEmployeeSearchBlur = (txIndex: number) => {
        // Delay hiding dropdown to allow click selection
        setTimeout(() => {
            setShowEmployeeDropdown(prev => new Map(prev).set(txIndex, false));
        }, 200);
    };

    const getFilteredEmployees = (query: string) => {
        if (!query || query.trim() === '') return employeeList;
        const lowerQuery = query.toLowerCase();
        return employeeList.filter(emp => 
            emp.fullName.toLowerCase().includes(lowerQuery) ||
            emp.firstName.toLowerCase().includes(lowerQuery) ||
            emp.surname.toLowerCase().includes(lowerQuery)
        );
    };

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            // Use 'audit_logs' as originally designed, not 'reimbursements'
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setHistoryData(data || []);
        } catch (e) {
            console.error("Error fetching history:", e);
        } finally {
            setLoadingHistory(false);
        }
    };

    const parseDatabaseRows = (data: any[]) => {
        const allRows: any[] = [];
        data.forEach((record) => {
            const content = record.full_email_content || "";
            const internalId = record.id;

            // Extract Unique Receipt ID from content
            const receiptIdMatch = content.match(/\*\*Receipt ID:\*\*\s*(.*?)(?:\n|$)/);
            let receiptId = receiptIdMatch ? receiptIdMatch[1].trim() : 'N/A';
            if (receiptId === 'N/A' && record.nab_code) receiptId = record.nab_code; // Fallback only if needed
            const uidMetaMatch = content.match(/<!--\s*UID_FALLBACKS:(.*?)-->/i);
            const uidFallbacks = uidMetaMatch
                ? uidMetaMatch[1].split('||').map((v: string) => v.trim()).filter((v: string) => v.length > 0)
                : [];
            let uidIdx = 0;
            const timestamp = new Date(record.created_at).toLocaleString();
            const rawDate = new Date(record.created_at);

            // Extract basic info
            const staffName = record.staff_name || 'Unknown';
            const amountMatch = content.match(/\*\*Amount:\*\*\s*(.*)/);
            let totalAmount = record.amount || (amountMatch ? amountMatch[1].trim() : '0.00');
            // Sanitize Total Amount
            if (typeof totalAmount === 'string') {
                totalAmount = totalAmount.replace('(Based on Receipts/Form Audit)', '').trim();
            }

            const addressValue = extractFieldValue(content, [
                /(?:\*\*\s*Address\s*:\s*\*\*|Address\s*:)\s*(.*?)(?:\n|$)/i
            ]);
            const clientFullNameValue = extractFieldValue(content, [
                /(?:\*\*\s*Client(?:'|’)?s?\s+Full\s+Name\s*:\s*\*\*|Client(?:'|’)?s?\s+Full\s+Name\s*:)\s*(.*?)(?:\n|$)/i
            ]);
            const clientLocationValue = extractFieldValue(content, [
                /(?:\*\*\s*Client\s*\/\s*Location\s*:\s*\*\*|Client\s*\/\s*Location\s*:)\s*(.*?)(?:\n|$)/i
            ]);

            const locationFirstPart = clientLocationValue.includes('/')
                ? clientLocationValue.split('/')[0].trim()
                : clientLocationValue;

            // Mapping rules:
            // - Client / Location column: Address -> Client / Location
            // - YP NAME column: Client's Full Name -> first part of Client / Location
            const ypName = addressValue || clientLocationValue || '-';
            const youngPersonName = clientFullNameValue || locationFirstPart || '-';

            const dateProcessed = new Date(record.created_at).toLocaleDateString();
            const nabRefDisplay = record.nab_code || 'PENDING';

            // 2. Extract Table Rows
            const lines = content.split('\n');
            let foundTable = false;
            let tableRowsFound = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (line.startsWith('| Receipt #') || line.startsWith('|Receipt #')) {
                    foundTable = true;
                    continue; // Skip header
                }
                if (foundTable && line.startsWith('| :---')) {
                    continue; // Skip separator
                }
                if (foundTable && line.startsWith('|')) {
                    const cols = line.split('|').map((c: string) => c.trim()).filter((c: string) => c !== '');

                    const fallbackUid = uidFallbacks[uidIdx] || receiptId;
                    const normalized = normalizeReceiptRow(cols, String(totalAmount || '0.00'), 'Unknown Store', fallbackUid);
                    if (!normalized) continue;

                    tableRowsFound = true;
                    uidIdx += 1;

                    const dateMatch = normalized.dateTime.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
                    const receiptDate = dateMatch ? dateMatch[1] : dateProcessed;
                    const amountForDb = normalized.itemAmount.toLowerCase() === 'included in total'
                        ? normalized.receiptTotal
                        : normalized.itemAmount;

                    allRows.push({
                        id: `${internalId}-${i}`, // Unique key for React using DB ID
                        uid: normalized.uniqueId || fallbackUid,
                        internalId: internalId,
                        timestamp,
                        rawDate,
                        ypName: ypName,
                        youngPersonName: youngPersonName,
                        staffName,
                        product: normalized.product,
                        expenseType: normalized.category,
                        receiptDate,
                        amount: amountForDb,
                        totalAmount: normalized.receiptTotal,
                        dateProcessed,
                        nabCode: nabRefDisplay // Display Bank Ref in Nab Code column
                    });
                }
                if (foundTable && line === '') {
                    foundTable = false;
                }
            }

            if (!tableRowsFound) {
                allRows.push({
                    id: `${internalId}-summary`,
                    uid: uidFallbacks[0] || receiptId,
                    internalId: internalId,
                    timestamp,
                    rawDate,
                    ypName: ypName,
                    youngPersonName: youngPersonName,
                    staffName,
                    product: 'Petty Cash / Reimbursement',
                    expenseType: 'Batch Request',
                    receiptDate: dateProcessed,
                    amount: typeof totalAmount === 'number' ? totalAmount.toFixed(2) : totalAmount,
                    totalAmount: typeof totalAmount === 'number' ? totalAmount.toFixed(2) : totalAmount,
                    dateProcessed,
                    nabCode: nabRefDisplay
                });
            }
        });
        return allRows;
    };

    const databaseRows = useMemo(() => parseDatabaseRows(historyData), [historyData]);

    const filteredDatabaseRows = useMemo(() => {
        if (!searchTerm) return databaseRows;
        const lowerSearch = searchTerm.toLowerCase();
        return databaseRows.filter(row =>
            (row.staffName || '').toLowerCase().includes(lowerSearch) ||
            (row.ypName || '').toLowerCase().includes(lowerSearch) ||
            (row.youngPersonName || '').toLowerCase().includes(lowerSearch) ||
            (row.amount || '').includes(lowerSearch) ||
            (row.nabCode || '').toLowerCase().includes(lowerSearch)
        );
    }, [databaseRows, searchTerm]);

    const currentInputTransactions = useMemo<InputTransactionFingerprint[]>(() => {
        const formText = reimbursementFormText.trim();
        const receiptText = receiptDetailsText.trim();
        if (!formText && !receiptText) return [];

        const allText = `${formText}\n${receiptText}`;
        const groupEntries = parseGroupPettyCashEntries(allText);
        if (requestMode === 'group' && groupEntries.length >= 2) {
            return groupEntries.map((entry) => ({
                staffName: entry.staffName,
                amount: Number(entry.amount.toFixed(2)),
                uid: '',
                storeName: 'group petty cash',
                rawDate: '',
                dateKey: '',
                signatureKey: `group|${normalizeMoneyValue(String(entry.amount), '0.00')}`
            }));
        }

        const staffMatch = formText.match(/Staff\s*member\s*to\s*reimburse:\s*(.+)/i);
        const fallbackStaff = staffMatch ? staffMatch[1].trim() : 'Unknown';
        const lines = allText.split('\n');
        const parsed: InputTransactionFingerprint[] = [];

        for (const line of lines) {
            if (!line.trim().startsWith('|') || line.includes('---') || line.includes('Receipt #') || line.includes('GRAND TOTAL') || line.includes('Unique ID')) {
                continue;
            }

            const parts = line.split('|').map(p => p.trim()).filter(Boolean);
            const normalized = normalizeReceiptRow(parts, '0.00', '', '');
            if (!normalized) continue;

            const amount = Number(normalizeMoneyValue(normalized.receiptTotal || normalized.itemAmount, '0.00'));
            const dateKey = toDateKey(normalized.dateTime || '');
            const signatureKey = [
                (normalized.storeName || '').trim().toLowerCase(),
                dateKey,
                normalizeMoneyValue(String(amount), '0.00')
            ].join('|');

            parsed.push({
                staffName: fallbackStaff,
                amount,
                uid: (normalized.uniqueId || '').trim().toLowerCase(),
                storeName: (normalized.storeName || '').trim(),
                rawDate: normalized.dateTime || '',
                dateKey,
                signatureKey
            });
        }

        if (parsed.length > 0) return parsed;

        const amountMatch = formText.match(/Total\s*Amount:\s*\$?([\d,]+\.?\d*)/i) ||
            formText.match(/Amount:\s*\$?([\d,]+\.?\d*)/i) ||
            receiptText.match(/GRAND\s*TOTAL.*?\$\s*([\d,]+\.?\d*)/i);
        const fallbackAmount = amountMatch ? Number((amountMatch[1] || '0').replace(/,/g, '')) : 0;

        return [{
            staffName: fallbackStaff,
            amount: Number.isNaN(fallbackAmount) ? 0 : fallbackAmount,
            uid: '',
            storeName: '',
            rawDate: '',
            dateKey: '',
            signatureKey: `fallback|${normalizeMoneyValue(String(fallbackAmount || 0), '0.00')}`
        }];
    }, [reimbursementFormText, receiptDetailsText, requestMode]);

    const duplicateCheckResult = useMemo<DuplicateCheckResult>(() => {
        if (currentInputTransactions.length === 0 || databaseRows.length === 0) {
            return { signal: 'green', redMatches: [], yellowMatches: [] };
        }

        const nowMs = Date.now();
        const lookbackMs = DUPLICATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
        const historyRows = databaseRows.filter((row: any) => {
            const rawDate = row.rawDate instanceof Date ? row.rawDate : new Date(row.rawDate || row.dateProcessed || '');
            const ts = rawDate.getTime();
            if (Number.isNaN(ts)) return false;
            return (nowMs - ts) <= lookbackMs;
        });

        if (historyRows.length === 0) {
            return { signal: 'green', redMatches: [], yellowMatches: [] };
        }

        const redMatches: DuplicateMatchEvidence[] = [];
        const yellowMatches: DuplicateMatchEvidence[] = [];

        currentInputTransactions.forEach((tx) => {
            const txStaff = normalizeNameKey(tx.staffName);
            const txDateKey = String(tx.dateKey || '').trim().toLowerCase();
            const txAmount = normalizeMoneyValue(String(tx.amount), '0.00');
            const txReference = normalizeReferenceKey(tx.uid);

            if (!txStaff || !txAmount) return;

            historyRows.forEach((row: any) => {
                const historyStaff = normalizeNameKey(String(row.staffName || ''));
                const historyDateKey = toDateKey(String(row.receiptDate || row.dateProcessed || ''));
                const historyAmount = normalizeMoneyValue(String(row.totalAmount || row.amount || '0.00'), '0.00');
                const historyReference = normalizeReferenceKey(String(row.uid || row.nabCode || ''));

                if (!historyStaff) return;

                const nameMatch = txStaff === historyStaff;
                const amountMatch = txAmount === historyAmount;
                const dateComparable = !!txDateKey && !!historyDateKey;
                const dateMatch = dateComparable ? txDateKey === historyDateKey : false;
                const baseMatch = nameMatch && amountMatch && (dateComparable ? dateMatch : true);

                if (!baseMatch) return;

                const evidence: DuplicateMatchEvidence = {
                    txStaffName: tx.staffName,
                    txDateKey: txDateKey || '-',
                    txAmount,
                    txReference: txReference || '-',
                    historyStaffName: String(row.staffName || '-'),
                    historyDateKey: historyDateKey || '-',
                    historyAmount,
                    historyReference: historyReference || '-',
                    historyProcessedAt: String(row.dateProcessed || '-')
                };

                if (txReference && historyReference && txReference === historyReference) {
                    redMatches.push(evidence);
                    return;
                }

                if (dateComparable) {
                    yellowMatches.push(evidence);
                }
            });
        });

        if (redMatches.length > 0) return { signal: 'red', redMatches, yellowMatches };
        if (yellowMatches.length > 0) return { signal: 'yellow', redMatches, yellowMatches };
        return { signal: 'green', redMatches, yellowMatches };
    }, [currentInputTransactions, databaseRows, DUPLICATE_LOOKBACK_DAYS]);

    const rulesStatusItems = useMemo<RuleStatusItem[]>(() => {
        const formText = reimbursementFormText.trim();
        const receiptText = receiptDetailsText.trim();
        const hasInput = !!(formText || receiptText);

        if (!hasInput) {
            return [{
                id: 'ready',
                title: 'Awaiting Input',
                detail: 'Paste reimbursement form or receipt details to start rule checks.',
                severity: 'info',
                status: 'pass'
            }];
        }

        const historyByUid = new Map<string, any[]>();
        const historyBySignature = new Map<string, any[]>();

        databaseRows.forEach((row: any) => {
            const uid = String(row.uid || '').trim().toLowerCase();
            if (uid && uid !== 'n/a' && uid !== '-') {
                historyByUid.set(uid, [...(historyByUid.get(uid) || []), row]);
            }

            const rowDateKey = toDateKey(String(row.receiptDate || row.dateProcessed || ''));
            const rowAmount = normalizeMoneyValue(String(row.totalAmount || row.amount || '0.00'), '0.00');
            const signatureKey = [
                '',
                rowDateKey,
                rowAmount
            ].join('|');
            historyBySignature.set(signatureKey, [...(historyBySignature.get(signatureKey) || []), row]);
        });

        const uidMap = new Map<string, number>();
        const signatureMap = new Map<string, number>();
        currentInputTransactions.forEach((tx) => {
            if (tx.uid && tx.uid !== '-' && tx.uid !== 'n/a') {
                uidMap.set(tx.uid, (uidMap.get(tx.uid) || 0) + 1);
            }
            if (tx.signatureKey) {
                signatureMap.set(tx.signatureKey, (signatureMap.get(tx.signatureKey) || 0) + 1);
            }
        });

        const duplicateUidCurrent = Array.from(uidMap.entries()).filter(([, count]) => count > 1);
        const duplicateSignatureCurrent = Array.from(signatureMap.entries()).filter(([, count]) => count > 1);

        const historyUidMatches = currentInputTransactions
            .filter(tx => tx.uid && historyByUid.has(tx.uid))
            .flatMap(tx => historyByUid.get(tx.uid) || []);
        const historySignatureMatches = currentInputTransactions
            .map(tx => {
                const signatureKey = ['', tx.dateKey, normalizeMoneyValue(String(tx.amount), '0.00')].join('|');
                return historyBySignature.get(signatureKey) || [];
            })
            .flat();

        const overLimitCount = currentInputTransactions.filter(tx => tx.amount > 300).length;
        const agedCount = currentInputTransactions.filter(tx => {
            if (!tx.rawDate) return false;
            const parsedDate = parseDateValue(tx.rawDate);
            if (!parsedDate) return false;
            const ageMs = Date.now() - parsedDate.getTime();
            const days = ageMs / (1000 * 60 * 60 * 24);
            return days > 30;
        }).length;

        const clientMatch = formText.match(/Client(?:'|’)?s?\s*full\s*name\s*:\s*(.+)/i);
        const addressMatch = formText.match(/Address:\s*(.+)/i);
        const staffMatch = formText.match(/Staff\s*member\s*to\s*reimburse:\s*(.+)/i);
        const approvedMatch = formText.match(/Approved\s*by:\s*(.+)/i);
        const missingFields = [
            !clientMatch ? 'Client name' : '',
            !addressMatch ? 'Address' : '',
            !staffMatch && currentInputTransactions.length <= 1 ? 'Staff member' : '',
            !approvedMatch ? 'Approved by' : ''
        ].filter(Boolean);

        const firstHistoryMatch = historyUidMatches[0] || historySignatureMatches[0];

        const activeRules = rulesConfig.filter(rule => rule.enabled);
        const getRuleMeta = (id: string, fallbackTitle: string, fallbackSeverity: RuleStatusItem['severity']) => {
            const rule = activeRules.find(r => r.id === id);
            if (!rule) return null;
            return {
                title: rule.title || fallbackTitle,
                severity: rule.severity || fallbackSeverity
            };
        };

        const items: RuleStatusItem[] = [];

        const rule1 = getRuleMeta('r1', 'Duplicate in Current Upload', 'high');
        if (rule1) {
            items.push({
                id: 'r1',
                title: rule1.title,
                detail: duplicateUidCurrent.length > 0 || duplicateSignatureCurrent.length > 0
                    ? `Potential duplicate rows found (${duplicateUidCurrent.length + duplicateSignatureCurrent.length}).`
                    : 'No duplicate receipt patterns in the current upload.',
                severity: rule1.severity,
                status: duplicateUidCurrent.length > 0 || duplicateSignatureCurrent.length > 0 ? 'blocked' : 'pass'
            });
        }

        const rule2 = getRuleMeta('r2', 'Already Processed Check', 'critical');
        if (rule2) {
            items.push({
                id: 'r2',
                title: rule2.title,
                detail: firstHistoryMatch
                    ? `Matched previous record. Date Processed: ${firstHistoryMatch.dateProcessed || '-'} | NAB Code: ${firstHistoryMatch.nabCode || '-'}`
                    : 'No matching processed receipts found in history.',
                severity: rule2.severity,
                status: firstHistoryMatch ? 'blocked' : 'pass'
            });
        }

        const rule3 = getRuleMeta('r3', 'Amount Threshold (> $300)', 'medium');
        if (rule3) {
            items.push({
                id: 'r3',
                title: rule3.title,
                detail: overLimitCount > 0
                    ? `${overLimitCount} transaction(s) exceed $300 and require approval.`
                    : 'All transactions are within $300 threshold.',
                severity: rule3.severity,
                status: overLimitCount > 0 ? 'warning' : 'pass'
            });
        }

        const rule4 = getRuleMeta('r4', 'Receipt Age (> 30 days)', 'medium');
        if (rule4) {
            items.push({
                id: 'r4',
                title: rule4.title,
                detail: agedCount > 0
                    ? `${agedCount} receipt(s) appear older than 30 days from purchase date.`
                    : 'No receipts older than 30 days detected.',
                severity: rule4.severity,
                status: agedCount > 0 ? 'warning' : 'pass'
            });
        }

        const rule5 = getRuleMeta('r5', 'Required Fields', 'high');
        if (rule5) {
            items.push({
                id: 'r5',
                title: rule5.title,
                detail: missingFields.length > 0
                    ? `Missing: ${missingFields.join(', ')}.`
                    : 'Required form fields are complete.',
                severity: rule5.severity,
                status: missingFields.length > 0 ? 'blocked' : 'pass'
            });
        }

        const hasEscalation = items.some(item => item.status === 'blocked' || item.status === 'warning');
        const rule6 = getRuleMeta('r6', 'Subject for Approval', 'info');
        if (rule6) {
            items.push({
                id: 'r6',
                title: rule6.title,
                detail: hasEscalation
                    ? 'Yes. Route this request for approval before final payment.'
                    : 'No. Request can proceed with normal workflow.',
                severity: rule6.severity,
                status: hasEscalation ? 'warning' : 'pass'
            });
        }

        activeRules.filter(rule => !rule.isBuiltIn).forEach((rule) => {
            items.push({
                id: `custom-${rule.id}`,
                title: rule.title,
                detail: rule.detail,
                severity: rule.severity,
                status: 'warning'
            });
        });

        return items;
    }, [currentInputTransactions, databaseRows, reimbursementFormText, receiptDetailsText, rulesConfig]);

    // Drag Selection State
    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
    const [dragStartId, setDragStartId] = useState<string | null>(null);

    const handleSelectRow = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (selectedIds.has(id)) { // Fix: use selectedIds directly instead of creating a new Set first for checking
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = new Set(filteredDatabaseRows.map(r => r.id));
            setSelectedIds(allIds);
        } else {
            setSelectedIds(new Set());
        }
    };

    // Drag Selection Handlers
    const handleMouseDown = (id: string) => {
        setIsDraggingSelection(true);
        setDragStartId(id);

        // Toggle the clicked row immediately
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleMouseEnter = (id: string) => {
        if (isDraggingSelection) {
            // Add to selection if dragging
            const newSelected = new Set(selectedIds);
            newSelected.add(id);
            setSelectedIds(newSelected);
        }
    };

    const handleMouseUp = () => {
        setIsDraggingSelection(false);
        setDragStartId(null);
    };

    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    // Handle Row Click
    const handleRowClick = (row: any) => {
        setSelectedRow(row);
        setEditedRowData({ ...row });
        setIsRowEditMode(false);
        setIsRowModalOpen(true);
    };

    const handleRowModalClose = () => {
        setIsRowModalOpen(false);
        setSelectedRow(null);
        setEditedRowData(null);
    };

    const handleDeleteRow = async () => {
        if (!selectedRow) return;
        if (confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
            try {
                // Delete from Supabase
                const { error } = await supabase
                    .from('audit_logs')
                    .delete()
                    .eq('id', selectedRow.internalId);

                if (error) throw error;

                // Optimistic update
                setHistoryData(prev => prev.filter(item => item.id !== selectedRow.internalId));
                handleRowModalClose();
            } catch (e) {
                console.error("Delete failed", e);
                alert("Failed to delete record.");
            }
        }
    };

    const handleMassDelete = async () => {
        if (selectedIds.size === 0) return;

        // Map selected row IDs to actual database IDs (internalId)
        const internalIdsToDelete = new Set<string>();
        selectedIds.forEach(selectedId => {
            const row = databaseRows.find(r => r.id === selectedId);
            if (row && row.internalId) {
                internalIdsToDelete.add(row.internalId);
            }
        });

        if (internalIdsToDelete.size === 0) return;

        if (confirm(`Are you sure you want to delete ${internalIdsToDelete.size} records? This action cannot be undone.`)) {
            try {
                const idsArray = Array.from(internalIdsToDelete);

                // Delete from Supabase using internalId
                const { error } = await supabase
                    .from('audit_logs')
                    .delete()
                    .in('id', idsArray);

                if (error) throw error;

                // Optimistic UI Update - Remove all rows associated with the deleted internal IDs
                setHistoryData(prev => prev.filter(item => !internalIdsToDelete.has(item.id)));
                setSelectedIds(new Set()); // Clear selection

            } catch (e) {
                console.error("Mass delete failed", e);
                alert("Failed to delete records.");
            }
        }
    };

    const handleSaveRowChanges = async () => {
        if (!editedRowData) return;

        const originalRecord = historyData.find(r => r.id === editedRowData.internalId);
        if (!originalRecord) {
            console.error("Could not find original record to update");
            return;
        }

        let newContent = originalRecord.full_email_content || "";

        // 1. Update Staff Name in Text Blob
        // Regex: Look for "**Staff Member:**" followed by content until newline
        newContent = newContent.replace(/(\*\*Staff Member:\*\*\s*)(.*?)(\n|$)/, `$1${editedRowData.staffName}$3`);

        // 2. Update Amount in Text Blob
        const amountVal = String(editedRowData.totalAmount).replace(/[^0-9.]/g, '');
        // Regex: Look for "**Amount:**" maybe followed by "$"
        newContent = newContent.replace(/(\*\*Amount:\*\*\s*\$?)(.*?)(\n|$)/, `$1$${amountVal}$3`);

        // 3. Update Client / Location (ypName) in Text Blob
        // Regex: Look for "**Client / Location:**"
        if (newContent.match(/\*\*Client \/ Location:\*\*/)) {
            newContent = newContent.replace(/(\*\*Client \/ Location:\*\*\s*)(.*?)(\n|$)/, `$1${editedRowData.ypName}$3`);
        } else {
            // If not found, append it securely
            newContent += `\n**Client / Location:** ${editedRowData.ypName}`;
        }

        // 4. Update NAB Code in Text Blob
        // Regex: Look for "NAB Code:"
        if (newContent.match(/NAB (?:Code|Reference):/)) {
            newContent = newContent.replace(/(NAB (?:Code|Reference):(?:\*\*|)\s*)(.*?)(\n|$)/, `$1${editedRowData.nabCode}$3`);
        } else {
            newContent += `\n**NAB Code:** ${editedRowData.nabCode}`;
        }

        // Optimistic Update (Local State)
        const updatedHistory = historyData.map(item => {
            if (item.id === editedRowData.internalId) {
                return {
                    ...item,
                    staff_name: editedRowData.staffName,
                    amount: parseFloat(amountVal),
                    nab_code: editedRowData.nabCode,
                    full_email_content: newContent
                };
            }
            return item;
        });
        setHistoryData(updatedHistory);

        // Persist to Supabase
        try {
            const { error } = await supabase
                .from('audit_logs')
                .update({
                    staff_name: editedRowData.staffName,
                    amount: parseFloat(amountVal),
                    nab_code: editedRowData.nabCode,
                    full_email_content: newContent
                })
                .eq('id', editedRowData.internalId);

            if (error) throw error;

            handleRowModalClose();
        } catch (e) {
            console.error("Supabase Update Error", e);
            alert("Failed to save changes to the database. Please check your connection.");
        }
    };

    const handleSaveMassEdit = async () => {
        if (selectedIds.size === 0) return;

        // 1. Resolve unique Internal IDs (Supabase IDs)
        const uniqueInternalIds = Array.from(selectedIds).map(reactId => {
            const row = filteredDatabaseRows.find(r => r.id === reactId);
            return row ? row.internalId : null;
        }).filter(id => id !== null);

        const uniqueIdsSet = new Set(uniqueInternalIds);

        try {
            await Promise.all(Array.from(uniqueIdsSet).map(async (internalId) => {
                const originalRecord = historyData.find(r => r.id === internalId);
                if (!originalRecord) return;

                let newContent = originalRecord.full_email_content || "";
                const dbUpdates: any = {};

                // --- APPLY UPDATES ---

                // 1. Staff Name
                if (massEditData.staffName) {
                    dbUpdates.staff_name = massEditData.staffName;
                    newContent = newContent.replace(/(\*\*Staff Member:\*\*\s*)(.*?)(\n|$)/, `$1${massEditData.staffName}$3`);
                }

                // 2. Total Amount
                if (massEditData.totalAmount) {
                    const cleanAmount = massEditData.totalAmount.replace(/[^0-9.]/g, '');
                    dbUpdates.amount = parseFloat(cleanAmount);
                    newContent = newContent.replace(/(\*\*Amount:\*\*\s*\$?)(.*?)(\n|$)/, `$1$${cleanAmount}$3`);
                }

                // 3. NAB Code
                if (massEditData.nabCode) {
                    dbUpdates.nab_code = massEditData.nabCode;
                    if (newContent.match(/NAB (?:Code|Reference):/)) {
                        newContent = newContent.replace(/(NAB (?:Code|Reference):(?:\*\*|)\s*)(.*?)(\n|$)/, `$1${massEditData.nabCode}$3`);
                    } else {
                        newContent += `\n**NAB Code:** ${massEditData.nabCode}`;
                    }
                }

                // 4. Client / Location
                if (massEditData.ypName) {
                    if (newContent.match(/\*\*Client \/ Location:\*\*/)) {
                        newContent = newContent.replace(/(\*\*Client \/ Location:\*\*\s*)(.*?)(\n|$)/, `$1${massEditData.ypName}$3`);
                    } else {
                        newContent += `\n**Client / Location:** ${massEditData.ypName}`;
                    }
                }

                // 5. UID (Receipt ID) - Regex Only
                if (massEditData.uid) {
                    if (newContent.match(/\*\*Receipt ID:\*\*/)) {
                        newContent = newContent.replace(/(\*\*Receipt ID:\*\*\s*)(.*?)(\n|$)/, `$1${massEditData.uid}$3`);
                    } else {
                        newContent += `\n**Receipt ID:** ${massEditData.uid}`;
                    }
                }

                // 6. Time Stamp / Date Processed (created_at)
                if (massEditData.timestamp) {
                    const newDate = new Date(massEditData.timestamp);
                    if (!isNaN(newDate.getTime())) {
                        dbUpdates.created_at = newDate.toISOString();
                    }
                }

                // Apply Content Update
                dbUpdates.full_email_content = newContent;

                // Perform Supabase Update
                const { error } = await supabase
                    .from('audit_logs')
                    .update(dbUpdates)
                    .eq('id', internalId);

                if (error) throw error;
            }));

            // Success
            alert("Mass edit saved successfully!");
            setSelectedIds(new Set());
            setIsMassEditModalOpen(false);
            setMassEditData({
                uid: '',
                timestamp: '',
                nabCode: '',
                ypName: '',
                youngPersonName: '',
                staffName: '',
                expenseType: '',
                totalAmount: '',
                dateProcessed: ''
            });
            fetchHistory(); // Refresh to ensure consistency

        } catch (e) {
            console.error("Mass edit failed", e);
            alert("Failed to save mass edits. Please check console.");
        }
    };

    // ... (Analytics and Reports functions remain the same) ...
    const analyticsData = useMemo(() => {
        const groupedByYP: { [key: string]: number } = {};
        const groupedByStaff: { [key: string]: number } = {};
        let totalSpend = 0;
        let totalRequests = 0;

        databaseRows.forEach(row => {
            const val = parseFloat(String(row.amount).replace(/[^0-9.-]+/g, "")) || 0;

            const yp = row.ypName || 'Unknown';
            groupedByYP[yp] = (groupedByYP[yp] || 0) + val;

            const staff = row.staffName || 'Unknown';
            groupedByStaff[staff] = (groupedByStaff[staff] || 0) + val;

            totalSpend += val;
            totalRequests++;
        });

        return {
            yp: Object.entries(groupedByYP).sort((a, b) => b[1] - a[1]),
            staff: Object.entries(groupedByStaff).sort((a, b) => b[1] - a[1]),
            totalSpend,
            totalRequests
        };
    }, [databaseRows]);

    const handleGenerateReport = (type: 'weekly' | 'monthly' | 'quarterly' | 'yearly') => {
        const now = new Date();
        let startDate = new Date();
        let reportTitle = "";

        switch (type) {
            case 'weekly':
                startDate.setDate(now.getDate() - 7);
                reportTitle = "WEEKLY EXPENSE REPORT";
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                reportTitle = "MONTHLY EXPENSE REPORT (MTD)";
                break;
            case 'quarterly':
                const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
                startDate = new Date(now.getFullYear(), quarterMonth, 1);
                reportTitle = "QUARTERLY EXPENSE REPORT (QTD)";
                break;
            case 'yearly':
                startDate = new Date(now.getFullYear(), 0, 1);
                reportTitle = "ANNUAL EXPENSE REPORT (YTD)";
                break;
        }

        const relevantRows = databaseRows.filter(row => {
            return row.rawDate >= startDate;
        });

        if (relevantRows.length === 0) {
            alert("No records found for this period.");
            return;
        }

        let totalSpend = 0;
        let totalRequests = relevantRows.length;
        const staffSpend: Record<string, number> = {};
        const locationSpend: Record<string, number> = {};
        let maxItem = { product: '', amount: 0, staff: '' };
        let pendingCount = 0;

        relevantRows.forEach(row => {
            const amountStr = String(row.amount) || "0";
            const val = parseFloat(amountStr.replace(/[^0-9.-]+/g, "")) || 0;

            totalSpend += val;

            const staff = row.staffName || "Unknown";
            staffSpend[staff] = (staffSpend[staff] || 0) + val;

            const loc = row.ypName || "Unknown";
            locationSpend[loc] = (locationSpend[loc] || 0) + val;

            if (val > maxItem.amount) {
                maxItem = { product: row.product || "N/A", amount: val, staff: staff };
            }

            if (loc === "N/A" || loc === "Unknown" || staff === "Unknown") {
                pendingCount++;
            }
        });

        const topStaff = Object.entries(staffSpend).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const topLoc = Object.entries(locationSpend).sort((a, b) => b[1] - a[1]).slice(0, 3);

        let report = `[≡ƒôï CLICK TO COPY REPORT]\n\n`;
        report += `# ${reportTitle}\n`;
        report += `**Date Range:** ${startDate.toLocaleDateString()} - ${now.toLocaleDateString()}\n\n`;

        report += `## ≡ƒôè EXECUTIVE SUMMARY\n`;
        report += `| Metric | Value |\n`;
        report += `| :--- | :--- |\n`;
        report += `| **Total Spend** | **$${totalSpend.toFixed(2)}** |\n`;
        report += `| **Total Requests** | ${totalRequests} |\n`;
        report += `| **Pending Categorization** | ${pendingCount} |\n`;
        report += `| **Highest Single Item** | $${maxItem.amount.toFixed(2)} (${maxItem.product}) |\n\n`;

        report += `## ≡ƒÅå TOP SPENDERS (STAFF)\n`;
        report += `| Rank | Staff Member | Total Amount |\n`;
        report += `| :--- | :--- | :--- |\n`;
        topStaff.forEach((s, i) => {
            report += `| ${i + 1} | ${s[0]} | **$${s[1].toFixed(2)}** |\n`;
        });
        report += `\n`;

        report += `## ≡ƒôì SPENDING BY YP\n`;
        report += `| Rank | YP Name | Total Amount |\n`;
        report += `| :--- | :--- | :--- |\n`;
        topLoc.forEach((l, i) => {
            report += `| ${i + 1} | ${l[0]} | $${l[1].toFixed(2)} |\n`;
        });

        setGeneratedReport(report);
        setReportEditableContent(report);
        setIsEditingReport(false);

        navigator.clipboard.writeText(report);
        setReportCopied(type);
        setTimeout(() => setReportCopied(null), 2000);
    };

    const handleDownloadCSV = () => {
        if (filteredDatabaseRows.length === 0) return;

        const headers = [
            "UID", "Time Stamp", "YP Name", "Staff Name", "Type of expense",
            "Product", "Receipt Date", "Amount", "Total Amount", "Date Processed", "Nab Code"
        ];

        const csvRows = [
            headers.join(','),
            ...filteredDatabaseRows.map(row => {
                const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
                return [
                    escape(row.uid),
                    escape(row.timestamp),
                    escape(row.ypName),
                    escape(row.staffName),
                    escape(row.expenseType),
                    escape(row.product),
                    escape(row.receiptDate),
                    escape(row.amount),
                    escape(row.totalAmount),
                    escape(row.dateProcessed),
                    escape(row.nabCode)
                ].join(',');
            })
        ];

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reimbursement_database_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const resetAll = () => {
        setReceiptFiles([]);
        setFormFiles([]);
        setProcessingState(ProcessingState.IDLE);
        setResults(null);
        setErrorMessage(null);
        setEmailCopied(false);
        setSaveStatus('idle');
        setIsEditing(false);
        setOcrStatus('');
        setReimbursementFormText('');
        setReceiptDetailsText('');
        setRequestMode('solo');
    };

    const scrollToReimbursementForm = () => {
        setActiveTab('dashboard');
        setTimeout(() => {
            reimbursementFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            reimbursementFormRef.current?.focus();
        }, 80);
    };

    const handleStartNewAudit = () => {
        resetAll();
        fetchHistory();
        scrollToReimbursementForm();
    };

const handleCopyEmail = async () => {
        if (!results?.phase4) return;
        
        let contentToCopy = stripClientLocationLine(stripUidFallbackMeta(isEditing ? editableContent : results.phase4));
        
        if (isEditing) {
            navigator.clipboard.writeText(contentToCopy);
            setEmailCopied(true);
            setTimeout(() => setEmailCopied(false), 2000);
            return;
        }
        const emailElement = document.getElementById('email-output-content');
        if (emailElement) {
            try {
                const sanitizedElement = emailElement.cloneNode(true) as HTMLElement;
                stripClientLocationFromElement(sanitizedElement);

                const blobHtml = new Blob([sanitizedElement.innerHTML], { type: 'text/html' });
                const blobText = new Blob([stripClientLocationLine(sanitizedElement.innerText)], { type: 'text/plain' });
                const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
                await navigator.clipboard.write(data);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 2000);
                return;
            } catch (e) {
                console.warn("ClipboardItem API failed", e);
            }
        }
        navigator.clipboard.writeText(contentToCopy);
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
    };

    const handleCopyField = (text: string, fieldName: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleCopyTable = async (elementId: string, type: 'nab' | 'eod') => {
        const element = document.getElementById(elementId);
        if (!element) return;
        try {
            const blobHtml = new Blob([element.outerHTML], { type: 'text/html' });
            const blobText = new Blob([element.innerText], { type: 'text/plain' });
            const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
            await navigator.clipboard.write(data);
            setReportCopied(type);
            setTimeout(() => setReportCopied(null), 2000);
        } catch (e) {
            console.error("Failed to copy table", e);
        }
    };

    const handleSaveToCloud = async (contentOverride?: string) => {
        const contentToSave = contentOverride || (isEditing ? editableContent : results?.phase4);
        if (!contentToSave) return;
        const isPendingSave = contentToSave.includes('<!-- STATUS: PENDING -->');

        setIsSaving(true);
        setSaveStatus('idle');

        try {
            const staffBlocks = contentToSave.split('**Staff Member:**');
            const payloads = [];

            if (staffBlocks.length > 1) {
                for (let i = 1; i < staffBlocks.length; i++) {
                    const block = staffBlocks[i];
                    const staffNameLine = block.split('\n')[0].trim();
                    const amountMatch = block.match(/\*\*Amount:\*\*\s*(.*)/);
                    const nabMatch = block.match(/NAB (?:Code|Reference):(?:\*\*|)\s*(.*)/i);

                    const staffName = staffNameLine;
                    const amountRaw = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';
                    const amount = parseFloat(amountRaw.replace(/[^0-9.-]/g, '')) || 0;
                    let uniqueReceiptId = nabMatch ? nabMatch[1].trim() : null;

                    if (isPendingSave) {
                        uniqueReceiptId = 'Nab code is pending';
                    } else if (!isValidNabReference(uniqueReceiptId)) {
                        uniqueReceiptId = `BATCH-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;
                    }

                    payloads.push({
                        staff_name: staffName,
                        amount: amount,
                        nab_code: uniqueReceiptId,
                        full_email_content: contentToSave,
                        created_at: new Date().toISOString()
                    });
                }
            } else {
                const staffNameMatch = contentToSave.match(/\*\*Staff Member:\*\*\s*(.*)/);
                const amountMatch = contentToSave.match(/\*\*Amount:\*\*\s*(.*)/);
                const receiptIdMatch = contentToSave.match(/\*\*Receipt ID:\*\*\s*(.*)/);
                const nabMatch = contentToSave.match(/NAB (?:Code|Reference):(?:\*\*|)\s*(.*)/i);

                const staffName = staffNameMatch ? staffNameMatch[1].trim() : 'Unknown';
                const amountRaw = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';
                const amount = parseFloat(amountRaw.replace(/[^0-9.-]/g, '')) || 0;

                let uniqueReceiptId = nabMatch && isValidNabReference(nabMatch[1].trim()) ? nabMatch[1].trim() : (receiptIdMatch ? receiptIdMatch[1].trim() : null);

                if (isPendingSave) {
                    uniqueReceiptId = 'Nab code is pending';
                } else if (!uniqueReceiptId && (contentToSave.toLowerCase().includes('discrepancy') || contentToSave.toLowerCase().includes('mismatch') || contentToSave.includes('STATUS: PENDING'))) {
                    uniqueReceiptId = `DISC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                }

                payloads.push({
                    staff_name: staffName,
                    amount: amount,
                    nab_code: uniqueReceiptId,
                    full_email_content: contentToSave,
                    created_at: new Date().toISOString()
                });
            }

            let errorResult = await supabase.from('audit_logs').insert(payloads);

            if (errorResult.error && errorResult.error.code === '23505') { // Unique violation
                console.warn("Primary Key conflict detected. Attempting manual ID increment...");
                const { data: maxIdData } = await supabase
                    .from('audit_logs')
                    .select('id')
                    .order('id', { ascending: false })
                    .limit(1)
                    .single();

                let nextId = (maxIdData?.id || 0) + 1;

                // Apply manual IDs to payloads
                const manualPayloads = payloads.map((p, index) => ({
                    ...p,
                    id: nextId + index
                }));

                errorResult = await supabase.from('audit_logs').insert(manualPayloads);
            }

            if (errorResult.error) throw errorResult.error;

            setSaveStatus('success');
            fetchHistory();
            resetAll();
            scrollToReimbursementForm();

        } catch (error) {
            console.error("Supabase Save Error:", error);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const closeSaveModal = () => {
        setShowSaveModal(false);
        setSaveModalDecision(null);
        setReviewerOverrideReason('');
    };

    const confirmSave = (
        status: 'PENDING' | 'PAID',
        options?: { duplicateSignal?: DuplicateTrafficLight; reviewerReason?: string; detail?: string }
    ) => {
        const baseContent = isEditing ? editableContent : results?.phase4 || '';
        const withStatus = upsertStatusTag(baseContent, status);
        const finalContent = appendDuplicateAuditMeta(withStatus, options?.duplicateSignal ? {
            signal: options.duplicateSignal,
            reason: options.reviewerReason,
            detail: options.detail,
            lookbackDays: DUPLICATE_LOOKBACK_DAYS
        } : undefined);

        handleSaveToCloud(finalContent);
        closeSaveModal();
    };

    const openPendingApprovalModal = (staffGroup: PendingStaffGroup) => {
        setPendingApprovalStaffGroup(staffGroup);
        setPendingApprovalNabCode('');
    };

    const closePendingApprovalModal = () => {
        setPendingApprovalStaffGroup(null);
        setPendingApprovalNabCode('');
    };

    const handleApprovePendingRecord = async () => {
        if (!pendingApprovalStaffGroup) return;
        const approvedNabCode = pendingApprovalNabCode.trim();
        if (!approvedNabCode) return;

        setIsApprovingPending(true);
        try {
            const updatedRecords = pendingApprovalStaffGroup.records.map((record: any) => {
                let updatedContent = record.full_email_content || '';

                if (updatedContent.includes('<!-- STATUS: PENDING -->')) {
                    updatedContent = updatedContent.replace(/<!-- STATUS: PENDING -->/g, '<!-- STATUS: PAID -->');
                } else if (!updatedContent.includes('<!-- STATUS: PAID -->')) {
                    updatedContent += '\n\n<!-- STATUS: PAID -->';
                }

                if (updatedContent.match(/NAB (?:Code|Reference):/i)) {
                    updatedContent = updatedContent.replace(/(NAB (?:Code|Reference):(?:\*\*|)\s*)(.*?)(\n|$)/i, `$1${approvedNabCode}$3`);
                } else {
                    updatedContent += `\n**NAB Code:** ${approvedNabCode}`;
                }

                return {
                    id: record.id,
                    nab_code: approvedNabCode,
                    full_email_content: updatedContent
                };
            });

            await Promise.all(updatedRecords.map(async (record) => {
                const { error } = await supabase
                    .from('audit_logs')
                    .update({
                        nab_code: record.nab_code,
                        full_email_content: record.full_email_content
                    })
                    .eq('id', record.id);

                if (error) throw error;
            }));

            const updatesById = new Map<any, { id: any; nab_code: string; full_email_content: string }>(
                updatedRecords.map(record => [record.id, record])
            );
            setHistoryData(prev => prev.map(item => {
                const updated = updatesById.get(item.id);
                if (!updated) return item;
                return {
                    ...item,
                    nab_code: updated.nab_code,
                    full_email_content: updated.full_email_content
                };
            }));

            closePendingApprovalModal();
        } catch (error) {
            console.error('Failed to approve pending record:', error);
            alert('Failed to approve pending record. Please try again.');
        } finally {
            setIsApprovingPending(false);
        }
    };

    const handleMarkPendingGroupFollowedUp = async (group: PendingStaffGroup) => {
        if (!group || group.records.length === 0) return;
        setFollowUpingGroupKey(group.key);

        try {
            const followedUpAt = new Date().toISOString();
            const updates = group.records.map((record: any) => ({
                id: record.id,
                full_email_content: upsertPendingFollowedUpAt(String(record.full_email_content || ''), followedUpAt)
            }));

            await Promise.all(updates.map(async (record) => {
                const { error } = await supabase
                    .from('audit_logs')
                    .update({ full_email_content: record.full_email_content })
                    .eq('id', record.id);

                if (error) throw error;
            }));

            const updatesById = new Map<any, { id: any; full_email_content: string }>(
                updates.map(update => [update.id, update])
            );

            setHistoryData(prev => prev.map(item => {
                const updated = updatesById.get(item.id);
                if (!updated) return item;
                return {
                    ...item,
                    full_email_content: updated.full_email_content
                };
            }));
        } catch (error) {
            console.error('Failed to mark pending follow-up:', error);
            alert('Failed to update follow-up timestamp. Please try again.');
        } finally {
            setFollowUpingGroupKey(null);
        }
    };

    const handleSmartSave = () => {
        const hasTransactions = parsedTransactions.length > 0;
        const allHaveRef = parsedTransactions.every(tx => isValidNabReference(tx.currentNabRef));
        setSaveStatus('idle');

        if (duplicateCheckResult.signal === 'red') {
            const detail = `Matched ${duplicateCheckResult.redMatches.length} exact duplicate pattern(s) in the last ${DUPLICATE_LOOKBACK_DAYS} days.`;
            setSaveStatus('duplicate');
            setSaveModalDecision({ mode: 'red', detail });
            setShowSaveModal(true);
            return;
        }

        if (duplicateCheckResult.signal === 'yellow') {
            const detail = `Matched ${duplicateCheckResult.yellowMatches.length} near-duplicate pattern(s) (same Name + Date + Amount) in the last ${DUPLICATE_LOOKBACK_DAYS} days.`;
            setSaveModalDecision({ mode: 'yellow', detail });
            setShowSaveModal(true);
            return;
        }

        if (hasTransactions && !allHaveRef) {
            setSaveModalDecision({ mode: 'nab', detail: 'NAB Code is incomplete or placeholder (e.g. Enter NAB Code).' });
            setShowSaveModal(true);
            return;
        }

        const status = (hasTransactions && allHaveRef) ? 'PAID' : 'PENDING';
        confirmSave(status, {
            duplicateSignal: 'green',
            detail: `No duplicate patterns detected within ${DUPLICATE_LOOKBACK_DAYS}-day lookback.`
        });
    };

    const handleApproveManualAudit = () => {
        setShowManualAuditModal(false);
        bypassManualAuditRef.current = true;
        handleProcess();
    };

    const handleCancelManualAudit = () => {
        setShowManualAuditModal(false);
        setProcessingState(ProcessingState.IDLE);
        setOcrStatus('Needs review');
    };

    const handleProcess = async () => {
        if (!reimbursementFormText.trim() && !receiptDetailsText.trim()) {
            setErrorMessage("Please paste Reimbursement Form or Receipt Details first.");
            return;
        }

        setProcessingState(ProcessingState.PROCESSING);
        setErrorMessage(null);
        setResults(null);
        setEmailCopied(false);
        setSaveStatus('idle');
        setManualAuditIssues([]);
        setShowManualAuditModal(false);
        setIsEditing(false);
        setOcrStatus('');

        try {
            setOcrStatus('Processing...');

            const formText = reimbursementFormText.trim();
            const receiptText = receiptDetailsText.trim();

            let phase1 = '';
            let phase2 = '';
            let phase3 = '';
            let phase4 = '';
            let totalAmount = 0;
            let receiptGrandTotal: number | null = null;

            // Parse key-value pairs from Reimbursement Form
            const clientMatch = formText.match(/Client(?:'|’)?s?\s*full\s*name\s*:\s*(.+)/i);
            const addressMatch = formText.match(/Address:\s*(.+)/i);
            const staffMatch = formText.match(/Staff\s*member\s*to\s*reimburse:\s*(.+)/i);
            const approvedMatch = formText.match(/Approved\s*by:\s*(.+)/i);
            
            // Key-value parsing for Reimbursement Form
            const particularMatch = formText.match(/Particular:\s*(.+)/i);
            const datePurchasedMatch = formText.match(/Date\s*Purchased:\s*(.+)/i);
            const amountMatch = formText.match(/Amount:\s*\$?([\d,]+\.?\d*)/i);
            const onChargeMatch = formText.match(/On\s*Charge\s*Y\/N:\s*(.+)/i);
            
            const clientName = clientMatch ? clientMatch[1].trim() : '';
            const address = addressMatch ? addressMatch[1].trim() : '';
            const staffMember = staffMatch ? staffMatch[1].trim() : '';
            const approvedBy = approvedMatch ? approvedMatch[1].trim() : '';
            
            // Get total amount from either box
            const formTotalMatch = formText.match(/Total\s*Amount:\s*\$?([\d,]+\.?\d*)/i);
            const receiptTotalMatch = receiptText.match(/GRAND\s*TOTAL.*?\$\s*([\d,]+\.?\d*)/i);
            totalAmount = formTotalMatch ? parseFloat(formTotalMatch[1].replace(/,/g, '')) : 
                          receiptTotalMatch ? parseFloat(receiptTotalMatch[1].replace(/,/g, '')) : 0;
            receiptGrandTotal = receiptTotalMatch ? parseFloat(receiptTotalMatch[1].replace(/,/g, '')) : null;

            // Parse table from Receipt Details or Reimbursement Form
            const allText = formText + '\n' + receiptText;
            const lines = allText.split('\n');
            const items: Array<NormalizedReceiptRow & { amount: string; onCharge: string }> = [];
            const groupPettyCashEntries = parseGroupPettyCashEntries(allText);
            const isGroupPettyCashRequest = requestMode === 'group';

            if (isGroupPettyCashRequest && groupPettyCashEntries.length < 2) {
                setErrorMessage('Group Mode requires at least 2 staff entries (e.g., Name - 25.50).');
                setProcessingState(ProcessingState.IDLE);
                setOcrStatus('Needs review');
                return;
            }
            
            for (const line of lines) {
                if (line.trim().startsWith('|') && !line.includes('---') && 
                    !line.includes('Receipt #') && !line.includes('GRAND TOTAL') && 
                    !line.includes('Unique ID') && !line.includes('Store Name')) {
                    
                    const parts = line.split('|').map(p => p.trim()).filter(p => p);
                    
                    const normalized = normalizeReceiptRow(parts, String(totalAmount || '0.00'), '', '');
                    if (!normalized) continue;

                    items.push({
                        ...normalized,
                        amount: normalized.receiptTotal,
                        onCharge: ''
                    });
                }
            }

            // If no items from table, use key-value from form
            if (items.length === 0 && particularMatch) {
                items.push({
                    receiptNum: '1',
                    uniqueId: '',
                    storeName: particularMatch[1].trim(),
                    dateTime: datePurchasedMatch ? datePurchasedMatch[1].trim() : '',
                    product: '',
                    category: 'Other',
                    itemAmount: amountMatch ? amountMatch[1].replace('$', '').replace(',', '').trim() : '0',
                    receiptTotal: amountMatch ? amountMatch[1].replace('$', '').replace(',', '').trim() : '0',
                    notes: '',
                    amount: amountMatch ? amountMatch[1].replace('$', '').replace(',', '').trim() : '0',
                    onCharge: onChargeMatch ? onChargeMatch[1].trim() : 'N'
                });
            }

            if (isGroupPettyCashRequest) {
                totalAmount = groupPettyCashEntries.reduce((sum, entry) => sum + entry.amount, 0);
            }

            const issues = isGroupPettyCashRequest
                ? []
                : buildManualAuditIssues(
                    items,
                    totalAmount,
                    receiptGrandTotal,
                    clientName,
                    address,
                    staffMember,
                    approvedBy
                );

            if (issues.length > 0 && !bypassManualAuditRef.current) {
                setManualAuditIssues(issues);
                setShowManualAuditModal(true);
                setProcessingState(ProcessingState.IDLE);
                setOcrStatus('Needs approval');
                return;
            }
            bypassManualAuditRef.current = false;

            // Determine which format is being used
            const hasFormData = /Client(?:'|’)?s?\s*full\s*name\s*:/i.test(formText)
                || /Staff\s*member/i.test(formText)
                || /Particular/i.test(formText);
            const hasReceiptTable = receiptText.includes('Receipt #') || receiptText.includes('GRAND TOTAL') || items.length > 0;

            if (isGroupPettyCashRequest) {
                const summaryLines = groupPettyCashEntries
                    .map((entry, idx) => `${idx + 1}. ${entry.staffName} - $${entry.amount.toFixed(2)}`)
                    .join('\n');

                const staffBlocks = groupPettyCashEntries
                    .map((entry, idx) => `**Staff Member:** ${entry.staffName}\n**Amount:** $${entry.amount.toFixed(2)}\n**Receipt ID:** GROUP-${Date.now()}-${idx + 1}\n**NAB Code:** Enter NAB Code`)
                    .join('\n\n');

                phase1 = `<<<PHASE_1_START>>>
## Group Petty Cash Request Detected

${summaryLines}

**Total Amount:** $${totalAmount.toFixed(2)}

**Source:** Manual Input (No AI/API Used)
<<<PHASE_1_END>>>`;

                phase2 = `<<<PHASE_2_START>>>
## Data Standardization

Request Type: Group Petty Cash
Transaction Count: ${groupPettyCashEntries.length}
Total Amount: $${totalAmount.toFixed(2)}

${summaryLines}
<<<PHASE_2_END>>>`;

                phase3 = `<<<PHASE_3_START>>>
Group petty cash request recognized. Separate NAB slot required per staff member.
<<<PHASE_3_END>>>`;

                phase4 = `Hi,

I hope this message finds you well.

I am writing to confirm that your group petty cash reimbursement request has been prepared for processing.

${staffBlocks}

**TOTAL AMOUNT: $${totalAmount.toFixed(2)}**
`;
            } else if (hasFormData && hasReceiptTable) {

                phase1 = `<<<PHASE_1_START>>>
## Reimbursement Form Analysis

**Client's Full Name:** ${clientName}
**Address:** ${address}
**Staff Member to Reimburse:** ${staffMember}
**Approved by:** ${approvedBy}

**Items:**
${items.map((item, i) => `${i + 1}. ${item.storeName || item.product} - ${item.dateTime} - $${item.amount} (${item.category})`).join('\n')}

**Total Amount:** $${totalAmount.toFixed(2)}

**Source:** Manual Input (No AI/API Used)
<<<PHASE_1_END>>>`;

                phase2 = `<<<PHASE_2_START>>>
## Data Standardization

**Client's Full Name:** ${clientName}
**Address:** ${address}
**Staff Member to Reimburse:** ${staffMember}
**Approved by:** ${approvedBy}

**Total Amount:** $${totalAmount.toFixed(2)}

**Items Summary:**
${items.map((item, i) => `${i + 1}. ${item.storeName || item.product}: $${item.amount}`).join('\n')}
<<<PHASE_2_END>>>`;

                phase3 = `<<<PHASE_3_START>>>
${issues.length > 0
                    ? issues.map((issue, idx) => `${idx + 1}. [${issue.level.toUpperCase()}] ${issue.message}`).join('\n')
                    : 'All manual validation checks passed.'}
<<<PHASE_3_END>>>`;

                phase4 = `Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed today.

**Staff Member:** ${staffMember || '[Enter Staff Name]'}
**Client's Full Name:** ${clientName || '[Enter Client Name]'}
**Address:** ${address}
**Approved By:** ${approvedBy || '[Enter Approver]'}
**Amount:** $${totalAmount.toFixed(2)}
**Receipt ID:** ${'RCPT-MANUAL-' + Math.random().toString(36).substr(2, 4).toUpperCase()}
**NAB Code:** Enter NAB Code
<!-- UID_FALLBACKS:${items.map((item, i) => item.uniqueId || item.receiptNum || String(i + 1)).join('||')} -->

**Summary of Expenses:**

| Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${items.map((item, i) => `| ${item.receiptNum || (i + 1)} | ${item.uniqueId || '-'} | ${item.storeName || '-'} | ${item.dateTime || '-'} | ${item.product || '-'} | ${item.category || 'Other'} | ${item.itemAmount === 'Included in total' ? 'Included in total' : `$${normalizeMoneyValue(item.itemAmount, item.amount)}`} | $${normalizeMoneyValue(item.receiptTotal, item.amount)} | ${item.notes || '-'} |`).join('\n')}

**TOTAL AMOUNT: $${totalAmount.toFixed(2)}**
`;

            } else if (hasFormData) {

                phase1 = `<<<PHASE_1_START>>>
## Reimbursement Form Analysis

**Client's Full Name:** ${clientName}
**Address:** ${address}
**Staff Member to Reimburse:** ${staffMember}
**Approved by:** ${approvedBy}

**Items:**
${items.map((item, i) => `${i + 1}. ${item.storeName || item.product} - ${item.dateTime} - $${item.amount}`).join('\n')}

**Total Amount:** $${totalAmount.toFixed(2)}

**Source:** Manual Input (No AI/API Used)
<<<PHASE_1_END>>>`;

                phase2 = `<<<PHASE_2_START>>>
## Data Standardization

**Client's Full Name:** ${clientName}
**Address:** ${address}
**Staff Member to Reimburse:** ${staffMember}
**Approved by:** ${approvedBy}

**Total Amount:** $${totalAmount.toFixed(2)}
<<<PHASE_2_END>>>`;

                phase3 = `<<<PHASE_3_START>>>
${issues.length > 0
                    ? issues.map((issue, idx) => `${idx + 1}. [${issue.level.toUpperCase()}] ${issue.message}`).join('\n')
                    : 'All manual validation checks passed.'}
<<<PHASE_3_END>>>`;

                phase4 = `Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed today.

**Staff Member:** ${staffMember || '[Enter Staff Name]'}
**Client's Full Name:** ${clientName || '[Enter Client Name]'}
**Address:** ${address}
**Approved By:** ${approvedBy || '[Enter Approver]'}
**Amount:** $${totalAmount.toFixed(2)}
**Receipt ID:** ${'RCPT-MANUAL-' + Math.random().toString(36).substr(2, 4).toUpperCase()}
**NAB Code:** Enter NAB Code
<!-- UID_FALLBACKS:${items.map((item, i) => item.uniqueId || item.receiptNum || String(i + 1)).join('||')} -->

**Summary of Expenses:**

| Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${items.map((item, i) => `| ${item.receiptNum || (i + 1)} | ${item.uniqueId || '-'} | ${item.storeName || '-'} | ${item.dateTime || '-'} | ${item.product || '-'} | ${item.category || 'Other'} | ${item.itemAmount === 'Included in total' ? 'Included in total' : `$${normalizeMoneyValue(item.itemAmount, item.amount)}`} | $${normalizeMoneyValue(item.receiptTotal, item.amount)} | ${item.notes || '-'} |`).join('\n')}

**TOTAL AMOUNT: $${totalAmount.toFixed(2)}**
`;

            } else {
                // Generic fallback - just show the raw text
                const combined = [formText, receiptText].filter(t => t).join('\n\n---\n\n');
                
                phase1 = `<<<PHASE_1_START>>>
## Manual Input

${combined}

**Source:** Manual Input (No AI/API Used)
<<<PHASE_1_END>>>`;

                phase2 = `<<<PHASE_2_START>>>
## Data Standardization

Please review the input data above.
<<<PHASE_2_END>>>`;

                phase3 = `<<<PHASE_3_START>>>
${issues.length > 0
                    ? issues.map((issue, idx) => `${idx + 1}. [${issue.level.toUpperCase()}] ${issue.message}`).join('\n')
                    : 'Manual validation skipped due to limited input.'}
<<<PHASE_3_END>>>`;

                phase4 = `Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed today.

**Staff Member:** [Enter Staff Name]
**Client's Full Name:** ${clientName || '[Enter Client Name]'}
**Address:** ${address || '[Enter Address]'}
**Approved By:** [Enter Approver Name]
**Amount:** [Enter Amount]
**Receipt ID:** RCPT-MANUAL-${Math.random().toString(36).substr(2, 4).toUpperCase()}
**NAB Code:** Enter NAB Code
<!-- UID_FALLBACKS:${items.map((item, i) => item.uniqueId || item.receiptNum || String(i + 1)).join('||')} -->

Please review the details below and confirm if everything is correct.

${combined}

**Summary of Expenses:**

| Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${items.map((item, i) => `| ${item.receiptNum || (i + 1)} | ${item.uniqueId || '-'} | ${item.storeName || '-'} | ${item.dateTime || '-'} | ${item.product || '-'} | ${item.category || 'Other'} | ${item.itemAmount === 'Included in total' ? 'Included in total' : `$${normalizeMoneyValue(item.itemAmount, item.amount)}`} | $${normalizeMoneyValue(item.receiptTotal, item.amount)} | ${item.notes || '-'} |`).join('\n')}

---
*Processed using manual input (no AI/API)*
`;
            }

            setResults({ phase1, phase2, phase3, phase4 });
            setProcessingState(ProcessingState.COMPLETE);
            setOcrStatus('Complete');
        } catch (err: any) {
            bypassManualAuditRef.current = false;
            console.error(err);
            setErrorMessage(err.message || "An unexpected error occurred.");
            setProcessingState(ProcessingState.IDLE);
        }
    };

    const handleSaveEdit = () => {
        if (results) {
            setResults({ ...results, phase4: editableContent });
            setIsEditing(false);
        }
    };

    const handleCancelEdit = () => {
        if (results) setEditableContent(results.phase4);
        setIsEditing(false);
    };

    const handleDismissDiscrepancy = (id: number) => {
        if (!window.confirm("Resolve this discrepancy? This will remove it from the Outstanding list but keep the record in the Daily Activity Tracker.")) return;
        const newIds = [...dismissedIds, id];
        setDismissedIds(newIds);
        localStorage.setItem('aspire_dismissed_discrepancies', JSON.stringify(newIds));
    };

    const processRecords = (records: any[]) => {
        return records.map(r => {
            const content = r.full_email_content || "";

            const nabRefMatch = content.match(/\*\*NAB (?:Code|Reference):?\*\*?\s*(.*?)(?:\n|$)/i);
            const clientMatch = content.match(/\*\*Client \/ Location:\*\*\s*(.*?)(?:\n|$)/i);

            let isDiscrepancy = false;
            if (content.includes("<!-- STATUS: PENDING -->")) {
                isDiscrepancy = true;
            } else if (content.includes("<!-- STATUS: PAID -->")) {
                isDiscrepancy = false;
            } else {
                isDiscrepancy = content.toLowerCase().includes("discrepancy was found") ||
                    content.toLowerCase().includes("mismatch") ||
                    !content.toLowerCase().includes("successfully processed");
            }

            const clientName = clientMatch ? clientMatch[1].trim() : 'N/A';
            let nabRef = r.nab_code;

            if (!nabRef || isPendingNabCodeValue(nabRef) || (typeof nabRef === 'string' && (nabRef.startsWith('DISC-') || nabRef.startsWith('BATCH-')))) {
                if (nabRefMatch) nabRef = nabRefMatch[1].trim();
            }

            if (!nabRef || isPendingNabCodeValue(nabRef) || (typeof nabRef === 'string' && nabRef.startsWith('DISC-'))) {
                nabRef = isDiscrepancy ? 'N/A' : 'PENDING';
            }

            let discrepancyReason = '';
            if (isDiscrepancy) {
                const formAmountMatch = content.match(/Amount on Form:\s*\$([0-9,.]+)/);
                const receiptAmountMatch = content.match(/Actual Receipt Total:\s*\$([0-9,.]+)/);
                if (formAmountMatch && receiptAmountMatch) {
                    discrepancyReason = `Mismatch: Form $${formAmountMatch[1]} / Rcpt $${receiptAmountMatch[1]}`;
                } else {
                    discrepancyReason = 'Discrepancy / Pending';
                }
            }

            return {
                ...r,
                nabRef: nabRef,
                clientName: clientName,
                isDiscrepancy: isDiscrepancy,
                discrepancyReason: discrepancyReason,
                time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: new Date(r.created_at).toLocaleDateString(),
                created_at: r.created_at,
                id: r.id,
                staff_name: r.staff_name || 'Unknown',
                amount: String(r.amount || '0.00').replace('(Based on Receipts/Form Audit)', '').replace(/\*/g, '').trim(),
                isToday: new Date(r.created_at).toDateString() === new Date().toDateString()
            };
        });
    };

    const generateEODSchedule = (records: any[]) => {
        let currentTime = new Date();
        currentTime.setHours(6, 59, 0, 0);

        const scheduled = records.map(record => {
            const hasValidNabCode = isValidNabReference(record.nabRef);
            const activity = hasValidNabCode ? 'Reimbursement' : 'Pending';

            const startTime = new Date(currentTime);
            startTime.setMinutes(startTime.getMinutes() + 1);

            let duration = 0;
            if (activity === 'Reimbursement') {
                duration = Math.floor(Math.random() * (15 - 10 + 1) + 10);
            } else {
                duration = Math.floor(Math.random() * (20 - 15 + 1) + 15);
            }

            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + duration);
            currentTime = new Date(endTime);

            const timeStartStr = startTime.toLocaleTimeString('en-GB', { hour12: false });
            const timeEndStr = endTime.toLocaleTimeString('en-GB', { hour12: false });

            let status = '';
            if (activity === 'Pending') {
                const reason = String(record.discrepancyReason || '').trim();
                if (reason && reason !== 'Discrepancy / Pending') {
                    status = `Rematch (${reason.replace('Mismatch: ', '')})`;
                } else {
                    status = 'For Approval';
                }
            } else {
                status = `Paid to Nab [${record.nabRef}]`;
            }

            return {
                ...record,
                eodTimeStart: timeStartStr,
                eodTimeEnd: timeEndStr,
                eodActivity: activity,
                eodStatus: status
            };
        });

        const idleStartTime = new Date(currentTime);
        idleStartTime.setMinutes(idleStartTime.getMinutes() + 1);
        const idleEndTime = new Date(currentTime);
        idleEndTime.setHours(15, 0, 0, 0);
        idleEndTime.setMinutes(0);
        idleEndTime.setSeconds(0);

        if (idleStartTime > idleEndTime) {
            idleEndTime.setTime(idleStartTime.getTime());
        }

        const idleRow = {
            id: 'idle-row',
            eodTimeStart: idleStartTime.toLocaleTimeString('en-GB', { hour12: false }),
            eodTimeEnd: idleEndTime.toLocaleTimeString('en-GB', { hour12: false }),
            eodActivity: 'IDLE',
            clientName: '',
            staff_name: '',
            amount: '',
            date: '',
            eodStatus: ''
        };

        return [...scheduled, idleRow];
    };

    const allProcessedRecords = useMemo<any[]>(() => processRecords(historyData), [historyData]);

    const todaysProcessedRecords = useMemo<any[]>(() => {
        return allProcessedRecords
            .filter(r => r.isToday)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }, [allProcessedRecords]);

    const pendingApprovalRecords = useMemo(() => {
        return allProcessedRecords
            .filter(r => {
                if (dismissedIds.includes(r.id)) return false;
                const content = r.full_email_content || '';
                return content.includes('<!-- STATUS: PENDING -->') || isPendingNabCodeValue(r.nab_code);
            })
            .map((record: any) => {
                const pendingAgeDays = getPendingAgeDays(record);
                return {
                    ...record,
                    pendingAgeDays,
                    pendingAgingBucket: getPendingAgingBucket(pendingAgeDays)
                };
            })
            .sort((a, b) => b.pendingAgeDays - a.pendingAgeDays || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }, [allProcessedRecords, dismissedIds]);

    const pendingApprovalStaffGroups = useMemo<PendingStaffGroup[]>(() => {
        const grouped = new Map<string, PendingStaffGroup>();

        pendingApprovalRecords.forEach((record: any) => {
            const rawStaffName = String(record.staff_name || '').trim();
            const staffName = rawStaffName || 'Unknown';
            const key = staffName.toLowerCase();
            const currentDate = String(record.date || '-');

            if (!grouped.has(key)) {
                grouped.set(key, {
                    key,
                    staffName,
                    records: [record],
                    count: 1,
                    latestDate: currentDate,
                    oldestAgeDays: record.pendingAgeDays || 0
                });
                return;
            }

            const existing = grouped.get(key)!;
            existing.records.push(record);
            existing.count += 1;
            existing.oldestAgeDays = Math.max(existing.oldestAgeDays, record.pendingAgeDays || 0);

            const currentTimestamp = new Date(record.created_at || 0).getTime();
            const existingTimestamp = new Date(existing.records[0]?.created_at || 0).getTime();
            if (currentTimestamp > existingTimestamp) {
                existing.latestDate = currentDate;
            }
        });

        return Array.from(grouped.values()).sort((a, b) => b.oldestAgeDays - a.oldestAgeDays || b.count - a.count || a.staffName.localeCompare(b.staffName));
    }, [pendingApprovalRecords]);

    const pendingAgingSummary = useMemo(() => {
        return pendingApprovalRecords.reduce(
            (acc, record: any) => {
                const bucket = getPendingAgingBucket(record.pendingAgeDays || 0);
                if (bucket === 'stale') acc.stale += 1;
                else if (bucket === 'watch') acc.watch += 1;
                else acc.fresh += 1;
                return acc;
            },
            { fresh: 0, watch: 0, stale: 0 }
        );
    }, [pendingApprovalRecords]);

    const eodData = generateEODSchedule(todaysProcessedRecords);
    const accomplishedNabCount = useMemo(() => {
        const uniqueNabCodes = new Set<string>();
        todaysProcessedRecords.forEach((record: any) => {
            const nabRef = String(record.nabRef || '').trim();
            if (!isValidNabReference(nabRef)) return;
            uniqueNabCodes.add(nabRef.toUpperCase());
        });
        return uniqueNabCodes.size;
    }, [todaysProcessedRecords]);
    const pendingCountToday = todaysProcessedRecords.filter(r => !isValidNabReference(r.nabRef)).length;
    const nabReportData: any[] = todaysProcessedRecords.filter(r => !r.isDiscrepancy && r.nabRef !== 'PENDING' && r.nabRef !== '');
    const totalAmount = nabReportData.reduce((sum, r) => sum + parseFloat(String(r.amount).replace(/[^0-9.-]+/g, "")), 0);

    const getSaveButtonText = () => {
        if (isSaving) return <><RefreshCw size={12} className="animate-spin" /> Saving...</>;
        if (saveStatus === 'success') return <><RefreshCw size={12} strokeWidth={2.5} /> Start New Audit</>;
        if (saveStatus === 'error') return <><CloudUpload size={12} strokeWidth={2.5} /> Retry Save</>;
        if (saveStatus === 'duplicate') return <><AlertCircle size={12} strokeWidth={2.5} /> Duplicate Found</>;
        if (results?.phase4.toLowerCase().includes('discrepancy')) {
            return <><CloudUpload size={12} strokeWidth={2.5} /> Save Record</>;
        }
        return <><CloudUpload size={12} strokeWidth={2.5} /> Save & Pay</>;
    };

    const handleCopyGeneratedReport = async () => {
        const content = isEditingReport ? reportEditableContent : generatedReport;
        if (!content) return;
        const element = document.getElementById('generated-report-content');
        if (element && !isEditingReport) {
            try {
                const blobHtml = new Blob([element.innerHTML], { type: 'text/html' });
                const blobText = new Blob([element.innerText], { type: 'text/plain' });
                const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
                await navigator.clipboard.write(data);
                setReportCopied('generated');
                setTimeout(() => setReportCopied(null), 2000);
                return;
            } catch (e) {
                console.warn("ClipboardItem API failed", e);
            }
        }
        navigator.clipboard.writeText(content);
        setReportCopied('generated');
        setTimeout(() => setReportCopied(null), 2000);
    };

    const handleSaveReportEdit = () => {
        setGeneratedReport(reportEditableContent);
        setIsEditingReport(false);
    };

    const handleCancelReportEdit = () => {
        setReportEditableContent(generatedReport || '');
        setIsEditingReport(false);
    };

    if (loadingSplash) {
        return (
            <div className="fixed inset-0 bg-[#0f1115] z-50 flex flex-col items-center justify-center animate-in fade-in duration-700">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-[100px]"></div>
                <div className="relative z-10 flex flex-col items-center animate-pulse">
                    <Logo size={120} showText={true} />
                    <div className="mt-8 w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 animate-[width_5s_ease-in-out_forwards]" style={{ width: '0%' }}></div>
                    </div>
                    <p className="mt-4 text-slate-500 text-sm font-medium tracking-widest uppercase">Initializing Auditor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0f1115] text-slate-300 font-sans">
            {/* ... (Header Section same as before) ... */}
            <div className="relative z-10 p-6 max-w-[1600px] mx-auto">
                <header className="flex items-center justify-between mb-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-6 py-3 shadow-2xl">
                    <div className="flex items-center gap-4">
                        <div className="bg-[#312E81] p-1.5 rounded-full shadow-[0_0_15px_rgba(49,46,129,0.5)]">
                            <Logo size={28} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-white font-bold tracking-tight text-lg leading-none">ASPIRE</span>
                            <span className="text-[10px] text-slate-400 tracking-[0.2em] font-medium mt-0.5">HOMES AUDITOR</span>
                        </div>
                    </div>

                    <nav className="hidden md:flex items-center gap-1 bg-black/20 rounded-full p-1 border border-white/5">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => setActiveTab('database')}
                            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'database' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            Database
                        </button>
                        <button
                            onClick={() => setActiveTab('nab_log')}
                            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'nab_log' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            NAB
                        </button>
                        <button
                            onClick={() => setActiveTab('eod')}
                            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'eod' ? 'bg-indigo-500/20 text-indigo-400 shadow-sm border border-indigo-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            EOD
                        </button>
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            Analytics
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            Settings
                        </button>
                    </nav>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 pr-2">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold text-white">Auditor Mode</p>
                                <p className="text-xs text-indigo-400">Active</p>
                            </div>
                            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-500 to-blue-500 p-[2px]">
                                <div className="h-full w-full rounded-full bg-slate-900 flex items-center justify-center">
                                    <span className="font-bold text-white text-xs">AM</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="w-full">
                    {/* ... (Dashboard and other tabs remain same, showing Database changes here) ... */}

                    {/* Row Detail Modal */}
                    {isRowModalOpen && selectedRow && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-[#1c1e24] border border-white/10 rounded-2xl p-6 max-w-2xl w-full shadow-2xl relative">
                                <button onClick={handleRowModalClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
                                    <X size={20} />
                                </button>
                                <div className="mb-6 flex items-center justify-between pr-8">
                                    <h2 className="text-xl font-bold text-white">Transaction Details</h2>
                                    <div className="flex gap-2">
                                        {!isRowEditMode ? (
                                            <button onClick={() => setIsRowEditMode(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 text-xs font-bold uppercase tracking-wider transition-colors">
                                                <Edit2 size={14} /> Edit
                                            </button>
                                        ) : (
                                            <button onClick={() => setIsRowEditMode(false)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-bold uppercase tracking-wider transition-colors">
                                                Cancel
                                            </button>
                                        )}
                                        <button onClick={handleDeleteRow} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-bold uppercase tracking-wider transition-colors">
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Staff Name</label>
                                            {isRowEditMode ? (
                                                <input
                                                    type="text"
                                                    value={editedRowData?.staffName || ''}
                                                    onChange={(e) => setEditedRowData({ ...editedRowData, staffName: e.target.value })}
                                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                                />
                                            ) : (
                                                <p className="text-white font-medium uppercase">{selectedRow.staffName}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Amount</label>
                                            {isRowEditMode ? (
                                                <input
                                                    type="text"
                                                    value={editedRowData?.totalAmount || ''}
                                                    onChange={(e) => setEditedRowData({ ...editedRowData, totalAmount: e.target.value })}
                                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                                />
                                            ) : (
                                                <p className="text-emerald-400 font-bold text-lg">{selectedRow.totalAmount}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Client / Location</label>
                                            {isRowEditMode ? (
                                                <input
                                                    type="text"
                                                    value={editedRowData?.ypName || ''}
                                                    onChange={(e) => setEditedRowData({ ...editedRowData, ypName: e.target.value })}
                                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                                />
                                            ) : (
                                                <p className="text-slate-300 text-sm">{selectedRow.ypName}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">NAB Code</label>
                                            {isRowEditMode ? (
                                                <input
                                                    type="text"
                                                    value={editedRowData?.nabCode || ''}
                                                    onChange={(e) => setEditedRowData({ ...editedRowData, nabCode: e.target.value })}
                                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                                />
                                            ) : (
                                                <p className="text-slate-400 text-sm font-mono">{selectedRow.nabCode}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Date Processed</label>
                                            <p className="text-slate-400 text-sm">{selectedRow.dateProcessed}</p>
                                        </div>
                                    </div>
                                </div>

                                {isRowEditMode && (
                                    <div className="mt-8 pt-4 border-t border-white/10 flex justify-end gap-3">
                                        <button onClick={() => setIsRowEditMode(false)} className="px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 text-slate-400 text-sm font-medium transition-colors">
                                            Cancel Changes
                                        </button>
                                        <button onClick={handleSaveRowChanges} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors flex items-center gap-2">
                                            <Save size={16} /> Save Changes
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'database' && (
                        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-[calc(100vh-140px)]">
                            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <Database className="text-emerald-400" />
                                    <h2 className="text-xl font-semibold text-white">Expense Log</h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Staff, Client, or Amount..." className="bg-black/20 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 w-80" />
                                    </div>

                                    <button
                                        onClick={() => setIsMassEditModalOpen(true)}
                                        disabled={selectedIds.size === 0}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-sm font-medium border ${selectedIds.size > 0 ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/20 cursor-pointer' : 'bg-white/5 text-slate-500 border-white/5 cursor-not-allowed'}`}
                                    >
                                        <Edit2 size={14} />
                                        Mass Edit ({selectedIds.size})
                                    </button>

                                    {selectedIds.size > 0 && (
                                        <button
                                            onClick={handleMassDelete}
                                            className="flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-sm font-medium border bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 cursor-pointer"
                                        >
                                            <Trash2 size={14} />
                                            Delete
                                        </button>
                                    )}

                                    <button onClick={handleDownloadCSV} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Download CSV">
                                        <Download size={18} />
                                    </button>

                                    <button onClick={fetchHistory} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Refresh">
                                        <RefreshCw size={18} className={loadingHistory ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto p-0 custom-scrollbar">
                                {loadingHistory ? (
                                    <div className="p-12 text-center text-slate-500">
                                        <RefreshCw className="animate-spin mx-auto mb-3" size={32} />
                                        <p>Loading database...</p>
                                    </div>
                                ) : filteredDatabaseRows.length === 0 ? (
                                    <div className="p-12 text-center text-slate-500">
                                        <Database className="mx-auto mb-3 opacity-50" size={48} />
                                        <p className="text-lg font-medium text-slate-300">No records found</p>
                                        <p className="text-sm">Processed transactions will appear here.</p>
                                    </div>
                                ) : (
                                    <div className="min-w-max">
                                        <table className="w-full text-left border-collapse font-sans text-xs text-slate-300">
                                            <thead className="sticky top-0 z-10 bg-[#111216] text-white font-bold uppercase tracking-wider shadow-lg">
                                                <tr>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap w-[40px]">
                                                        <input
                                                            type="checkbox"
                                                            onChange={handleSelectAll}
                                                            checked={filteredDatabaseRows.length > 0 && selectedIds.size === filteredDatabaseRows.length}
                                                            className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/50"
                                                        />
                                                    </th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Time Stamp</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Nab Code</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[120px] bg-white/5">Total Amount</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Client / Location</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Client's Full Name</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Staff Name</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Type of expense</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Product</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[100px]">Receipt Date</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[100px]">Amount</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[120px]">Date Processed</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {filteredDatabaseRows.map((row, index) => (
                                                    <tr
                                                        key={row.id}
                                                        onClick={() => handleRowClick(row)}
                                                        className={`transition-colors group cursor-pointer hover:bg-white/10 ${index % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'} ${selectedIds.has(row.id) ? 'bg-indigo-500/10' : ''}`}
                                                    >
                                                        <td
                                                            className="px-4 py-3 border-r border-white/5 whitespace-nowrap cursor-pointer"
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                handleMouseDown(row.id);
                                                            }}
                                                            onMouseEnter={() => handleMouseEnter(row.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedIds.has(row.id)}
                                                                readOnly
                                                                className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/50 pointer-events-none"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.timestamp}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.nabCode}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right text-xs text-slate-200 bg-white/5">{row.totalAmount}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 truncate max-w-[250px]" title={row.ypName}>{row.ypName}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.youngPersonName}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 uppercase">{row.staffName}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.expenseType}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 truncate max-w-[200px]" title={row.product}>{row.product}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.receiptDate}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right text-xs text-slate-200">{row.amount}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-200">{row.dateProcessed}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ... (Rest of the file remains unchanged from line 1000 onwards in previous version) ... */}
                    {activeTab === 'dashboard' && (
                        // ... (Dashboard content preserved) ...
                        <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* ... */}
                            <div className="w-full lg:w-[400px] space-y-6 flex-shrink-0">
                                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative group">
                                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                                    <div className="px-6 py-5 border-b border-white/5 space-y-4">
                                        <div className="flex justify-between items-center gap-3">
                                            <h2 className={`text-lg font-semibold tracking-tight ${requestMode === 'solo' ? 'text-emerald-300' : 'text-amber-300'}`}>
                                                {requestMode === 'solo' ? 'Solo Mode' : 'Group Mode'}
                                            </h2>
                                            {results && (
                                                <button onClick={resetAll} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                                                    <RefreshCw size={16} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/25 border border-white/10 p-1">
                                            <button
                                                onClick={() => setRequestMode('solo')}
                                                className={`relative overflow-hidden rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-300 ${requestMode === 'solo'
                                                        ? 'text-emerald-100 bg-emerald-500/25 border border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.45)] animate-pulse'
                                                        : 'text-slate-400 bg-transparent border border-transparent hover:text-slate-200 hover:bg-white/5'
                                                    }`}
                                            >
                                                Solo
                                            </button>
                                            <button
                                                onClick={() => setRequestMode('group')}
                                                className={`relative overflow-hidden rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-300 ${requestMode === 'group'
                                                        ? 'text-amber-100 bg-amber-500/25 border border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.45)] animate-pulse'
                                                        : 'text-slate-400 bg-transparent border border-transparent hover:text-slate-200 hover:bg-white/5'
                                                    }`}
                                            >
                                                Group
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-6 space-y-6">
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-medium text-slate-400">Reimbursement Form</h3>
                                            <textarea
                                                ref={reimbursementFormRef}
                                                value={reimbursementFormText}
                                                onChange={(e) => setReimbursementFormText(e.target.value)}
                                                placeholder={`Client's full name: Dylan Crane
Address: 3A Acre Street, Oran Park
Staff member to reimburse: Isaac Thompson
Approved by: Isaac Thompson

Particular | Date Purchased | Amount | On Charge Y/N
Pocket Money | 15.2.25 | $20 | N
Takeout | 12.2.26 | $19.45 | N

Total Amount: $39.45`}
                                                className="w-full h-48 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors font-mono"
                                            />
                                        </div>

                                        <div className="relative">
                                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                                <div className="w-full border-t border-white/5"></div>
                                            </div>
                                            <div className="relative flex justify-center">
                                                <span className="bg-[#1c1e24] px-2 text-xs text-slate-500 uppercase tracking-widest">And/Or</span>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="text-sm font-medium text-slate-400">Receipt Details</h3>
                                            <textarea
                                                value={receiptDetailsText}
                                                onChange={(e) => setReceiptDetailsText(e.target.value)}
                                                placeholder={`Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes
1 | Hills 1% Milk 3L + Bread Loaf 650g + $6.00 + 29/01/2026 16:52 | Priceline Pharmacy | 29/01/2026 16:52 | Hills 1% Milk 3L | Groceries | Included in total | $6.00 | Walang visible OR number
1 | Hills 1% Milk 3L + Bread Loaf 650g + $6.00 + 29/01/2026 16:52 | Priceline Pharmacy | 29/01/2026 16:52 | Bread Loaf 650g | Groceries | Included in total | $6.00 | Same receipt as above
2 | 126302897245 | (Handwritten - not clear) | 31/01/2026 | Cool & Creamy - Lolly | Takeaway | $90.00 | $90.00 | Matches Incentive entry

GRAND TOTAL: $39.45`}
                                                className="w-full h-48 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors font-mono"
                                            />
                                        </div>
                                        {errorMessage && (
                                            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                                                <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
                                                <p className="text-sm text-red-200">{errorMessage}</p>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleProcess}
                                            disabled={processingState === ProcessingState.PROCESSING || (!reimbursementFormText.trim() && !receiptDetailsText.trim())}
                                            className={`w-full group relative flex justify-center items-center gap-3 py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.1)]
                        ${processingState === ProcessingState.PROCESSING
                                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                                    : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-[0_0_30px_rgba(79,70,229,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                                                }`}
                                        >
                                            {processingState === ProcessingState.PROCESSING ? (
                                                <>Processing...</>
                                            ) : (
                                                <>
                                                    <Send size={18} strokeWidth={2.5} />
                                                    Start Audit
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-[#1c1e24]/60 backdrop-blur-md rounded-[32px] border border-white/5 shadow-lg p-6 relative">
                                    <h3 className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest pl-1">Rules Status</h3>
                                    <div className="space-y-3 pl-1">
                                        {rulesStatusItems.map((rule) => {
                                            const isBlocked = rule.status === 'blocked';
                                            const isWarning = rule.status === 'warning';
                                            const badgeClass = isBlocked
                                                ? 'bg-red-500/15 text-red-300 border-red-500/30'
                                                : isWarning
                                                    ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                                                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';

                                            return (
                                                <div key={rule.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                                                    <div className="flex items-start gap-2">
                                                        {isBlocked ? (
                                                            <AlertCircle size={15} className="text-red-400 mt-0.5" />
                                                        ) : isWarning ? (
                                                            <AlertCircle size={15} className="text-amber-400 mt-0.5" />
                                                        ) : (
                                                            <CheckCircle size={15} className="text-emerald-400 mt-0.5" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-xs font-semibold text-white uppercase tracking-wide">{rule.title}</p>
                                                                <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${badgeClass}`}>{rule.status}</span>
                                                            </div>
                                                            <p className="text-xs text-slate-400 mt-1">{rule.detail}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    
                                    {/* Processing Status Badge */}
                                    {processingState === ProcessingState.PROCESSING && (
                                        <div className="mt-4 pt-4 border-t border-white/5">
                                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                <svg className="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                                </svg>
                                                Using Cloud API
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 space-y-6 min-h-[600px]">
                                {!results && processingState === ProcessingState.IDLE && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-[#1c1e24]/30 border border-dashed border-white/5 rounded-[32px] p-12 text-center backdrop-blur-sm">
                                        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                                            <LayoutDashboard size={40} className="text-slate-600" />
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Audit Dashboard</h2>
                                        <p className="max-w-sm mx-auto text-slate-400">Upload documents on the left panel to begin the auditing process.</p>
                                    </div>
                                )}
                                {!results && processingState === ProcessingState.PROCESSING && (
                                    <div className="h-full flex flex-col items-center justify-center bg-[#1c1e24]/30 border border-white/5 rounded-[32px] p-12 backdrop-blur-sm">
                                        <div className="relative w-24 h-24 mb-8">
                                            <div className="absolute inset-0 border-t-4 border-indigo-400 rounded-full animate-spin"></div>
                                            <div className="absolute inset-2 border-r-4 border-blue-400 rounded-full animate-spin animation-delay-150"></div>
                                            <div className="absolute inset-4 border-b-4 border-purple-400 rounded-full animate-spin animation-delay-300"></div>
                                        </div>
                                        <h2 className="text-xl font-bold text-white">Analyzing Documents...</h2>
                                        <p className="text-slate-400 mt-2 animate-pulse">{ocrStatus || 'Running compliance checks'}</p>
                                        
                                        {/* Processing Indicator */}
                                        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                                            Running validation checks
                                        </div>
                                    </div>
                                )}
                                {results && (
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full content-start">
                                        <div className="bg-indigo-500/5 backdrop-blur-xl rounded-[32px] border border-indigo-500/20 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.3)] xl:col-span-2 relative">
                                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] pointer-events-none"></div>
                                            <div className="px-6 py-4 border-b border-indigo-500/10 flex items-center justify-between bg-indigo-500/10">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-8 bg-indigo-400 rounded-full shadow-[0_0_15px_rgba(129,140,248,0.8)]"></div>
<h3 className="font-bold text-white text-lg flex items-center gap-2">
                                                        <CheckCircle size={24} className="text-lime-400" />
                                                        Final Decision & Email
                                                    </h3>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={saveStatus === 'success' ? handleStartNewAudit : handleSmartSave}
                                                        disabled={isSaving || isEditing}
                                                        className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${saveStatus === 'success' ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : saveStatus === 'error' || saveStatus === 'duplicate' ? 'bg-red-500 text-white shadow-red-500/20' : isEditing ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed' : 'bg-slate-700 text-white hover:bg-slate-600 shadow-slate-900/20'}`}
                                                    >
                                                        {getSaveButtonText()}
                                                    </button>
                                                    <button onClick={handleCopyEmail} disabled={isEditing} className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${emailCopied ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : isEditing ? 'bg-indigo-500/50 text-white/50 cursor-not-allowed' : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:bg-indigo-600 hover:scale-105 active:scale-95'}`}>
                                                        {emailCopied ? (<><Check size={12} strokeWidth={3} /> Copied!</>) : (<><Copy size={12} strokeWidth={3} /> Copy for Outlook</>)}
                                                    </button>
                                                </div>
                                            </div>

                                            {parsedTransactions.length > 0 && parsedTransactions.map((tx, idx) => {
                                                const selectedEmployee = selectedEmployees.get(idx);
                                                const searchQuery = employeeSearchQuery.get(idx) || tx.formattedName;
                                                const showDropdown = showEmployeeDropdown.get(idx) || false;
                                                const filteredEmployees = getFilteredEmployees(searchQuery);
                                                
                                                return (
                                                <div key={idx} className="mx-8 mt-6 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                                        <CreditCard size={80} className="text-white" />
                                                    </div>
                                                    <div className="relative z-10">
                                                        <h4 className="text-sm font-bold text-indigo-200 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                                                            Banking Details ({idx + 1}/{parsedTransactions.length})
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {/* Payee Name with Searchable Dropdown */}
                                                            <div className="bg-black/30 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-colors relative">
                                                                <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Payee Name</p>
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex-1 relative">
                                                                        <input
                                                                            type="text"
                                                                            value={searchQuery}
                                                                            onChange={(e) => handleEmployeeSearchChange(idx, e.target.value)}
                                                                            onFocus={() => handleEmployeeSearchFocus(idx)}
                                                                            onBlur={() => handleEmployeeSearchBlur(idx)}
                                                                            className="w-full bg-transparent text-white font-semibold uppercase border-none outline-none placeholder:text-slate-600"
                                                                            placeholder="Search employee..."
                                                                        />
                                                                        {/* Dropdown */}
                                                                        {showDropdown && filteredEmployees.length > 0 && (
                                                                            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1c1e24] border border-white/10 rounded-lg shadow-xl max-h-40 overflow-y-auto z-50">
                                                                                {filteredEmployees.map((emp, empIdx) => (
                                                                                    <button
                                                                                        key={empIdx}
                                                                                        onClick={() => handleEmployeeSelect(idx, emp)}
                                                                                        className="w-full text-left px-3 py-2 hover:bg-white/10 text-white text-sm uppercase transition-colors"
                                                                                    >
                                                                                        {emp.fullName}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button onClick={() => handleCopyField(searchQuery, 'name')} className="text-indigo-400 hover:text-white transition-colors ml-2">
                                                                        {copiedField === 'name' ? <Check size={14} /> : <Copy size={14} />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="bg-black/30 rounded-xl p-3 border border-white/5 hover:border-emerald-500/30 transition-colors">
                                                                <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Amount</p>
                                                                <div className="flex justify-between items-center">
                                                                    <p className="text-emerald-400 font-bold text-lg">{tx.amount.replace(/[^0-9.]/g, '')}</p>
                                                                    <button onClick={() => handleCopyField(tx.amount.replace(/[^0-9.]/g, ''), 'amount')} className="text-emerald-500 hover:text-white transition-colors">
                                                                        {copiedField === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* BSB and Account Number Row */}
                                                        <div className="grid grid-cols-2 gap-4 mt-4">
                                                            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                                                                <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">BSB</p>
                                                                <div className="flex justify-between items-center">
                                                                    <p className="text-slate-300 font-mono">{selectedEmployee?.bsb || '---'}</p>
                                                                    <button 
                                                                        onClick={() => selectedEmployee?.bsb && handleCopyField(selectedEmployee.bsb, `bsb-${idx}`)} 
                                                                        className="text-slate-500 hover:text-white transition-colors"
                                                                        disabled={!selectedEmployee?.bsb}
                                                                    >
                                                                        {copiedField === `bsb-${idx}` ? <Check size={12} /> : <Copy size={12} />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                                                                <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Account #</p>
                                                                <div className="flex justify-between items-center">
                                                                    <p className="text-slate-300 font-mono">{selectedEmployee?.account || '---'}</p>
                                                                    <button 
                                                                        onClick={() => selectedEmployee?.account && handleCopyField(selectedEmployee.account, `account-${idx}`)} 
                                                                        className="text-slate-500 hover:text-white transition-colors"
                                                                        disabled={!selectedEmployee?.account}
                                                                    >
                                                                        {copiedField === `account-${idx}` ? <Check size={12} /> : <Copy size={12} />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="mt-4 bg-black/20 rounded-xl p-3 border border-indigo-500/25">
                                                            <p className="text-[10px] uppercase text-indigo-300 font-bold mb-1">NAB Code</p>
                                                            <input
                                                                type="text"
                                                                value={tx.currentNabRef || ''}
                                                                onChange={(e) => handleTransactionNabChange(idx, e.target.value)}
                                                                placeholder="Enter NAB Code"
                                                                className="w-full bg-transparent border-none outline-none text-sm font-mono text-indigo-100 placeholder:text-indigo-300/60"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )})}
<div className="p-8 space-y-5">
                                                {missingQuickEditFields.length > 0 && (
                                                    <div className="bg-amber-500/10 border border-amber-400/30 rounded-2xl p-5">
                                                        <div className="flex items-start justify-between gap-3 mb-4">
                                                            <div>
                                                                <p className="text-xs uppercase tracking-wider font-bold text-amber-300">Missing Fields Quick Edit</p>
                                                                <p className="text-sm text-amber-100/90">Fill the missing fields below, then apply to update the email content instantly.</p>
                                                            </div>
                                                            <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 border border-amber-300/40 text-amber-100">
                                                                {missingQuickEditFields.length} Missing
                                                            </span>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            {missingQuickEditFields.map((field) => (
                                                                <div key={field.key} className="bg-black/25 border border-white/10 rounded-xl px-3 py-2.5">
                                                                    <label className="text-[10px] uppercase tracking-wider text-amber-200 font-bold block mb-1">{field.label}</label>
                                                                    <input
                                                                        type="text"
                                                                        value={quickEditDrafts[field.key] ?? field.value}
                                                                        onChange={(e) => handleQuickEditDraftChange(field.key, e.target.value)}
                                                                        placeholder={`Enter ${field.label}`}
                                                                        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div className="mt-4 flex justify-end gap-2">
                                                            <button
                                                                onClick={handleResetMissingFieldDrafts}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-200 bg-white/10 hover:bg-white/20 transition-colors"
                                                            >
                                                                Reset
                                                            </button>
                                                            <button
                                                                onClick={handleApplyMissingFieldEdits}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-black bg-amber-400 hover:bg-amber-300 transition-colors"
                                                            >
                                                                Apply Changes
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="bg-transparent rounded-xl p-8 text-white">
                                                    {isEditing ? (
                                                        <textarea value={editableContent} onChange={(e) => setEditableContent(e.target.value)} className="w-full h-[400px] p-4 font-mono text-sm border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white/5 text-white resize-none" placeholder="Edit email content here..." />
                                                    ) : (
                                                        <MarkdownRenderer 
                                                            content={stripUidFallbackMeta(results.phase4)} 
                                                            id="email-output-content" 
                                                            theme="dark" 
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-amber-500/20 shadow-xl overflow-hidden">
                                    <div className="px-6 py-5 border-b border-amber-500/20 flex items-center justify-between bg-amber-500/10">
                                        <div className="flex items-center gap-3">
                                            <AlertCircle className="text-amber-300" size={20} />
                                            <div>
                                                <h3 className="text-white font-semibold">Pending</h3>
                                                <p className="text-xs text-amber-200/80">Need NAB code before moving to paid records. Aging resets when you mark Followed Up.</p>
                                            </div>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                                            {pendingApprovalStaffGroups.length} Pending
                                        </span>
                                    </div>

                                    <div className="px-6 py-3 border-b border-white/10 bg-black/20 text-xs text-slate-300 flex flex-wrap items-center gap-3">
                                        <span className="px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-200">0-2d: {pendingAgingSummary.fresh}</span>
                                        <span className="px-2 py-1 rounded-full bg-amber-500/15 border border-amber-400/25 text-amber-200">3-7d: {pendingAgingSummary.watch}</span>
                                        <span className="px-2 py-1 rounded-full bg-red-500/15 border border-red-400/25 text-red-200">8+d: {pendingAgingSummary.stale}</span>
                                    </div>

                                    <div className="p-6 space-y-3 max-h-[360px] overflow-y-auto custom-scrollbar">
                                        {pendingApprovalStaffGroups.length > 0 ? pendingApprovalStaffGroups.map((group) => (
                                            <div key={group.key} className="bg-black/20 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-semibold text-white uppercase">{group.staffName}</p>
                                                    <p className="text-xs text-slate-400">Pending entries: {group.count}</p>
                                                    <p className="text-xs text-slate-400">Latest date: {group.latestDate}</p>
                                                    <span className={`inline-flex text-[11px] px-2 py-1 rounded-full border ${group.oldestAgeDays >= 8
                                                            ? 'bg-red-500/15 text-red-200 border-red-400/25'
                                                            : group.oldestAgeDays >= 3
                                                                ? 'bg-amber-500/15 text-amber-200 border-amber-400/25'
                                                                : 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'
                                                        }`}>
                                                        Oldest pending: {group.oldestAgeDays} day{group.oldestAgeDays === 1 ? '' : 's'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleMarkPendingGroupFollowedUp(group)}
                                                        disabled={followUpingGroupKey === group.key}
                                                        className="px-4 py-2 rounded-lg bg-indigo-500 text-white font-semibold hover:bg-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {followUpingGroupKey === group.key ? 'Updating...' : 'Followed Up'}
                                                    </button>
                                                    <button
                                                        onClick={() => openPendingApprovalModal(group)}
                                                        className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400 transition-colors"
                                                    >
                                                        Approve
                                                    </button>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-8 text-slate-400 text-sm">No pending records right now.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ... (Other Tabs like NAB, EOD, Analytics, Settings remain the same) ... */}
                    {activeTab === 'nab_log' && (
                        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* ... (NAB Log content preserved) ... */}
                            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <CreditCard className="text-emerald-400" />
                                    <h2 className="text-xl font-semibold text-white">NAB Banking Log (Today)</h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleCopyTable('nab-log-table', 'nab')} className={`px-4 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${reportCopied === 'nab' ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                                        {reportCopied === 'nab' ? <Check size={16} /> : <Copy size={16} />}
                                        {reportCopied === 'nab' ? 'Copied Table!' : 'Copy for Outlook'}
                                    </button>
                                    <button onClick={fetchHistory} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                                        <RefreshCw size={18} className={loadingHistory ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 overflow-x-auto">
                                <div className="bg-transparent rounded-lg overflow-hidden">
                                    <table id="nab-log-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '13px', backgroundColor: 'transparent', color: '#ffffff' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff', width: '100px' }}>Date</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff', width: '280px' }}>Staff Member</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff', width: '120px' }}>Category</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: '#ffffff', width: '100px' }}>Amount</th>
                                                <th style={{ padding: '10px 12px', width: '40px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {nabReportData.map((row, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'transparent' }}>
                                                    <td style={{ padding: '8px 12px', color: '#ffffff', verticalAlign: 'middle' }}>{row.date}</td>

                                                    <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M8 3 4 7l4 4" />
                                                                    <path d="M4 7h16" />
                                                                    <path d="m16 21 4-4-4-4" />
                                                                    <path d="M20 17H4" />
                                                                </svg>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#ffffff', fontSize: '12px' }}>{row.staff_name}</span>
                                                                <span style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{row.nabRef}</span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                                                        <span style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '500', color: '#ffffff', display: 'inline-block' }}>
                                                            Transfers out
                                                        </span>
                                                    </td>

                                                    <td style={{ padding: '8px 12px', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', color: '#ffffff' }}>
                                                        ${Math.abs(parseFloat(String(row.amount).replace(/[^0-9.-]+/g, ""))).toFixed(2)}
                                                    </td>

                                                    <td style={{ padding: '8px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="m9 18 6-6-6-6" />
                                                        </svg>
                                                    </td>
                                                </tr>
                                            ))}
                                            {nabReportData.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>No banking records found for today.</td>
                                                </tr>
                                            )}
                                            <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                                                <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right', color: '#ffffff', fontWeight: 'bold' }}>Total Processed:</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ffffff', fontWeight: 'bold', fontSize: '14px' }}>${totalAmount.toFixed(2)}</td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'eod' && (
                        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* ... (EOD content preserved) ... */}
                            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <ClipboardList className="text-indigo-400" />
                                    <h2 className="text-xl font-semibold text-white">End of Day Schedule</h2>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex gap-4 mr-4 text-sm">
                                        <div className="flex flex-col items-end">
                                            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Accomplished (NAB)</span>
                                            <span className="text-emerald-400 font-mono font-bold">{accomplishedNabCount}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Pending</span>
                                            <span className="text-red-400 font-mono font-bold">{pendingCountToday}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => handleCopyTable('eod-table', 'eod')} className={`px-4 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${reportCopied === 'eod' ? 'bg-indigo-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                                        {reportCopied === 'eod' ? <Check size={16} /> : <Copy size={16} />}
                                        {reportCopied === 'eod' ? 'Copied Schedule!' : 'Copy for Outlook'}
                                    </button>
                                    <button onClick={fetchHistory} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                                        <RefreshCw size={18} className={loadingHistory ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-8 overflow-x-auto">
                                <div className="bg-transparent rounded-lg overflow-hidden">
                                    <table id="eod-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '13px', backgroundColor: 'transparent', color: '#ffffff' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff', width: '100px' }}>Start</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff', width: '100px' }}>End</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff', width: '150px' }}>Activity</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff', width: '200px' }}>Staff Name</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff', width: '120px' }}>Amount</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', color: '#ffffff' }}>Description / Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {eodData.map((row: any, idx: number) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'transparent' }}>
                                                    <td style={{ padding: '12px 16px', color: '#ffffff', verticalAlign: 'top' }}>{row.eodTimeStart}</td>
                                                    <td style={{ padding: '12px 16px', color: '#ffffff', verticalAlign: 'top' }}>{row.eodTimeEnd}</td>
                                                    <td style={{ padding: '12px 16px', color: '#ffffff', verticalAlign: 'top', fontWeight: row.eodActivity === 'IDLE' ? 'bold' : 'normal' }}>{row.eodActivity}</td>
                                                    <td style={{ padding: '12px 16px', color: '#ffffff', verticalAlign: 'top', textTransform: 'uppercase' }}>{row.staff_name}</td>
                                                    <td style={{ padding: '12px 16px', color: '#ffffff', verticalAlign: 'top' }}>
                                                        {row.eodActivity === 'IDLE' ? '' : `$${parseFloat(String(row.amount).replace(/[^0-9.-]+/g, "")).toFixed(2)}`}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', color: '#ffffff', verticalAlign: 'top' }}>{row.eodStatus}</td>
                                                </tr>
                                            ))}
                                            {todaysProcessedRecords.length === 0 && (
                                                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No activity recorded for today.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'analytics' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* ... (Analytics Content same as before) ... */}
                            <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden">
                                <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-indigo-500/5">
                                    <div className="flex items-center gap-3">
                                        <FileText className="text-emerald-400" size={20} />
                                        <h3 className="font-semibold text-white">Executive Reporting Suite</h3>
                                    </div>
                                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Outlook Optimized</span>
                                </div>
                                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <button
                                        onClick={() => handleGenerateReport('weekly')}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${reportCopied === 'weekly' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}
                                    >
                                        {reportCopied === 'weekly' ? <Check size={24} className="mb-2" /> : <Calendar size={24} className="mb-2 text-indigo-400" />}
                                        <span className="text-sm font-bold">Weekly Report</span>
                                        <span className="text-[10px] text-slate-500 mt-1">Last 7 Days</span>
                                    </button>

                                    <button
                                        onClick={() => handleGenerateReport('monthly')}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${reportCopied === 'monthly' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}
                                    >
                                        {reportCopied === 'monthly' ? <Check size={24} className="mb-2" /> : <BarChart3 size={24} className="mb-2 text-blue-400" />}
                                        <span className="text-sm font-bold">Monthly Report</span>
                                        <span className="text-[10px] text-slate-500 mt-1">MTD Analysis</span>
                                    </button>

                                    <button
                                        onClick={() => handleGenerateReport('quarterly')}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${reportCopied === 'quarterly' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}
                                    >
                                        {reportCopied === 'quarterly' ? <Check size={24} className="mb-2" /> : <PieChart size={24} className="mb-2 text-purple-400" />}
                                        <span className="text-sm font-bold">Quarterly Report</span>
                                        <span className="text-[10px] text-slate-500 mt-1">QTD Trends</span>
                                    </button>

                                    <button
                                        onClick={() => handleGenerateReport('yearly')}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${reportCopied === 'yearly' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}
                                    >
                                        {reportCopied === 'yearly' ? <Check size={24} className="mb-2" /> : <TrendingUp size={24} className="mb-2 text-amber-400" />}
                                        <span className="text-sm font-bold">Yearly Report</span>
                                        <span className="text-[10px] text-slate-500 mt-1">Annual Summary</span>
                                    </button>
                                </div>
                            </div>

                            {generatedReport && (
                                <div className="bg-indigo-500/5 backdrop-blur-xl rounded-[32px] border border-indigo-500/20 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.3)] relative animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] pointer-events-none"></div>
                                    <div className="px-6 py-4 border-b border-indigo-500/10 flex items-center justify-between bg-indigo-500/10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-8 bg-indigo-400 rounded-full shadow-[0_0_15px_rgba(129,140,248,0.8)]"></div>
                                            <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                                Generated Report Preview
                                            </h3>
                                        </div>
                                        <div className="flex gap-2">
                                            {!isEditingReport ? (
                                                <button onClick={() => setIsEditingReport(true)} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-white/10 text-white hover:bg-white/20 transition-all shadow-lg">
                                                    <Edit2 size={12} strokeWidth={2.5} /> Edit
                                                </button>
                                            ) : (
                                                <>
                                                    <button onClick={handleCancelReportEdit} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all shadow-lg">
                                                        <X size={12} strokeWidth={3} /> Cancel
                                                    </button>
                                                    <button onClick={handleSaveReportEdit} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg">
                                                        <Check size={12} strokeWidth={3} /> Save Changes
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={handleCopyGeneratedReport} disabled={isEditingReport} className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${reportCopied === 'generated' ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : isEditingReport ? 'bg-indigo-500/50 text-white/50 cursor-not-allowed' : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:bg-indigo-600 hover:scale-105 active:scale-95'}`}>
                                                {reportCopied === 'generated' ? (<><Check size={12} strokeWidth={3} /> Copied!</>) : (<><Copy size={12} strokeWidth={3} /> Copy for Outlook</>)}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-8">
                                        <div className="bg-transparent rounded-xl p-8 text-white">
                                            {isEditingReport ? (
                                                <textarea value={reportEditableContent} onChange={(e) => setReportEditableContent(e.target.value)} className="w-full h-[400px] p-4 font-mono text-sm border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white/5 text-white resize-none" placeholder="Edit report content here..." />
                                            ) : (
                                                <MarkdownRenderer content={generatedReport} id="generated-report-content" theme="dark" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 p-6 shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <TrendingUp size={100} className="text-white" />
                                    </div>
                                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-1">Total Spend (Processed)</h3>
                                    <p className="text-4xl font-bold text-white mb-2">${analyticsData.totalSpend.toFixed(2)}</p>
                                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                                        <CheckCircle size={12} /> {analyticsData.totalRequests} total requests
                                    </p>
                                </div>

                                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 p-6 shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <BarChart3 size={100} className="text-blue-500" />
                                    </div>
                                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-1">Top Location (YP)</h3>
                                    <p className="text-2xl font-bold text-blue-400 mb-2 truncate">
                                        {analyticsData.yp.length > 0 ? analyticsData.yp[0][0] : 'N/A'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        ${analyticsData.yp.length > 0 ? analyticsData.yp[0][1].toFixed(2) : '0.00'} spent here
                                    </p>
                                </div>

                                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 p-6 shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <Users size={100} className="text-purple-500" />
                                    </div>
                                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-1">Top Claimant</h3>
                                    <p className="text-2xl font-bold text-purple-400 mb-2 truncate">
                                        {analyticsData.staff.length > 0 ? analyticsData.staff[0][0] : 'N/A'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        ${analyticsData.staff.length > 0 ? analyticsData.staff[0][1].toFixed(2) : '0.00'} claimed total
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden">
                                    <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <PieChart className="text-blue-400" size={20} />
                                            <h3 className="font-semibold text-white">Expenses by Location (YP)</h3>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                                            {analyticsData.yp.map(([name, amount], idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                                                            {idx + 1}
                                                        </div>
                                                        <span className="font-medium text-slate-200">{name}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-bold text-white">${amount.toFixed(2)}</span>
                                                        <div className="w-24 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                                                            <div
                                                                className="h-full bg-blue-500"
                                                                style={{ width: `${Math.min((amount / analyticsData.totalSpend) * 100, 100)}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {analyticsData.yp.length === 0 && (
                                                <p className="text-center text-slate-500 py-4">No data available.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden">
                                    <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <Users className="text-purple-400" size={20} />
                                            <h3 className="font-semibold text-white">Staff Spending</h3>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                                            {analyticsData.staff.map(([name, amount], idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                                                            {idx + 1}
                                                        </div>
                                                        <span className="font-medium text-slate-200 uppercase">{name}</span>
                                                    </div>
                                                    <span className="font-bold text-white">${amount.toFixed(2)}</span>
                                                </div>
                                            ))}
                                            {analyticsData.staff.length === 0 && (
                                                <p className="text-center text-slate-500 py-4">No data available.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* ... (Settings content preserved) ... */}
                            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Users className="text-blue-400" />
                                    <h2 className="text-xl font-semibold text-white">System Settings</h2>
                                </div>
                            </div>

                            <div className="p-8 space-y-8">
                                {/* Employee Database Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-medium text-white">Employee Database</h3>
                                            <p className="text-sm text-slate-400">Manage the list of staff names for auto-correction. Format: First Name [tab] Surname [tab] Concatenate...</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => {
                                                    if (window.confirm('Reset to default list?')) {
                                                        setEmployeeRawText(DEFAULT_EMPLOYEE_DATA);
                                                        setEmployeeList(parseEmployeeData(DEFAULT_EMPLOYEE_DATA));
                                                    }
                                                }}
                                                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors"
                                            >
                                                Reset Defaults
                                            </button>
                                            <button
                                                onClick={handleSaveEmployeeList}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${saveEmployeeStatus === 'saved' ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                            >
                                                {saveEmployeeStatus === 'saved' ? <Check size={16} /> : <Save size={16} />}
                                                {saveEmployeeStatus === 'saved' ? 'Saved' : 'Save Changes'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-black/30 rounded-xl border border-white/10 p-1">
                                        <textarea
                                            value={employeeRawText}
                                            onChange={(e) => setEmployeeRawText(e.target.value)}
                                            className="w-full h-64 bg-transparent border-none text-slate-300 font-mono text-xs p-4 focus:ring-0 resize-y"
                                            spellCheck={false}
                                        />
                                    </div>
                                </div>

                                <div className="h-px bg-white/5"></div>

                                {/* Rules Section */}
                                <div className="space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div>
                                            <h3 className="text-lg font-medium text-white">Feature Rules</h3>
                                            <p className="text-sm text-slate-400">Manage built-in and custom rules used by the Rules Status panel.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setSelectedRestoreRuleIds(new Set());
                                                setShowRestoreRulesModal(true);
                                            }}
                                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider transition-colors"
                                        >
                                            Restore Rules
                                        </button>
                                    </div>

                                    <div className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-3">
                                        <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Add Custom Rule</p>
                                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                            <input
                                                type="text"
                                                value={newRuleTitle}
                                                onChange={(e) => setNewRuleTitle(e.target.value)}
                                                placeholder="Rule title"
                                                className="md:col-span-2 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500/50 outline-none"
                                            />
                                            <input
                                                type="text"
                                                value={newRuleDetail}
                                                onChange={(e) => setNewRuleDetail(e.target.value)}
                                                placeholder="Rule detail"
                                                className="md:col-span-2 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500/50 outline-none"
                                            />
                                            <select
                                                value={newRuleSeverity}
                                                onChange={(e) => setNewRuleSeverity(e.target.value as RuleConfig['severity'])}
                                                className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500/50 outline-none"
                                            >
                                                <option value="critical">critical</option>
                                                <option value="high">high</option>
                                                <option value="medium">medium</option>
                                                <option value="info">info</option>
                                            </select>
                                        </div>
                                        <button
                                            onClick={handleRequestAddRule}
                                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider transition-colors"
                                        >
                                            Add Rule
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                                        {rulesConfig.length === 0 && (
                                            <p className="text-xs text-slate-500">No rules configured.</p>
                                        )}

                                        {rulesConfig.map((rule) => {
                                            const severityChip = rule.severity === 'critical'
                                                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                                                : rule.severity === 'high'
                                                    ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                                                    : rule.severity === 'medium'
                                                        ? 'bg-amber-500/20 text-amber-200 border-amber-500/30'
                                                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30';

                                            const isEditingRule = editingRuleId === rule.id && editingRuleDraft;

                                            return (
                                                <div key={rule.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                                    {isEditingRule ? (
                                                        <div className="space-y-2">
                                                            <input
                                                                type="text"
                                                                value={editingRuleDraft.title}
                                                                onChange={(e) => setEditingRuleDraft({ ...editingRuleDraft, title: e.target.value })}
                                                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500/50 outline-none"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={editingRuleDraft.detail}
                                                                onChange={(e) => setEditingRuleDraft({ ...editingRuleDraft, detail: e.target.value })}
                                                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500/50 outline-none"
                                                            />
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <select
                                                                    value={editingRuleDraft.severity}
                                                                    onChange={(e) => setEditingRuleDraft({ ...editingRuleDraft, severity: e.target.value as RuleConfig['severity'] })}
                                                                    className="bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white outline-none"
                                                                >
                                                                    <option value="critical">critical</option>
                                                                    <option value="high">high</option>
                                                                    <option value="medium">medium</option>
                                                                    <option value="info">info</option>
                                                                </select>
                                                                <button
                                                                    onClick={handleRequestSaveRuleEdit}
                                                                    className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider"
                                                                >
                                                                    Save
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingRuleId(null);
                                                                        setEditingRuleDraft(null);
                                                                    }}
                                                                    className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold uppercase tracking-wider"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="text-sm text-slate-100 font-semibold">{rule.title} {rule.isBuiltIn ? <span className="text-[10px] text-slate-500">(Built-in)</span> : null}</p>
                                                                    <p className="text-xs text-slate-400 mt-1">{rule.detail}</p>
                                                                </div>
                                                                <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${severityChip}`}>{rule.severity}</span>
                                                            </div>
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <p className="text-[10px] text-slate-500">Last modified: {new Date(rule.updatedAt).toLocaleString()}</p>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => handleToggleRuleEnabled(rule.id)}
                                                                        className={`px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider ${rule.enabled ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                                                    >
                                                                        {rule.enabled ? 'Enabled' : 'Disabled'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleStartEditRule(rule)}
                                                                        className="px-2.5 py-1.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-bold uppercase tracking-wider"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRequestDeleteRule(rule.id)}
                                                                        className="px-2.5 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] font-bold uppercase tracking-wider"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="h-px bg-white/5"></div>

                                {/* System Maintenance */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <h3 className="text-lg font-medium text-white mb-2">System Maintenance</h3>
                                        <p className="text-sm text-slate-400 mb-4">Manage local data and cached settings.</p>

                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-200">Dismissed Discrepancies</p>
                                                    <p className="text-xs text-slate-500">{dismissedIds.length} items hidden from pending list.</p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm('Restore all dismissed discrepancies?')) {
                                                            setDismissedIds([]);
                                                            localStorage.removeItem('aspire_dismissed_discrepancies');
                                                        }
                                                    }}
                                                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider"
                                                >
                                                    Restore All
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium text-white mb-2">System Info</h3>
                                        <p className="text-sm text-slate-400 mb-4">Version and status information.</p>

                                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">Version</span>
                                                <span className="text-slate-300 font-mono">v2.4.0 (Live)</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">Status</span>
                                                <span className="text-emerald-400 font-medium flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Online</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">Database</span>
                                                <span className="text-indigo-400 font-medium">Supabase Connected</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {showRestoreRulesModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-[#1c1e24] w-full max-w-2xl rounded-[24px] border border-white/10 shadow-2xl overflow-hidden">
                                <div className="px-6 py-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
                                    <h3 className="text-white font-bold">Restore Rules</h3>
                                    <button
                                        onClick={() => {
                                            setShowRestoreRulesModal(false);
                                            setSelectedRestoreRuleIds(new Set());
                                        }}
                                        className="text-slate-400 hover:text-white"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                <div className="p-6 space-y-4">
                                    {missingBuiltInRules.length === 0 ? (
                                        <p className="text-sm text-slate-400">No deleted built-in rules available to restore.</p>
                                    ) : (
                                        <>
                                            <p className="text-sm text-slate-300">Select which built-in rules you want to restore.</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setSelectedRestoreRuleIds(new Set(missingBuiltInRules.map(rule => rule.id)))}
                                                    className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold uppercase tracking-wider"
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    onClick={() => setSelectedRestoreRuleIds(new Set())}
                                                    className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold uppercase tracking-wider"
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                                                {missingBuiltInRules.map(rule => (
                                                    <label key={rule.id} className="flex items-start gap-3 p-3 rounded-lg bg-black/20 border border-white/10 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRestoreRuleIds.has(rule.id)}
                                                            onChange={() => toggleRestoreRuleSelection(rule.id)}
                                                            className="mt-1"
                                                        />
                                                        <div>
                                                            <p className="text-sm text-white font-medium">{rule.title}</p>
                                                            <p className="text-xs text-slate-400">{rule.detail}</p>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setShowRestoreRulesModal(false);
                                            setSelectedRestoreRuleIds(new Set());
                                        }}
                                        className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleRestoreSelectedRules}
                                        disabled={selectedRestoreRuleIds.size === 0 || missingBuiltInRules.length === 0}
                                        className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Restore Selected Rules ({selectedRestoreRuleIds.size})
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {pendingRuleAction && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-[#1c1e24] w-full max-w-xl rounded-[24px] border border-white/10 shadow-2xl overflow-hidden">
                                <div className="px-6 py-5 border-b border-white/10 bg-white/5 flex items-center gap-3">
                                    <HelpCircle className="text-indigo-300" size={20} />
                                    <div>
                                        <h3 className="text-white font-bold">
                                            {pendingRuleAction.type === 'add' ? 'Confirm Add Rule' : pendingRuleAction.type === 'edit' ? 'Confirm Edit Rule' : 'Confirm Delete Rule'}
                                        </h3>
                                        <p className="text-xs text-slate-300">
                                            {pendingRuleAction.type === 'add' && 'This will add the new rule to your rule engine.'}
                                            {pendingRuleAction.type === 'edit' && 'This will update the selected rule.'}
                                            {pendingRuleAction.type === 'delete' && 'Deleting a rule may reduce fraud checks. Continue only if you accept the risk.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="p-6 space-y-3">
                                    {pendingRuleAction.type === 'delete' && (
                                        <>
                                            <p className="text-xs text-amber-300">Type this exact sentence to delete:</p>
                                            <p className="text-xs text-slate-200 font-mono bg-black/20 border border-white/10 rounded p-2">{DELETE_RULE_CONFIRMATION_PHRASE}</p>
                                            <input
                                                type="text"
                                                value={deleteConfirmText}
                                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                                placeholder="Type exact sentence"
                                                className="w-full bg-black/20 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-red-500/60"
                                            />
                                        </>
                                    )}
                                </div>

                                <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setPendingRuleAction(null);
                                            setDeleteConfirmText('');
                                        }}
                                        className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleConfirmRuleAction}
                                        disabled={pendingRuleAction.type === 'delete' && deleteConfirmText !== DELETE_RULE_CONFIRMATION_PHRASE}
                                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${pendingRuleAction.type === 'delete' ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-emerald-500 text-black hover:bg-emerald-400'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {pendingRuleAction.type === 'delete' ? 'Delete Rule' : 'Confirm'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Save Status Modal */}
                    {showSaveModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-[#1c1e24] w-full max-w-xl rounded-[24px] border border-white/10 shadow-2xl overflow-hidden">
                                <div className={`px-6 py-5 border-b border-white/10 flex items-center gap-3 ${saveModalDecision?.mode === 'red' ? 'bg-red-500/10' : saveModalDecision?.mode === 'yellow' ? 'bg-amber-500/10' : 'bg-white/5'}`}>
                                    {saveModalDecision?.mode === 'red' ? (
                                        <AlertCircle className="text-red-300" size={20} />
                                    ) : saveModalDecision?.mode === 'yellow' ? (
                                        <AlertCircle className="text-amber-300" size={20} />
                                    ) : (
                                        <HelpCircle className="text-indigo-300" size={20} />
                                    )}
                                    <div>
                                        <h3 className="text-white font-bold">
                                            {saveModalDecision?.mode === 'red' && 'Possible Double Payment'}
                                            {saveModalDecision?.mode === 'yellow' && 'Potential Duplicate Needs Review'}
                                            {(!saveModalDecision || saveModalDecision.mode === 'nab') && 'Choose Save Status'}
                                        </h3>
                                        <p className="text-xs text-slate-300">
                                            {saveModalDecision?.detail || 'NAB Code is incomplete or placeholder (e.g. Enter NAB Code).'}
                                        </p>
                                    </div>
                                </div>
                                <div className="px-6 py-5 text-sm text-slate-300 space-y-3">
                                    {(saveModalDecision?.mode === 'red' || saveModalDecision?.mode === 'yellow') && (
                                        <>
                                            <p className="text-slate-200">
                                                {saveModalDecision.mode === 'red'
                                                    ? 'Save & Pay is blocked. You may only continue as Pending with reviewer override reason.'
                                                    : 'This can proceed only as Pending. Reviewer reason is required for audit trail.'}
                                            </p>
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">Reviewer reason (required)</label>
                                                <textarea
                                                    value={reviewerOverrideReason}
                                                    onChange={(e) => setReviewerOverrideReason(e.target.value)}
                                                    rows={3}
                                                    placeholder="Explain why this should be saved as pending"
                                                    className="w-full bg-black/20 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-400/70 resize-none"
                                                />
                                            </div>
                                        </>
                                    )}
                                    {(!saveModalDecision || saveModalDecision.mode === 'nab') && (
                                        <p className="text-center">Save this entry as</p>
                                    )}
                                </div>
                                <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex justify-end gap-3">
                                    <button
                                        onClick={closeSaveModal}
                                        className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    {(saveModalDecision?.mode === 'red' || saveModalDecision?.mode === 'yellow') ? (
                                        <button
                                            onClick={() => confirmSave('PENDING', {
                                                duplicateSignal: saveModalDecision.mode,
                                                reviewerReason: reviewerOverrideReason,
                                                detail: saveModalDecision.detail
                                            })}
                                            disabled={!reviewerOverrideReason.trim()}
                                            className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Save as PENDING
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => confirmSave('PENDING', { duplicateSignal: 'green', detail: 'Saved as pending due to incomplete NAB reference.' })}
                                                className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
                                            >
                                                Save as PENDING
                                            </button>
                                            <button
                                                onClick={() => confirmSave('PAID', { duplicateSignal: 'green', detail: 'No duplicate patterns detected at save approval.' })}
                                                className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400 transition-colors"
                                            >
                                                Save as PAID
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {pendingApprovalStaffGroup && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-[#1c1e24] w-full max-w-lg rounded-[24px] border border-white/10 shadow-2xl overflow-hidden">
                                <div className="px-6 py-5 border-b border-white/10 bg-emerald-500/10 flex items-center gap-3">
                                    <CheckCircle className="text-emerald-300" size={20} />
                                    <div>
                                        <h3 className="text-white font-bold">Approve Pending Record</h3>
                                        <p className="text-xs text-slate-300">Required ang NAB code bago ma-approve.</p>
                                    </div>
                                </div>

                                <div className="p-6 space-y-3">
                                    <div>
                                        <p className="text-xs text-slate-400 mb-1">Staff</p>
                                        <p className="text-sm text-white font-semibold uppercase">{pendingApprovalStaffGroup.staffName || 'Unknown'}</p>
                                        <p className="text-xs text-slate-400 mt-1">Entries to approve: {pendingApprovalStaffGroup.count}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400 block mb-1">NAB Code</label>
                                        <input
                                            type="text"
                                            value={pendingApprovalNabCode}
                                            onChange={(e) => setPendingApprovalNabCode(e.target.value)}
                                            placeholder="Enter NAB Code"
                                            className="w-full bg-black/20 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60"
                                        />
                                    </div>
                                </div>

                                <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex justify-end gap-3">
                                    <button
                                        onClick={closePendingApprovalModal}
                                        disabled={isApprovingPending}
                                        className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleApprovePendingRecord}
                                        disabled={isApprovingPending || !pendingApprovalNabCode.trim()}
                                        className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isApprovingPending ? 'Approving...' : 'Confirm Approval'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Manual Validation Approval Modal */}
                    {showManualAuditModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-[#1c1e24] w-full max-w-2xl rounded-[28px] border border-amber-500/30 shadow-2xl overflow-hidden">
                                <div className="px-6 py-5 border-b border-white/10 bg-amber-500/10 flex items-center gap-3">
                                    <AlertCircle className="text-amber-300" size={20} />
                                    <div>
                                        <h3 className="text-white font-bold">Manual Rule Check Needs Approval</h3>
                                        <p className="text-xs text-amber-200/90">May nakita akong issues. Review then approve para mag-continue.</p>
                                    </div>
                                </div>

                                <div className="p-6 max-h-[55vh] overflow-y-auto space-y-3">
                                    {manualAuditIssues.map((issue, idx) => (
                                        <div key={idx} className={`rounded-xl border p-3 ${issue.level === 'error' ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                                            <p className={`text-sm ${issue.level === 'error' ? 'text-red-200' : 'text-amber-100'}`}>
                                                <span className="font-bold uppercase mr-2">{issue.level}</span>
                                                {issue.message}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex justify-end gap-3">
                                    <button
                                        onClick={handleCancelManualAudit}
                                        className="px-5 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        Ayusin Muna
                                    </button>
                                    <button
                                        onClick={handleApproveManualAudit}
                                        className="px-5 py-2.5 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
                                    >
                                        Approve & Continue
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Mass Edit Modal */}
                    {isMassEditModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-[#1c1e24] w-full max-w-2xl rounded-[32px] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-8 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Mass Edit Records</h2>
                                            <p className="text-xs text-indigo-300 font-medium uppercase tracking-wider">Editing {selectedIds.size} Selected Items</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setIsMassEditModalOpen(false)} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10">
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="p-8 overflow-y-auto custom-scrollbar space-y-6">
                                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mb-6">
                                        <p className="text-indigo-200 text-sm flex gap-2">
                                            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                                            <span><strong>Note:</strong> Only filled fields will be updated. Leave fields blank to keep original values.</span>
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Time Stamp */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Time Stamp (Date)</label>
                                            <input type="text" value={massEditData.timestamp} onChange={(e) => setMassEditData({ ...massEditData, timestamp: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-700" placeholder="YYYY-MM-DD HH:mm:ss" />
                                        </div>

                                        {/* Nab Code */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nab Code</label>
                                            <input type="text" value={massEditData.nabCode} onChange={(e) => setMassEditData({ ...massEditData, nabCode: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-700" placeholder="(Keep Original)" />
                                        </div>

                                        {/* Client / Location */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Client / Location</label>
                                            <input type="text" value={massEditData.ypName} onChange={(e) => setMassEditData({ ...massEditData, ypName: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-700" placeholder="(Keep Original)" />
                                        </div>

                                        {/* Staff Name */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Staff Name</label>
                                            <input type="text" value={massEditData.staffName} onChange={(e) => setMassEditData({ ...massEditData, staffName: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-700" placeholder="(Keep Original)" />
                                        </div>

                                        {/* Total Amount */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Amount</label>
                                            <input type="number" value={massEditData.totalAmount} onChange={(e) => setMassEditData({ ...massEditData, totalAmount: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-700" placeholder="(Keep Original)" />
                                        </div>
                                    </div>

                                </div>
                                <div className="p-6 border-t border-white/5 bg-black/20 flex justify-end gap-3">
                                    <button onClick={() => setIsMassEditModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm">Cancel</button>
                                    <button onClick={handleSaveMassEdit} className="px-8 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg hover:shadow-indigo-500/25 transition-all transform hover:scale-105 active:scale-95 text-sm flex items-center gap-2">
                                        <Save size={18} />
                                        Update {selectedIds.size} Records
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </main>
            </div>
        </div>
    );
};
