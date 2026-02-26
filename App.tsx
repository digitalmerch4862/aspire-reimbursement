import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Upload, X, FileText, FileSpreadsheet, CheckCircle, Loader2,
    HelpCircle, AlertCircle, RefreshCw, Send, LayoutDashboard, Edit2, Check,
    Copy, CreditCard, ClipboardList, Calendar, BarChart3, PieChart, TrendingUp,
    Users, Database, Search, Download, Save, CloudUpload, Trash2, Plus

} from 'lucide-react';
import FileUpload from './components/FileUpload';
import MarkdownRenderer from './components/MarkdownRenderer';
import Logo from './components/Logo';
import SoloMode from './components/Dashboard/SoloMode';
import GroupMode from './components/Dashboard/GroupMode';
import ManualMode from './components/Dashboard/ManualMode';
import LiquidationTracker from './components/Dashboard/LiquidationTracker';
import ModeTabs, { DashboardMode } from './components/Dashboard/ModeTabs';
import { FileWithPreview, ProcessingResult, ProcessingState } from './types';
import * as ModeLogic from './logic/modes';


import { hasSupabaseEnv, supabase } from './services/supabaseClient';

// Default Data for Employee List
const DEFAULT_EMPLOYEE_DATA = `First Names	Surname	Concatenate	BSB	Account
John	Smith	Smith, John	000000	00000000
Jane	Doe	Doe, Jane	000000	00000000`;

interface Employee {
    id: string;
    firstName: string;
    surname: string;
    fullName: string;
    bsb: string;
    account: string;
}

const NICKNAME_MAP: Record<string, string[]> = {
    tim: ['timothy'],
    mike: ['michael'],
    alex: ['alexander', 'alexandra'],
    liz: ['elizabeth'],
    beth: ['elizabeth'],
    dan: ['daniel'],
    ben: ['benjamin'],
    sam: ['samuel'],
    chris: ['christopher', 'christina'],
    matt: ['matthew'],
    kate: ['katherine'],
    tony: ['anthony']
};

const normalizeEmployeeName = (value: string): string => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getEmployeeDisplayName = (employee: Employee): string => {
    const composed = `${employee.firstName || ''} ${employee.surname || ''}`.replace(/\s+/g, ' ').trim();
    return composed || employee.fullName || '';
};

const expandInputNameVariants = (rawInput: string): string[] => {
    const normalized = normalizeEmployeeName(rawInput);
    if (!normalized) return [];

    const variants = new Set<string>([normalized]);
    const parts = normalized.split(' ').filter(Boolean);
    if (parts.length === 0) return Array.from(variants);

    const firstToken = parts[0];
    const nicknameExpansions = NICKNAME_MAP[firstToken] || [];
    nicknameExpansions.forEach((expandedFirst) => {
        variants.add([expandedFirst, ...parts.slice(1)].join(' ').trim());
    });

    return Array.from(variants);
};

const levenshteinDistance = (a: string, b: string): number => {
    const s = normalizeEmployeeName(a);
    const t = normalizeEmployeeName(b);
    if (!s) return t.length;
    if (!t) return s.length;

    const rows = s.length + 1;
    const cols = t.length + 1;
    const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 0; i < rows; i += 1) dp[i][0] = i;
    for (let j = 0; j < cols; j += 1) dp[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return dp[s.length][t.length];
};

const matchScore = (inputName: string, employee: Employee): number => {
    const normalizedInput = normalizeEmployeeName(inputName);
    const normalizedFull = normalizeEmployeeName(getEmployeeDisplayName(employee));
    const normalizedFirst = normalizeEmployeeName(employee.firstName);
    const normalizedSurname = normalizeEmployeeName(employee.surname);

    if (!normalizedInput || !normalizedFull) return 0;
    if (normalizedInput === normalizedFull) return 100;

    const inputParts = normalizedInput.split(' ').filter(Boolean);
    const surnameGuess = inputParts[inputParts.length - 1] || '';
    const firstGuess = inputParts.slice(0, -1).join(' ');

    const fullDistance = levenshteinDistance(normalizedInput, normalizedFull);
    const fullMax = Math.max(normalizedInput.length, normalizedFull.length) || 1;
    const fullScore = ((fullMax - fullDistance) / fullMax) * 100;

    const surnameDistance = levenshteinDistance(surnameGuess, normalizedSurname);
    const surnameMax = Math.max(surnameGuess.length, normalizedSurname.length) || 1;
    const surnameScore = ((surnameMax - surnameDistance) / surnameMax) * 100;

    const firstDistance = levenshteinDistance(firstGuess, normalizedFirst);
    const firstMax = Math.max(firstGuess.length, normalizedFirst.length) || 1;
    const firstScore = ((firstMax - firstDistance) / firstMax) * 100;

    const containsBonus = normalizedFull.includes(normalizedInput) || normalizedInput.includes(normalizedFull) ? 8 : 0;
    const finalScore = (fullScore * 0.45) + (surnameScore * 0.4) + (firstScore * 0.15) + containsBonus;

    return Math.max(0, Math.min(100, Number(finalScore.toFixed(2))));
};

const parseDelimitedLine = (line: string, delimiter: ',' | '\t'): string[] => {
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

const parseEmployeeData = (rawData: string): Employee[] => {
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
                id: `${normalizeEmployeeName(firstName)}_${normalizeEmployeeName(surname)}_${account}_${index}`,
                firstName,
                surname,
                fullName: `${firstName} ${surname}`,
                bsb,
                account
            };
        })
        .filter((item): item is Employee => item !== null);
};

const serializeEmployeeData = (employees: Employee[]): string => {
    const header = 'First Names,Surname,BSB,Account';
    const rows = employees.map((employee) => `${employee.firstName},${employee.surname},${employee.bsb},${employee.account}`);
    return [header, ...rows].join('\n');
};

const findBestEmployeeMatches = (scannedName: string, employees: Employee[], limit = 10): Array<{ employee: Employee; score: number }> => {
    if (!scannedName) return [];
    const variants = expandInputNameVariants(scannedName);
    if (variants.length === 0) return [];

    const scored = employees.map((employee) => {
        const normalizedDisplay = normalizeEmployeeName(getEmployeeDisplayName(employee));
        const normalizedSurname = normalizeEmployeeName(employee.surname);
        const normalizedFirst = normalizeEmployeeName(employee.firstName);

        let bestScore = 0;
        variants.forEach((variant) => {
            const base = matchScore(variant, employee);
            const wildcardBoost = normalizedDisplay.includes(variant) || variant.includes(normalizedDisplay) ? 9 : 0;
            const variantTokens = variant.split(' ').filter(Boolean);
            const surnameToken = variantTokens[variantTokens.length - 1] || '';
            const firstToken = variantTokens[0] || '';
            const surnameBoost = surnameToken && normalizedSurname.includes(surnameToken) ? 12 : 0;
            const firstBoost = firstToken && normalizedFirst.includes(firstToken) ? 8 : 0;
            bestScore = Math.max(bestScore, Math.min(100, base + wildcardBoost + surnameBoost + firstBoost));
        });

        return { employee, score: Number(bestScore.toFixed(2)) };
    });

    return scored
        .sort((a, b) => b.score - a.score || getEmployeeDisplayName(a.employee).localeCompare(getEmployeeDisplayName(b.employee)))
        .slice(0, Math.max(5, Math.min(10, limit)));
};

const stripUidFallbackMeta = (text: string): string => {
    return text.replace(/<!--\s*UID_FALLBACKS:.*?-->\s*/gi, '');
};

const stripInternalAuditMeta = (text: string): string => {
    return String(text || '')
        .replace(/<!--\s*UID_FALLBACKS:.*?-->\s*/gi, '')
        .replace(/<!--\s*STATUS:\s*(?:PENDING|PAID)\s*-->\s*/gi, '')
        .replace(/<!--\s*DUPLICATE_AUDIT:.*?-->\s*/gi, '')
        .replace(/<!--\s*PENDING_FOLLOWED_UP_AT:\s*.*?-->\s*/gi, '')
        .replace(/<!--\s*JULIAN_APPROVAL_BLOCK_(?:START|END)\s*-->\s*/gi, '')
        .replace(/<!--\s*CLAIMANT_REVISION_BLOCK_(?:START|END)\s*-->\s*/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const LOCAL_AUDIT_LOGS_KEY = 'aspire_local_audit_logs';
const SPECIAL_INSTRUCTION_LOGS_KEY = 'aspire_special_instruction_logs';
const GROUP_LIQUIDATION_QUEUE_KEY = 'aspire_group_liquidation_queue';
const EMPLOYEE_PENDING_DEACTIVATION_KEY = 'aspire_employee_pending_deactivation';
const EMPLOYEE_ALIAS_MAP_KEY = 'aspire_employee_alias_map';
const JULIAN_APPROVER_NAME = 'Julian';

interface GroupLiquidationQueueItem {
    id: string;
    staffName: string;
    staffKey: string;
    ypName: string;
    location: string;
    amount: string;
    weekKey: string;
    createdAt: string;
}

const getStartOfWeekLocal = (input: Date): Date => {
    const date = new Date(input);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diffToMonday);
    return date;
};

const getWeekKeyLocal = (input: Date): string => {
    const start = getStartOfWeekLocal(input);
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    const day = String(start.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const loadLocalAuditLogs = (): any[] => {
    try {
        const raw = localStorage.getItem(LOCAL_AUDIT_LOGS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const saveLocalAuditLogs = (records: any[]): void => {
    try {
        localStorage.setItem(LOCAL_AUDIT_LOGS_KEY, JSON.stringify(records));
    } catch (error) {
        console.warn('Failed to save local audit logs', error);
    }
};

const loadSpecialInstructionLogs = (): any[] => {
    try {
        const raw = localStorage.getItem(SPECIAL_INSTRUCTION_LOGS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const saveSpecialInstructionLogs = (records: any[]): void => {
    try {
        localStorage.setItem(SPECIAL_INSTRUCTION_LOGS_KEY, JSON.stringify(records));
    } catch (error) {
        console.warn('Failed to save special instruction logs', error);
    }
};

const loadGroupLiquidationQueue = (): GroupLiquidationQueueItem[] => {
    try {
        const raw = localStorage.getItem(GROUP_LIQUIDATION_QUEUE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item: any) => ({
                id: String(item?.id || ''),
                staffName: String(item?.staffName || 'Unknown').trim() || 'Unknown',
                staffKey: normalizeNameKey(String(item?.staffKey || item?.staffName || 'Unknown')),
                ypName: String(item?.ypName || '-').trim() || '-',
                location: String(item?.location || '-').trim() || '-',
                amount: normalizeMoneyValue(String(item?.amount || '0.00'), '0.00'),
                weekKey: String(item?.weekKey || (() => {
                    const parsedDate = new Date(item?.createdAt || Date.now());
                    return Number.isNaN(parsedDate.getTime()) ? getWeekKeyLocal(new Date()) : getWeekKeyLocal(parsedDate);
                })()),
                createdAt: String(item?.createdAt || new Date().toISOString())
            }))
            .filter((item: GroupLiquidationQueueItem) => item.id.length > 0 && item.staffKey.length > 0);
    } catch {
        return [];
    }
};

const saveGroupLiquidationQueue = (records: GroupLiquidationQueueItem[]): void => {
    try {
        localStorage.setItem(GROUP_LIQUIDATION_QUEUE_KEY, JSON.stringify(records));
    } catch (error) {
        console.warn('Failed to save group liquidation queue', error);
    }
};

const stripClientLocationLine = (text: string): string => {
    return String(text || '')
        .replace(/^\*\*Client\s*\/\s*Location:\*\*\s*.*(?:\r?\n|$)/gim, '')
        .replace(/^Client\s*\/\s*Location:\s*.*(?:\r?\n|$)/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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

    if (invalidValues.includes(normalized)) return false;
    return /^[a-z][0-9]{10}$/i.test(normalized);
};

const isPendingNabCodeValue = (value: string | null | undefined): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'pending_liquidation') return false;
    return [
        'pending',
        'nab code is pending',
        'enter nab code',
        'enter nab reference',
        '[enter nab code]',
        'n/a',
        '---'
    ].some(p => normalized === p || normalized.includes(p));
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
    totalAmount: number;
    latestDate: string;
    oldestAgeDays: number;
}

interface GroupPettyCashEntry {
    staffName: string;
    amount: number;
    ypName?: string;
    location?: string;
}


interface InputTransactionFingerprint {
    staffName: string;
    amount: number;
    totalAmount: number;
    uid: string;
    storeName: string;
    product: string;
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
    txStoreName: string;
    txProduct: string;
    txDateTime: string;
    txDateKey: string;
    txAmount: string;
    txTotalAmount: string;
    txReference: string;
    historyStaffName: string;
    historyStoreName: string;
    historyProduct: string;
    historyDateTime: string;
    historyDateKey: string;
    historyAmount: string;
    historyTotalAmount: string;
    historyReference: string;
    historyNabCode: string;
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

interface SaveToastState {
    visible: boolean;
    nabCode: string;
    amount: string;
    recordCount: number;
}

interface WarningToastState {
    visible: boolean;
    message: string;
}

type RequestMode = 'solo' | 'group' | 'manual';


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
        { id: 'r1', title: 'Fraud Exact Match', detail: 'Exact match using staff name + store name + purchase date + amount.', severity: 'critical', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r2', title: 'Fraud Near Match', detail: 'Near match using staff name + store name + amount (date mismatch or missing).', severity: 'high', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r3', title: 'Receipt Amount > $300', detail: 'More than $300 is partial blocked and routed for approval.', severity: 'high', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r4', title: 'Purchase Date Age (> 30 days)', detail: 'Flags receipts older than 30 days from purchase date.', severity: 'medium', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r5', title: 'Staff & Store Integrity', detail: 'Checks if staff name and store name are present for fraud validation.', severity: 'high', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r7', title: 'Form and Receipt Total Consistency', detail: 'Compares reimbursement form total and receipt total and applies mismatch policy.', severity: 'high', enabled: true, isBuiltIn: true, updatedAt: now },
        { id: 'r6', title: 'Subject for Approval', detail: 'Marks if request needs approval based on rule outcomes.', severity: 'info', enabled: true, isBuiltIn: true, updatedAt: now }
    ];
};

const dateLikeRegex = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\btime\b|\b\d{1,2}:\d{2}\s*(?:am|pm)?\b)/i;

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
    const extracted: GroupPettyCashEntry[] = [];

    // Extract common location if present
    const locationMatch = rawText.match(/(?:Client\s*\/\s*Location|Location)\s*:\s*(.+)/i);
    const commonLocation = locationMatch ? locationMatch[1].trim() : '';

    const normalizeStaffName = (value: string): string => {
        let staffName = String(value || '').trim();
        if (staffName.includes(',')) {
            const p = staffName.split(',');
            if (p.length >= 2) staffName = `${p[1].trim()} ${p[0].trim()}`;
        }
        return staffName;
    };

    const parseAmount = (value: string): number => {
        const parsed = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    };

    // New format support: Staff Name | YP Name | Amount
    const allLines = rawText.split(/\r?\n/).map((line) => line.trim());
    const headerIndex = allLines.findIndex((line) => {
        if (!line.includes('|')) return false;
        const normalized = line.replace(/^\|/, '').replace(/\|$/, '').trim();
        const cols = normalized.split('|').map((c) => c.trim());
        if (cols.length !== 3) return false;
        return /^staff\s*name$/i.test(cols[0])
            && /^(?:yp|yb)\s*name$/i.test(cols[1])
            && /^amount$/i.test(cols[2]);
    });

    if (headerIndex >= 0) {
        let startedRows = false;
        for (let i = headerIndex + 1; i < allLines.length; i += 1) {
            const line = allLines[i];
            if (!line) {
                if (startedRows) break;
                continue;
            }
            if (!line.includes('|')) {
                if (startedRows) break;
                continue;
            }

            const normalized = line.replace(/^\|/, '').replace(/\|$/, '').trim();
            if (!normalized || /^:?-{3,}/.test(normalized.replace(/\|/g, '').trim())) continue;

            const cols = normalized.split('|').map((c) => c.trim());
            if (cols.length < 3) continue;

            const staffName = normalizeStaffName(cols[0]);
            const ypName = String(cols[1] || '').trim();
            const amount = parseAmount(cols[2]);
            if (!staffName || amount <= 0) continue;

            startedRows = true;
            extracted.push({ staffName, amount, ypName, location: commonLocation });
        }
    }

    // Existing format support: Staff Member block style
    if (extracted.length === 0) {
        const blocks = rawText.split(/Staff\s*Member\s*:/gi);

        // Skip first part as it's usually the header/location
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];

            // Extract Name (it's the first line of the block)
            const lines = block.trim().split('\n');
            const staffName = normalizeStaffName(lines[0] || '');

            // Extract Amount
            const amountMatch = block.match(/Amount:\s*\$?([0-9,.]+(?:\.[0-9]{2})?)/i);
            const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

            // Extract YP Name
            const ypMatch = block.match(/(?:YP|YB)\s*Name:\s*(.+)/i);
            const ypName = ypMatch ? ypMatch[1].trim() : '';

            if (staffName) {
                extracted.push({
                    staffName,
                    amount,
                    ypName,
                    location: commonLocation
                });
            }
        }
    }

    // Fallback to old behavior if no blocks found
    if (extracted.length === 0) {
        const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
        for (const line of lines) {
            const match = line.match(/^([A-Za-z][A-Za-z .,'’\-]{1,80}?)(?:\s*[:\-]\s*|\s+)\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*$/);
            if (!match) continue;

            let staffName = match[1].replace(/\s+/g, ' ').trim();
            // Format Name (Last, First -> First Last)
            if (staffName.includes(',')) {
                const p = staffName.split(',');
                if (p.length >= 2) staffName = `${p[1].trim()} ${p[0].trim()}`;
            }
            const amount = Number(match[2]);
            if (!staffName || Number.isNaN(amount) || amount <= 0) continue;

            extracted.push({ staffName, amount });
        }
    }

    return extracted;
};


interface ParticularAmountLine {
    product: string;
    date: string;
    amount: string;
}

const parseParticularAmountLines = (rawText: string): ParticularAmountLine[] => {
    const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
    const extracted: ParticularAmountLine[] = [];

    for (const line of lines) {
        const normalizedLine = line
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/^[\-*•]+\s*/, '')
            .trim();

        const match = normalizedLine.match(/^(.+?)\s*-\s*date\s*:\s*(.+?)\s*-\s*amount\s*:\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
        if (!match) continue;

        const product = String(match[1] || '').trim();
        const date = String(match[2] || '').trim();
        const amount = normalizeMoneyValue(String(match[3] || ''), '0.00');
        if (!product) continue;

        extracted.push({ product, date, amount });
    }

    return extracted;
};

const parseDateValue = (value: string): Date | null => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;

    const slashMatch = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
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

const normalizeTextKey = (value: string): string => {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeReferenceKey = (value: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (!isValidNabReference(raw)) return '';
    return raw.toLowerCase();
};

const WEEKDAY_RESET_HOUR = 6;

const isWeekday = (date: Date): boolean => {
    const day = date.getDay();
    return day >= 1 && day <= 5;
};

const getMostRecentWeekdayReset = (now: Date): Date => {
    const cursor = new Date(now);
    cursor.setHours(WEEKDAY_RESET_HOUR, 0, 0, 0);

    if (isWeekday(now) && now.getTime() >= cursor.getTime()) {
        return cursor;
    }

    for (let i = 0; i < 7; i += 1) {
        cursor.setDate(cursor.getDate() - 1);
        cursor.setHours(WEEKDAY_RESET_HOUR, 0, 0, 0);
        if (isWeekday(cursor)) {
            return cursor;
        }
    }

    return cursor;
};

const getNextWeekdayReset = (now: Date): Date => {
    const cursor = new Date(now);
    cursor.setHours(WEEKDAY_RESET_HOUR, 0, 0, 0);

    if (isWeekday(now) && now.getTime() < cursor.getTime()) {
        return cursor;
    }

    for (let i = 0; i < 7; i += 1) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(WEEKDAY_RESET_HOUR, 0, 0, 0);
        if (isWeekday(cursor)) {
            return cursor;
        }
    }

    return cursor;
};

const isWithinWeekdayResetWindow = (createdAt: string | Date, now: Date): boolean => {
    const createdMs = new Date(createdAt).getTime();
    if (Number.isNaN(createdMs)) return false;
    const windowStart = getMostRecentWeekdayReset(now).getTime();
    const windowEnd = getNextWeekdayReset(now).getTime();
    return createdMs >= windowStart && createdMs < windowEnd;
};

const upsertStatusTag = (content: string, status: 'PENDING' | 'PAID' | 'PENDING_LIQUIDATION'): string => {
    const stripped = content.replace(/\n*<!--\s*STATUS:\s*\w+\s*-->\s*/gi, '\n');
    return `<!-- STATUS: ${status} -->\n${stripped.trim()}`;
};


const stripJulianApprovalSection = (content: string): string => {
    return String(content || '').replace(/\n*<!--\s*JULIAN_APPROVAL_BLOCK_START\s*-->[\s\S]*?<!--\s*JULIAN_APPROVAL_BLOCK_END\s*-->\s*/gi, '\n');
};

const stripClaimantConfirmation = (content: string): string => {
    return String(content || '').replace(/\n*Hi,[\s\S]*?I hope this message finds you well\.[\s\S]*?(?=\*\*Summary of Expenses\*\*|Summary of Expenses:|\*\*TOTAL AMOUNT:|TOTAL AMOUNT:|$)/gi, '\n');
};

const isOver300Detail = (detail?: string): boolean => {
    const text = String(detail || '').toLowerCase();
    return text.includes('above $300')
        || text.includes('at or above $300')
        || text.includes('$300 and up')
        || text.includes('more than $300');
};

const isOver30DaysDetail = (detail?: string): boolean => {
    const text = String(detail || '').toLowerCase();
    return text.includes('older than 30 days')
        || text.includes('over 30 days')
        || text.includes('> 30 days')
        || text.includes('30-day receipt age');
};

const isJulianApprovalDetail = (detail?: string): boolean => isOver300Detail(detail) || isOver30DaysDetail(detail);

const isFormHigherMismatchDetail = (detail?: string): boolean => {
    const text = String(detail || '').toLowerCase();
    return text.includes('reimbursement form total is higher than receipt total');
};

const parseFormReceiptTotalsFromContent = (content: string): { formTotal: number | null; receiptTotal: number | null; difference: number | null } => {
    const formMatch = content.match(/Reimbursement\s*form\s*total\s*is\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    const receiptMatch = content.match(/Receipt\s*total\s*is\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);

    const formTotal = formMatch ? Number(formMatch[1].replace(/,/g, '')) : null;
    const receiptTotal = receiptMatch ? Number(receiptMatch[1].replace(/,/g, '')) : null;

    if (formTotal === null || receiptTotal === null || Number.isNaN(formTotal) || Number.isNaN(receiptTotal)) {
        return { formTotal, receiptTotal, difference: null };
    }

    return {
        formTotal,
        receiptTotal,
        difference: Number(Math.abs(formTotal - receiptTotal).toFixed(2))
    };
};

const stripClaimantRevisionSection = (content: string): string => {
    return String(content || '').replace(/\n*<!--\s*CLAIMANT_REVISION_BLOCK_START\s*-->[\s\S]*?<!--\s*CLAIMANT_REVISION_BLOCK_END\s*-->\s*/gi, '\n');
};

const upsertClaimantRevisionSection = (content: string): string => {
    const stripped = stripClaimantRevisionSection(content).trimEnd();
    const totals = parseFormReceiptTotalsFromContent(stripped);
    const formDisplay = totals.formTotal !== null && Number.isFinite(totals.formTotal) ? totals.formTotal.toFixed(2) : '0.00';
    const receiptDisplay = totals.receiptTotal !== null && Number.isFinite(totals.receiptTotal) ? totals.receiptTotal.toFixed(2) : '0.00';
    const differenceDisplay = totals.difference !== null && Number.isFinite(totals.difference) ? totals.difference.toFixed(2) : '0.00';

    const revisionSection = [
        '<!-- CLAIMANT_REVISION_BLOCK_START -->',
        'Please revise the reimbursement form because the reimbursement form total is higher than the receipt total.',
        `Reimbursement form total is ${formDisplay}`,
        `Receipt total is ${receiptDisplay}`,
        `Difference amount is ${differenceDisplay}`,
        '<!-- CLAIMANT_REVISION_BLOCK_END -->'
    ].join('\n');

    const normalizedBody = stripped.replace(
        /I am writing to confirm that your reimbursement request has been successfully processed today\./i,
        'Your reimbursement request cannot be finalized yet because the reimbursement form amount does not match the receipt total.'
    );

    return `${revisionSection}\n\n${normalizedBody}`;
};

const isNetworkFetchError = (error: unknown): boolean => {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return message.includes('failed to fetch')
        || message.includes('networkerror')
        || message.includes('network request failed')
        || message.includes('load failed');
};

const upsertJulianApprovalSection = (
    content: string,
    options?: { approvalReason?: string; fraudReceiptStatus?: string; onlyBlock?: boolean }
): string => {
    const stripped = stripJulianApprovalSection(content).trimEnd();
    const staffMember = extractFieldValue(stripped, [
        /\*\*Staff Member:\*\*\s*(.+)/i,
        /Staff\s*member\s*to\s*reimburse:\s*(.+)/i,
        /Staff\s*Member:\s*(.+)/i
    ]);
    const clientName = extractFieldValue(stripped, [
        /\*\*Client(?:'|’)?s?\s*Full\s*Name:\*\*\s*(.+)/i,
        /Client(?:'|’)?s?\s*full\s*name:\s*(.+)/i
    ]);
    const approvedBy = extractFieldValue(stripped, [
        /\*\*Approved\s*By:\*\*\s*(.+)/i,
        /Approved\s*by:\s*(.+)/i
    ]);
    const amount = extractFieldValue(stripped, [
        /\*\*Amount:\*\*\s*(.+)/i,
        /\*\*TOTAL\s*AMOUNT:\s*(.+?)\*\*/i,
        /Total\s*Amount:\s*(.+)/i,
        /Amount:\s*(.+)/i
    ]);
    const approvalReason = String(options?.approvalReason || 'Total reimbursement amount is at or above $300').trim();
    const fraudReceiptStatus = String(options?.fraudReceiptStatus || 'Not matched in duplicate history').trim();
    const subjectLine = /older than 30 days/i.test(approvalReason)
        ? 'Approval Request - Reimbursement Over 30 Days'
        : 'Approval Request - Reimbursement At or Above $300';

    const approvalSection = [
        '<!-- JULIAN_APPROVAL_BLOCK_START -->',
        '',
        `Hi ${JULIAN_APPROVER_NAME},`,
        '',
        'I am seeking your approval for this reimbursement request prior to payment release.',
        '',
        `**Subject:** ${subjectLine}`,
        `**Approval Reason:** ${approvalReason}`,
        `**Fraud Receipt Check:** ${fraudReceiptStatus}`,
        '',
        '### Reimbursement Details',
        `**Staff Member:** ${staffMember || '-'}`,
        `**Client Name:** ${clientName || '-'}`,
        `**Amount:** ${amount || '-'}`,
        `**Approved By:** ${approvedBy || '-'}`,

        '',
        '---',
        '',
        '<!-- JULIAN_APPROVAL_BLOCK_END -->'
    ].join('\n');

    if (options?.onlyBlock) {
        return approvalSection.trim();
    }

    const cleanedContent = stripped.trim();
    return `${approvalSection}\n\n${cleanedContent}`.trim();
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
    { key: 'amount', label: 'Amount' }
];

const GROUP_TABLE_HEADER = '| Staff Member | Client | Location | Type | Amount | NAB Reference |';

const isGroupTableContent = (content: string): boolean => content.includes('<!-- GROUP_TABLE_FORMAT -->');

const getGroupTableRowParts = (content: string): Array<{ lineIndex: number; parts: string[] }> => {
    const lines = content.split('\n');
    const rows: Array<{ lineIndex: number; parts: string[] }> = [];
    let inTable = false;
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.includes(GROUP_TABLE_HEADER)) {
            inTable = true;
            continue;
        }
        if (inTable && line.includes('| :---')) continue;
        if (inTable && line.startsWith('|')) {
            rows.push({ lineIndex: i, parts: line.split('|') });
            continue;
        }
        if (inTable) break;
    }
    return rows;
};

const isGroupTableCellMissing = (value: string): boolean => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return true;
    if (normalized === '-') return true;
    if (normalized === 'n/a' || normalized === 'na') return true;
    if (normalized.startsWith('enter ')) return true;
    return false;
};

const updateGroupTableColumnValues = (
    content: string,
    columnIndex: number,
    nextValue: string,
    options?: { onlyMissing?: boolean; recalcTotal?: boolean }
): string => {
    const rows = getGroupTableRowParts(content);
    if (rows.length === 0) return content;

    const lines = content.split('\n');
    rows.forEach(({ lineIndex, parts }) => {
        if (parts.length <= columnIndex) return;
        if (options?.onlyMissing && !isGroupTableCellMissing(parts[columnIndex])) return;
        parts[columnIndex] = ` ${nextValue} `;
        lines[lineIndex] = parts.join('|');
    });

    let updatedContent = lines.join('\n');
    if (options?.recalcTotal) {
        let total = 0;
        rows.forEach(({ parts }) => {
            if (parts.length <= 5) return;
            const amt = parts[5].replace(/[^0-9.-]/g, '');
            total += parseFloat(amt) || 0;
        });
        updatedContent = updatedContent.replace(
            /\*\*TOTAL AMOUNT:\s*\$?[0-9,.]+\*\*/i,
            `**TOTAL AMOUNT: $${total.toFixed(2)}**`
        );
    }

    return updatedContent;
};

const getQuickFieldPatterns = (key: QuickEditFieldKey): RegExp[] => {
    const base = {
        staffMember: [/\*\*Staff Member:\*\*\s*(.*?)(?:\n|$)/i, /Staff Member:\s*(.*?)(?:\n|$)/i],
        clientFullName: [
            /^(?:\*\*\s*)?(?:Client(?:'|’)?s\s+Full\s+Name|Name)\s*:(?:\s*\*\*)?\s*(.*?)(?:\r?\n|$)/im
        ],
        clientLocation: [/\*\*Client\s*\/\s*Location:\*\*\s*(.*?)(?:\n|$)/i],
        address: [/\*\*Address:\*\*\s*(.*?)(?:\n|$)/i, /Address:\s*(.*?)(?:\n|$)/i],
        approvedBy: [/\*\*Approved\s*By:\*\*\s*(.*?)(?:\n|$)/i, /\*\*Approved\s*by:\*\*\s*(.*?)(?:\n|$)/i, /Approved\s*By:\s*(.*?)(?:\n|$)/i, /Approved\s*by:\s*(.*?)(?:\n|$)/i],
        amount: [/\*\*Amount:\*\*\s*(.*?)(?:\n|$)/i, /Amount:\s*(.*?)(?:\n|$)/i],
        receiptId: [/\*\*Receipt\s*ID:\*\*\s*(.*?)(?:\n|$)/i],
        nabCode: [/\*\*NAB\s*(?:Code|Reference):\*\*\s*(.*?)(?:\n|$)/i, /NAB\s*(?:Code|Reference):\s*(.*?)(?:\n|$)/i]
    };

    return base[key];
};

const getQuickEditFieldValue = (content: string, key: QuickEditFieldKey): string => {
    if (isGroupTableContent(content)) {
        const rows = getGroupTableRowParts(content);
        if (rows.length > 0) {
            const parts = rows[0].parts;
            if (key === 'staffMember') return String(parts[1] || '').trim();
            if (key === 'clientFullName') return String(parts[2] || '').trim();
            if (key === 'address') return String(parts[3] || '').trim();
            if (key === 'amount') return String(parts[5] || '').trim();
        }
    }
    const patterns = getQuickFieldPatterns(key);
    for (const pattern of patterns) {
        const match = content.match(pattern);
        const value = match?.[1]?.trim();
        if (value !== undefined) return value;
    }
    return '';
};

const isQuickEditFieldMissing = (key: QuickEditFieldKey, rawValue: string): boolean => {
    if (key === 'clientLocation') return false;
    const value = String(rawValue || '').trim();
    if (!value) return true;
    if (value === '-') return true;
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

    if (isGroupTableContent(content)) {
        if (key === 'clientFullName') {
            return updateGroupTableColumnValues(content, 2, formattedValue, { onlyMissing: true });
        }
        if (key === 'address') {
            return updateGroupTableColumnValues(content, 3, formattedValue, { onlyMissing: true });
        }
        if (key === 'amount') {
            return updateGroupTableColumnValues(content, 5, formattedValue, { onlyMissing: true, recalcTotal: true });
        }
    }

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
    const [manualNabCodeInput, setManualNabCodeInput] = useState('');
    const [manualNabCodeError, setManualNabCodeError] = useState<string | null>(null);
    const [saveToast, setSaveToast] = useState<SaveToastState>({ visible: false, nabCode: '-', amount: '0.00', recordCount: 0 });
    const saveToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [warningToast, setWarningToast] = useState<WarningToastState>({ visible: false, message: '' });
    const warningToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isRedPopupAlertActive, setIsRedPopupAlertActive] = useState(false);
    const redPopupAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const redPopupAlertPlayedRef = useRef(false);
    const [quickEditDrafts, setQuickEditDrafts] = useState<Partial<Record<QuickEditFieldKey, string>>>({});
    const [pendingApprovalStaffGroup, setPendingApprovalStaffGroup] = useState<PendingStaffGroup | null>(null);
    const [pendingApprovalNabCode, setPendingApprovalNabCode] = useState('');
    const [isApprovingPending, setIsApprovingPending] = useState(false);
    const [showApprovedClaimantModal, setShowApprovedClaimantModal] = useState(false);
    const [approvedClaimantEmailContent, setApprovedClaimantEmailContent] = useState('');
    const [approvedClaimantCopied, setApprovedClaimantCopied] = useState(false);
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


    const [emailCopied, setEmailCopied] = useState<'julian' | 'claimant' | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [reportCopied, setReportCopied] = useState<'nab' | 'eod' | 'analytics' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'generated' | null>(null);

    const [activeTab, setActiveTab] = useState<'dashboard' | 'database' | 'nab_log' | 'eod' | 'analytics' | 'settings'>('dashboard');

    useEffect(() => {
        if (requestMode === 'manual' && activeTab === 'dashboard') {
            handleProcess();
        }
    }, [requestMode, activeTab]);

    const [loadingSplash, setLoadingSplash] = useState(true);
    const [nowTick, setNowTick] = useState(() => Date.now());

    // Analytics Report State
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const [isEditingReport, setIsEditingReport] = useState(false);
    const [reportEditableContent, setReportEditableContent] = useState('');

    // Database / History State
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [specialInstructionLogs, setSpecialInstructionLogs] = useState<any[]>([]);
    const [groupLiquidationQueue, setGroupLiquidationQueue] = useState<GroupLiquidationQueueItem[]>(() => loadGroupLiquidationQueue());
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isSettlingLiquidation, setIsSettlingLiquidation] = useState<string | null>(null);

    const dbOutstandingLiquidations = useMemo(() => {
        return historyData
            .filter(row => String(row.nab_code || row.nabCode || '').toUpperCase() === 'PENDING_LIQUIDATION')
            .map(row => ({
                id: `db-${String(row.id)}`,
                staffName: String(row.staff_name || row.staffName || 'Unknown'),
                amount: normalizeMoneyValue(String(row.amount || row.totalAmount || '0.00'), '0.00'),
                date: String(row.created_at || row.timestamp || row.dateProcessed || 'N/A')
            }));
    }, [historyData]);

    const groupPendingLiquidations = useMemo(() => {
        return groupLiquidationQueue.map((item) => ({
            id: item.id,
            staffName: item.staffName,
            staffKey: item.staffKey,
            weekKey: item.weekKey,
            ypName: item.ypName,
            location: item.location,
            amount: item.amount,
            date: item.createdAt
        }));
    }, [groupLiquidationQueue]);

    const groupPendingThisWeek = useMemo(() => {
        const now = new Date(nowTick);
        const currentWeekKey = getWeekKeyLocal(now);
        return groupPendingLiquidations.filter((item) => item.weekKey === currentWeekKey);
    }, [groupPendingLiquidations, nowTick]);

    const groupPendingPreviousWeeks = useMemo(() => {
        const now = new Date(nowTick);
        const currentWeekKey = getWeekKeyLocal(now);
        return groupPendingLiquidations.filter((item) => item.weekKey !== currentWeekKey);
    }, [groupPendingLiquidations, nowTick]);

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
    const [pendingDeactivationEmployees, setPendingDeactivationEmployees] = useState<Employee[]>([]);
    const [employeeAliasMap, setEmployeeAliasMap] = useState<Record<string, string>>({});
    const [csvImportMessage, setCsvImportMessage] = useState<string>('');
    const [saveEmployeeStatus, setSaveEmployeeStatus] = useState<'idle' | 'saved'>('idle');
    const employeeCsvInputRef = useRef<HTMLInputElement | null>(null);

    // Employee Selection State for Banking Details
    const [selectedEmployees, setSelectedEmployees] = useState<Map<number, Employee>>(new Map());
    const [employeeSearchQuery, setEmployeeSearchQuery] = useState<Map<number, string>>(new Map());
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState<Map<number, boolean>>(new Map());
    const [amountSelectionByTx, setAmountSelectionByTx] = useState<Map<number, string>>(new Map());

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

        setSpecialInstructionLogs(loadSpecialInstructionLogs());

        // Load Employee Data
        const storedEmployees = localStorage.getItem('aspire_employee_list');
        if (storedEmployees) {
            setEmployeeRawText(storedEmployees);
            setEmployeeList(parseEmployeeData(storedEmployees));
        } else {
            setEmployeeList(parseEmployeeData(DEFAULT_EMPLOYEE_DATA));
        }

        const storedPendingEmployees = localStorage.getItem(EMPLOYEE_PENDING_DEACTIVATION_KEY);
        if (storedPendingEmployees) {
            try {
                const parsed = JSON.parse(storedPendingEmployees);
                if (Array.isArray(parsed)) {
                    setPendingDeactivationEmployees(parsed);
                }
            } catch (error) {
                console.warn('Failed to parse pending deactivation employees:', error);
            }
        }

        const storedAliasMap = localStorage.getItem(EMPLOYEE_ALIAS_MAP_KEY);
        if (storedAliasMap) {
            try {
                const parsed = JSON.parse(storedAliasMap);
                if (parsed && typeof parsed === 'object') {
                    setEmployeeAliasMap(parsed);
                }
            } catch (error) {
                console.warn('Failed to parse employee alias map:', error);
            }
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

    useEffect(() => {
        const interval = setInterval(() => {
            setNowTick(Date.now());
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        return () => {
            if (saveToastTimeoutRef.current) {
                clearTimeout(saveToastTimeoutRef.current);
            }
            if (warningToastTimeoutRef.current) {
                clearTimeout(warningToastTimeoutRef.current);
            }
            if (redPopupAlertTimeoutRef.current) {
                clearTimeout(redPopupAlertTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const isRedPopup = showSaveModal && saveModalDecision?.mode === 'red';

        if (!isRedPopup) {
            setIsRedPopupAlertActive(false);
            redPopupAlertPlayedRef.current = false;
            if (redPopupAlertTimeoutRef.current) {
                clearTimeout(redPopupAlertTimeoutRef.current);
                redPopupAlertTimeoutRef.current = null;
            }
            return;
        }

        if (redPopupAlertPlayedRef.current) return;

        redPopupAlertPlayedRef.current = true;
        setIsRedPopupAlertActive(true);
        playRedPopupSiren3s();

        if (redPopupAlertTimeoutRef.current) {
            clearTimeout(redPopupAlertTimeoutRef.current);
        }

        redPopupAlertTimeoutRef.current = setTimeout(() => {
            setIsRedPopupAlertActive(false);
        }, 3000);
    }, [showSaveModal, saveModalDecision?.mode]);

    const playToastCloseTechSound = () => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;

            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'triangle';
            osc2.type = 'sine';

            osc1.frequency.setValueAtTime(920, now);
            osc1.frequency.exponentialRampToValueAtTime(640, now + 0.12);
            osc2.frequency.setValueAtTime(1840, now);
            osc2.frequency.exponentialRampToValueAtTime(1280, now + 0.12);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now + 0.01);
            osc1.stop(now + 0.14);
            osc2.stop(now + 0.14);

            setTimeout(() => {
                void ctx.close();
            }, 220);
        } catch {
            // Ignore audio errors and keep UX non-blocking.
        }
    };

    const playRedPopupSiren3s = () => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;

            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            const duration = 3;

            const siren = ctx.createOscillator();
            const harmonic = ctx.createOscillator();
            const gain = ctx.createGain();

            siren.type = 'sawtooth';
            harmonic.type = 'triangle';

            for (let t = 0; t <= duration; t += 0.25) {
                const high = Math.floor(t / 0.25) % 2 === 0;
                const baseFreq = high ? 980 : 620;
                siren.frequency.setValueAtTime(baseFreq, now + t);
                harmonic.frequency.setValueAtTime(baseFreq * 0.5, now + t);
            }

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.08, now + 0.07);
            gain.gain.setValueAtTime(0.08, now + duration - 0.2);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            siren.connect(gain);
            harmonic.connect(gain);
            gain.connect(ctx.destination);

            siren.start(now);
            harmonic.start(now + 0.01);
            siren.stop(now + duration);
            harmonic.stop(now + duration);

            setTimeout(() => {
                void ctx.close();
            }, 3300);
        } catch {
            // Ignore audio errors and keep UX non-blocking.
        }
    };

    const showSavedToast = (payloads: Array<{ nab_code?: string | null; amount?: number }>) => {
        const first = payloads[0];
        const normalizedAmount = Number(first?.amount || 0);
        const amountDisplay = Number.isFinite(normalizedAmount) ? normalizedAmount.toFixed(2) : '0.00';
        const nabCodeDisplay = String(first?.nab_code || 'N/A').trim() || 'N/A';

        if (saveToastTimeoutRef.current) {
            clearTimeout(saveToastTimeoutRef.current);
        }

        setSaveToast({
            visible: true,
            nabCode: nabCodeDisplay,
            amount: amountDisplay,
            recordCount: payloads.length
        });

        saveToastTimeoutRef.current = setTimeout(() => {
            setSaveToast(prev => ({ ...prev, visible: false }));
            playToastCloseTechSound();
        }, 2000);
    };

    const showWarningToast = (message: string) => {
        if (warningToastTimeoutRef.current) {
            clearTimeout(warningToastTimeoutRef.current);
        }

        setWarningToast({ visible: true, message: String(message || 'Action needs attention.') });
        warningToastTimeoutRef.current = setTimeout(() => {
            setWarningToast({ visible: false, message: '' });
        }, 3000);
    };

    const handleSaveEmployeeList = () => {
        localStorage.setItem('aspire_employee_list', employeeRawText);
        setEmployeeList(parseEmployeeData(employeeRawText));
        setSaveEmployeeStatus('saved');
        setTimeout(() => setSaveEmployeeStatus('idle'), 2000);
    };

    const persistPendingDeactivationEmployees = (records: Employee[]) => {
        setPendingDeactivationEmployees(records);
        localStorage.setItem(EMPLOYEE_PENDING_DEACTIVATION_KEY, JSON.stringify(records));
    };

    const persistEmployeeAliasMap = (aliases: Record<string, string>) => {
        setEmployeeAliasMap(aliases);
        localStorage.setItem(EMPLOYEE_ALIAS_MAP_KEY, JSON.stringify(aliases));
    };

    const handleCsvUploadClick = () => {
        employeeCsvInputRef.current?.click();
    };

    const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const raw = await file.text();
            const parsedEmployees = parseEmployeeData(raw);

            if (parsedEmployees.length === 0) {
                setCsvImportMessage('No valid rows found. Check CSV headers: First Names, Surname, BSB, Account.');
                return;
            }

            const newAccountSet = new Set(parsedEmployees.map((employee) => employee.account.trim()));
            const pendingApproval = employeeList.filter((employee) => !newAccountSet.has(employee.account.trim()));

            setEmployeeRawText(raw);
            setEmployeeList(parsedEmployees);
            localStorage.setItem('aspire_employee_list', raw);
            persistPendingDeactivationEmployees(pendingApproval);
            setCsvImportMessage(`Imported ${parsedEmployees.length} active records. ${pendingApproval.length} account(s) moved to approval queue.`);
        } catch (error) {
            console.error('CSV import failed:', error);
            setCsvImportMessage('CSV import failed. Please try again with a clean .csv file.');
        } finally {
            if (event.target) {
                event.target.value = '';
            }
        }
    };

    const handleKeepPendingEmployee = (account: string) => {
        const target = pendingDeactivationEmployees.find((employee) => employee.account === account);
        if (!target) return;

        const nextActive = employeeList.some((employee) => employee.account === target.account)
            ? employeeList
            : [...employeeList, target];
        setEmployeeList(nextActive);
        const nextRaw = serializeEmployeeData(nextActive);
        setEmployeeRawText(nextRaw);
        localStorage.setItem('aspire_employee_list', nextRaw);

        const nextPending = pendingDeactivationEmployees.filter((employee) => employee.account !== account);
        persistPendingDeactivationEmployees(nextPending);
        setCsvImportMessage(`Kept account ${account} as active.`);
    };

    const handleApproveDeactivateEmployee = (account: string) => {
        const nextPending = pendingDeactivationEmployees.filter((employee) => employee.account !== account);
        persistPendingDeactivationEmployees(nextPending);
        setCsvImportMessage(`Approved deactivation for account ${account}.`);
    };

    const createAliasFromQuery = (txIndex: number) => {
        const selectedEmployee = selectedEmployees.get(txIndex);
        const typed = (employeeSearchQuery.get(txIndex) || '').trim();
        if (!selectedEmployee || !typed) return;

        const aliasKey = normalizeEmployeeName(typed);
        if (!aliasKey) return;
        const nextAliases = { ...employeeAliasMap, [aliasKey]: selectedEmployee.id };
        persistEmployeeAliasMap(nextAliases);
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

        const isGroupTable = content.includes('<!-- GROUP_TABLE_FORMAT -->');
        if (isGroupTable) {
            const lines = content.split('\n');
            const tableRows: any[] = [];
            let inTable = false;
            let rowIndex = 0;

            for (const line of lines) {
                if (line.includes('| Staff Member | Client | Location | Type | Amount | NAB Reference |')) {
                    inTable = true;
                    continue;
                }
                if (inTable && line.includes('| :---')) continue;
                if (inTable && line.startsWith('|')) {
                    const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
                    if (parts.length >= 6) {
                        const staffName = parts[0];
                        const ypName = parts[1] === '-' ? '' : parts[1];
                        const location = parts[2] === '-' ? '' : parts[2];
                        const expenseType = parts[3];
                        const amount = parts[4];
                        const currentNabRef = parts[5] || '';

                        tableRows.push({
                            index: rowIndex++,
                            staffName,
                            formattedName: staffName, // Simplified for group table
                            amount,
                            expenseType,
                            receiptId: 'N/A',
                            currentNabRef: isValidNabReference(currentNabRef) ? currentNabRef : '',
                            ypName,
                            location
                        });
                    }
                } else if (inTable) {
                    // Table ended
                }
            }
            return tableRows;
        }

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
        const amountMatch = part.match(/\*\*Amount (?:Transferred):\*\*\s*(.*)/i)
            || part.match(/\*\*Amount:\*\*\s*(.*)/)
            || part.match(/Amount:\s*(.*)/);
        let amount = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';

        // Find NAB code
        const nabMatch = part.match(/NAB (?:Code|Reference):(?:\*\*|)\s*(.*)/i);
        let currentNabRef = nabMatch ? nabMatch[1].trim() : '';
        if (!isValidNabReference(currentNabRef)) currentNabRef = ''; // Clear placeholders/pending for input value

        // Find Receipt ID (if exists)
        const receiptMatch = part.match(/\*\*Receipt ID:\*\*\s*(.*)/) || part.match(/Receipt ID:\s*(.*)/);
        const receiptId = receiptMatch ? receiptMatch[1].trim() : 'N/A';

        // Find YP Name
        const ypMatch = part.match(/\*\*Client:\*\*\s*(.*)/i)
            || part.match(/\*\*YP Name:\*\*\s*(.*)/i)
            || part.match(/YP Name:\s*(.*)/i);
        const ypName = ypMatch ? ypMatch[1].trim() : '';

        // Find Location (Solo fallback: Address)
        const locationMatch = part.match(/\*\*Location:\*\*\s*(.*)/i)
            || part.match(/Location:\s*(.*)/i)
            || part.match(/\*\*Address:\*\*\s*(.*)/i)
            || part.match(/Address:\s*(.*)/i);
        const location = locationMatch ? locationMatch[1].trim() : '';

        // Format Name (Last, First -> First Last)
        let formattedName = staffName;
        if (staffName.includes(',')) {
            const p = staffName.split(',');
            if (p.length >= 2) formattedName = `${p[1].trim()} ${p[0].trim()}`;
        }

        // Final cleaning: remove any bold markers from name if they leaked in
        formattedName = formattedName.replace(/\*\*/g, '').trim();

        return {
            index,
            staffName,
            formattedName,
            amount,
            receiptId,
            currentNabRef,
            ypName,
            location
        };
    };


    const parsedTransactions = getParsedTransactions();

    useEffect(() => {
        if (parsedTransactions.length === 0 || employeeList.length === 0) return;

        setEmployeeSearchQuery((previous) => {
            const next = new Map(previous);
            parsedTransactions.forEach((tx) => {
                if (next.has(tx.index)) return;
                const rawName = tx.formattedName || tx.staffName || '';
                const aliasHit = employeeAliasMap[normalizeEmployeeName(rawName)];
                if (aliasHit) {
                    const aliasEmployee = employeeList.find((employee) => employee.id === aliasHit)
                        || employeeList.find((employee) => normalizeEmployeeName(getEmployeeDisplayName(employee)) === normalizeEmployeeName(aliasHit));
                    next.set(tx.index, aliasEmployee ? getEmployeeDisplayName(aliasEmployee) : rawName);
                    return;
                }
                next.set(tx.index, rawName);
            });
            return next;
        });

        setAmountSelectionByTx((previous) => {
            const next = new Map(previous);
            parsedTransactions.forEach((tx) => {
                if (next.has(tx.index)) return;
                next.set(tx.index, tx.amount.replace(/[^0-9.\-]/g, '') || '0.00');
            });
            return next;
        });
    }, [parsedTransactions, employeeList, employeeAliasMap]);

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

    const setTransactionNabInContent = (content: string, index: number, newVal: string): string => {
        if (content.includes('<!-- GROUP_TABLE_FORMAT -->')) {
            const lines = content.split('\n');
            let rowIndex = 0;
            let inTable = false;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('| Staff Member | Client | Location | Type | Amount | NAB Reference |')) {
                    inTable = true;
                    continue;
                }
                if (inTable && lines[i].includes('| :---')) continue;
                if (inTable && lines[i].startsWith('|')) {
                    if (rowIndex === index) {
                        const parts = lines[i].split('|');
                        // Row format: | Staff | Client | Location | Type | Amount | NAB |
                        // Parts will be ["", " Staff ", " Client ", " Location ", " Type ", " Amount ", " NAB ", ""]
                        parts[6] = ` ${newVal} `;
                        lines[i] = parts.join('|');
                        return lines.join('\n');
                    }
                    rowIndex++;
                }
            }
            return content;
        }

        const useBoldLabels = content.includes('**Staff Member:**');
        const marker = useBoldLabels ? '**Staff Member:**' : 'Staff Member:';
        const nabLabel = useBoldLabels ? '**NAB Code:**' : 'NAB Code:';

        const parts = content.split(marker);

        // parts[0] is header. parts[1] is transaction 0, parts[2] is transaction 1...
        // So transaction index maps to parts[index + 1]
        const partIndex = index + 1;

        if (parts.length <= partIndex) return content;

        let targetPart = parts[partIndex];

        // Replace NAB line
        if (targetPart.match(/NAB (?:Code|Reference):/i)) {
            targetPart = targetPart.replace(/NAB (?:Code|Reference):.*/i, `${nabLabel} ${newVal}`);
        } else {
            if (targetPart.includes('Amount:')) {
                targetPart = targetPart.replace(/(Amount:.*)/, `$1\n${nabLabel} ${newVal}`);
            } else {
                targetPart += `\n${nabLabel} ${newVal}`;
            }
        }

        parts[partIndex] = targetPart;
        return parts.join(marker);
    };

    const handleTransactionNabChange = (index: number, newVal: string) => {
        const content = isEditing ? editableContent : results?.phase4;
        if (!content) return;
        const newContent = setTransactionNabInContent(content, index, newVal);

        if (isEditing) {
            setEditableContent(newContent);
        } else {
            setResults({ ...results!, phase4: newContent });
        }
    };

    // Employee Selection Handlers for Banking Details
    const handleEmployeeSelect = (txIndex: number, employee: Employee) => {
        const name = getEmployeeDisplayName(employee);
        setSelectedEmployees(prev => new Map(prev).set(txIndex, employee));
        setEmployeeSearchQuery(prev => new Map(prev).set(txIndex, name));
        setShowEmployeeDropdown(prev => new Map(prev).set(txIndex, false));

        const content = isEditing ? editableContent : results?.phase4;
        if (!content) return;
        const updated = setStaffMemberInContent(content, txIndex, name);
        if (isEditing) {
            setEditableContent(updated);
        } else {
            setResults((prev) => (prev ? { ...prev, phase4: updated } : prev));
        }
    };


    const setStaffMemberInContent = (content: string, index: number, name: string): string => {
        if (content.includes('<!-- GROUP_TABLE_FORMAT -->')) {
            const lines = content.split('\n');
            let rowIndex = 0;
            let inTable = false;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('| Staff Member | Client | Location | Type | Amount | NAB Reference |')) {
                    inTable = true;
                    continue;
                }
                if (inTable && lines[i].includes('| :---')) continue;
                if (inTable && lines[i].startsWith('|')) {
                    if (rowIndex === index) {
                        const parts = lines[i].split('|');
                        parts[1] = ` ${name} `;
                        lines[i] = parts.join('|');
                        return lines.join('\n');
                    }
                    rowIndex++;
                }
            }
            return content;
        }

        const marker = '**Staff Member:**';

        const parts = content.split(marker);
        const partIndex = index + 1;
        if (parts.length <= partIndex) return content;

        let targetPart = parts[partIndex];
        const lines = targetPart.split('\n');
        lines[0] = ` ${name}`;
        parts[partIndex] = lines.join('\n');
        return parts.join(marker);
    };

    const handleEmployeeSearchChange = (txIndex: number, query: string) => {
        setEmployeeSearchQuery(prev => new Map(prev).set(txIndex, query));
        setSelectedEmployees(prev => {
            const next = new Map(prev);
            next.delete(txIndex);
            return next;
        });
        setShowEmployeeDropdown(prev => new Map(prev).set(txIndex, true));

        const content = isEditing ? editableContent : results?.phase4;
        if (!content) return;
        const updated = setStaffMemberInContent(content, txIndex, query);
        if (isEditing) {
            setEditableContent(updated);
        } else {
            setResults((prev) => (prev ? { ...prev, phase4: updated } : prev));
        }
    };

    const handleAddBankingDetail = () => {
        const content = isEditing ? editableContent : results?.phase4;
        if (!content) return;

        const newBlock = `\n**Staff Member:** [New Staff Member]\n**Amount:** $0.00\n**NAB Reference:** PENDING\n`;
        const updated = content + newBlock;

        if (isEditing) {
            setEditableContent(updated);
        } else {
            setResults((prev) => (prev ? { ...prev, phase4: updated } : prev));
        }
    };

    const handleRemoveBankingDetail = (index: number) => {
        const content = isEditing ? editableContent : results?.phase4;
        if (!content) return;

        const marker = '**Staff Member:**';
        const parts = content.split(marker);
        if (parts.length <= 1) return;

        const partIndex = index + 1;
        if (parts.length <= partIndex) return;

        parts.splice(partIndex, 1);
        const updated = parts.join(marker);

        if (isEditing) {
            setEditableContent(updated);
        } else {
            setResults((prev) => (prev ? { ...prev, phase4: updated } : prev));
        }
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
        if (!query || query.trim() === '') {
            return employeeList
                .slice()
                .sort((a, b) => getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b)))
                .slice(0, 10);
        }

        const aliasTarget = employeeAliasMap[normalizeEmployeeName(query)];
        if (aliasTarget) {
            const aliasMatch = employeeList.find((employee) => employee.id === aliasTarget)
                || employeeList.find((employee) => normalizeEmployeeName(getEmployeeDisplayName(employee)) === normalizeEmployeeName(aliasTarget));
            if (aliasMatch) {
                const fuzzyMatches = findBestEmployeeMatches(query, employeeList, 10)
                    .map((entry) => entry.employee)
                    .filter((employee) => employee.id !== aliasMatch.id);
                return [aliasMatch, ...fuzzyMatches].slice(0, 10);
            }
        }

        return findBestEmployeeMatches(query, employeeList, 10).map((entry) => entry.employee);
    };

    const setTransactionAmountInContent = (content: string, index: number, amountValue: string): string => {
        const numericAmount = String(amountValue || '').replace(/[^0-9.\-]/g, '');
        if (!numericAmount) return content;
        const parsedNumber = Number(numericAmount);
        if (Number.isNaN(parsedNumber)) return content;
        const formattedAmount = `$${parsedNumber.toFixed(2)}`;

        if (content.includes('<!-- GROUP_TABLE_FORMAT -->')) {
            const lines = content.split('\n');
            let rowIndex = 0;
            let inTable = false;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('| Staff Member | Client | Location | Type | Amount | NAB Reference |')) {
                    inTable = true;
                    continue;
                }
                if (inTable && lines[i].includes('| :---')) continue;
                if (inTable && lines[i].startsWith('|')) {
                    if (rowIndex === index) {
                        const parts = lines[i].split('|');
                        parts[5] = ` ${formattedAmount} `;
                        lines[i] = parts.join('|');

                        // Recalculate Total Amount for the table footer
                        let total = 0;
                        let innerRowIndex = 0;
                        let innerInTable = false;
                        for (let j = 0; j < lines.length; j++) {
                            if (lines[j].includes('| Staff Member | Client | Location | Type | Amount | NAB Reference |')) {
                                innerInTable = true;
                                continue;
                            }
                            if (innerInTable && lines[j].includes('| :---')) continue;
                            if (innerInTable && lines[j].startsWith('|')) {
                                const rowParts = lines[j].split('|');
                                if (rowParts.length >= 6) {
                                    const amtStr = rowParts[5].replace(/[^0-9.-]/g, '');
                                    total += parseFloat(amtStr) || 0;
                                }
                            }
                        }

                        let updatedContent = lines.join('\n');
                        updatedContent = updatedContent.replace(/\*\*TOTAL AMOUNT:\s*\$?[0-9,.]+\*\*/i, `**TOTAL AMOUNT: $${total.toFixed(2)}**`);
                        return updatedContent;
                    }
                    rowIndex++;
                }
            }
            return content;
        }

        const marker = '**Staff Member:**';

        const parts = content.split(marker);
        const partIndex = index + 1;
        if (parts.length <= partIndex) return content;

        let targetPart = parts[partIndex];
        if (/\*\*Amount(?: Transferred)?:\*\*/i.test(targetPart)) {
            targetPart = targetPart.replace(/(\*\*Amount(?: Transferred)?:\*\*\s*)(.*)/i, `$1${formattedAmount}`);
        } else if (/Amount(?: Transferred)?:/i.test(targetPart)) {
            targetPart = targetPart.replace(/(Amount(?: Transferred)?:\s*)(.*)/i, `$1${formattedAmount}`);
        } else {
            targetPart += `\n**Amount:** ${formattedAmount}`;
        }

        parts[partIndex] = targetPart;
        let updatedContent = parts.join(marker);

        if (updatedContent.includes('MANUAL-ENTRY')) {
            updatedContent = updatedContent.replace(
                /(\|\s*1\s*\|\s*MANUAL-ENTRY\s*\|\s*[^|]*\|\s*[^|]*\|\s*[^|]*\|\s*[^|]*\|\s*)\$?[\d,]+(?:\.\d{1,2})?(\s*\|\s*)\$?[\d,]+(?:\.\d{1,2})?(\s*\|[^\n]*\n?)/i,
                `$1${formattedAmount}$2${formattedAmount}$3`
            );
            updatedContent = updatedContent.replace(/(\*\*TOTAL\s+AMOUNT:\s*)\$?[\d,]+(?:\.\d{1,2})?(\*\*)/i, `$1${formattedAmount}$2`);
        }

        return updatedContent;
    };


    const handleTransactionAmountChange = (index: number, nextAmount: string) => {
        setAmountSelectionByTx((prev) => new Map(prev).set(index, nextAmount));
        const content = isEditing ? editableContent : results?.phase4;
        if (!content) return;

        const updated = setTransactionAmountInContent(content, index, nextAmount);
        if (isEditing) {
            setEditableContent(updated);
        } else {
            setResults((prev) => (prev ? { ...prev, phase4: updated } : prev));
        }
    };

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            if (!hasSupabaseEnv) {
                const localRows = loadLocalAuditLogs().sort((a, b) => {
                    const aTs = new Date(a.created_at || 0).getTime();
                    const bTs = new Date(b.created_at || 0).getTime();
                    return bTs - aTs;
                });
                setHistoryData(localRows);
                return;
            }

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

    const handleRefreshCycleView = async () => {
        await fetchHistory();
        setNowTick(Date.now());
    };

    const parseDatabaseRows = (data: any[]) => {
        const allRows: any[] = [];
        data.forEach((record) => {
            const content = record.full_email_content || "";
            const internalId = record.id;
            const isGroupTable = content.includes('<!-- GROUP_TABLE_FORMAT -->');

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

            const clientValue = extractFieldValue(content, [
                /(?:\*\*\s*Client\s*:\s*\*\*|Client\s*:)\s*(.*?)(?:\n|$)/i
            ]);
            const locationValue = extractFieldValue(content, [
                /(?:\*\*\s*Location\s*:\s*\*\*|Location\s*:)\s*(.*?)(?:\n|$)/i
            ]);
            const addressValue = extractFieldValue(content, [
                /(?:\*\*\s*Address\s*:\s*\*\*|Address\s*:)\s*(.*?)(?:\n|$)/i
            ]);
            const clientFullNameValue = extractFieldValue(content, [
                /^(?:\*\*\s*)?(?:Client(?:'|’)?s?\s+Full\s+Name|Name)\s*:(?:\s*\*\*)?\s*(.*?)(?:\r?\n|$)/im
            ]);
            const clientLocationValue = extractFieldValue(content, [
                /(?:\*\*\s*Client\s*\/\s*Location\s*:\s*\*\*|Client\s*\/\s*Location\s*:)\s*(.*?)(?:\n|$)/i
            ]);

            const locationFirstPart = clientLocationValue.includes('/')
                ? clientLocationValue.split('/')[0].trim()
                : clientLocationValue;

            // Mapping rules:
            // - ypName: Hendrix (from Client: or Client's Full Name)
            // - youngPersonName: Illawarra (from Location: or Client / Location)
            const ypName = clientValue || clientFullNameValue || addressValue || clientLocationValue || record.yp_name || '-';
            const youngPersonName = record.location || locationValue || addressValue || locationFirstPart || '-';


            const dateProcessed = new Date(record.created_at).toLocaleDateString();
            const nabRefDisplay = record.nab_code || 'PENDING';

            // 2. Extract Table Rows
            const lines = content.split('\n');
            let foundTable = false;
            let tableRowsFound = false;

            const resolveReceiptBatchTotal = (): string => {
                let inReceiptTable = false;
                let runningTotal = 0;
                let hasRunningTotal = false;
                let parsedGrandTotal = '';

                for (let i = 0; i < lines.length; i += 1) {
                    const line = lines[i].trim();
                    if (line.startsWith('| Receipt #') || line.startsWith('|Receipt #')) {
                        inReceiptTable = true;
                        continue;
                    }
                    if (!inReceiptTable) continue;
                    if (inReceiptTable && line.startsWith('| :---')) continue;
                    if (inReceiptTable && line === '') break;
                    if (!line.startsWith('|')) continue;

                    const cols = line.split('|').map((c: string) => c.trim()).filter((c: string) => c !== '');
                    if (!cols.length) continue;

                    const firstCol = String(cols[0] || '');
                    if (/grand\s*total|\btotal\b/i.test(firstCol)) {
                        let grandTotalCell = '';
                        for (let k = cols.length - 1; k >= 0; k -= 1) {
                            if (/[0-9]/.test(cols[k])) {
                                grandTotalCell = cols[k];
                                break;
                            }
                        }
                        if (grandTotalCell) {
                            parsedGrandTotal = normalizeMoneyValue(grandTotalCell, '');
                        }
                        continue;
                    }

                    const normalizedRow = normalizeReceiptRow(cols, String(totalAmount || '0.00'), 'Unknown Store', receiptId);
                    if (!normalizedRow) continue;

                    const rowAmount = normalizedRow.itemAmount.toLowerCase() === 'included in total'
                        ? normalizedRow.receiptTotal
                        : normalizedRow.itemAmount;
                    const numericAmount = Number(normalizeMoneyValue(rowAmount, '0.00'));
                    if (!Number.isNaN(numericAmount)) {
                        runningTotal += numericAmount;
                        hasRunningTotal = true;
                    }
                }

                const fallbackBatchTotal = normalizeMoneyValue(String(totalAmount || '0.00'), '0.00');
                if (parsedGrandTotal) return parsedGrandTotal;
                if (hasRunningTotal) return normalizeMoneyValue(String(runningTotal), fallbackBatchTotal);
                return fallbackBatchTotal;
            };

            const receiptBatchTotal = resolveReceiptBatchTotal();

            if (isGroupTable) {
                let inGroupTable = false;
                const recordStaffName = String(record.staff_name || staffName || '').trim();
                const hasDbClient = typeof record.yp_name === 'string' && record.yp_name.trim() !== '' && record.yp_name.trim() !== '-';
                const hasDbLocation = typeof record.location === 'string' && record.location.trim() !== '' && record.location.trim() !== '-';
                let matchedClient = hasDbClient ? record.yp_name : ypName;
                let matchedLocation = hasDbLocation ? record.location : youngPersonName;
                let matchedType = 'Petty Cash';
                let matchedAmount = normalizeMoneyValue(String(record.amount || totalAmount || '0.00'), '0.00');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.includes(GROUP_TABLE_HEADER)) {
                        inGroupTable = true;
                        continue;
                    }
                    if (inGroupTable && line.startsWith('| :---')) continue;
                    if (inGroupTable && line.startsWith('|')) {
                        const cols = line.split('|').map((c: string) => c.trim()).filter((c: string) => c !== '');
                        if (cols.length >= 6) {
                            const staffCell = cols[0] || '';
                            if (normalizeNameKey(staffCell) === normalizeNameKey(recordStaffName)) {
                                if (!hasDbClient && cols[1] && cols[1] !== '-') {
                                    matchedClient = cols[1];
                                }
                                if (!hasDbLocation && cols[2] && cols[2] !== '-') {
                                    matchedLocation = cols[2];
                                }
                                matchedType = cols[3] || matchedType;
                                matchedAmount = normalizeMoneyValue(cols[4] || matchedAmount, matchedAmount);
                                break;
                            }
                        }
                        continue;
                    }
                    if (inGroupTable && line === '') break;
                }

                const normalizedAmount = normalizeMoneyValue(String(matchedAmount || '0.00'), '0.00');
                tableRowsFound = true;
                allRows.push({
                    id: `${internalId}-group`,
                    uid: uidFallbacks[0] || receiptId,
                    internalId: internalId,
                    timestamp,
                    rawDate,
                    ypName: matchedClient || '-',
                    youngPersonName: matchedLocation || '-',
                    staffName: recordStaffName || staffName,
                    storeName: '-',
                    product: 'Group Petty Cash',
                    expenseType: matchedType,
                    receiptDateTime: dateProcessed,
                    receiptDate: dateProcessed,
                    amount: normalizedAmount,
                    totalAmount: normalizedAmount,
                    dateProcessed,
                    nabCode: nabRefDisplay
                });
            }

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
                    const manualAmountFromRecord = normalizeMoneyValue(String(record.amount || totalAmount || '0.00'), '0.00');
                    const isManualEntryRow = String(normalized.uniqueId || '').trim().toUpperCase() === 'MANUAL-ENTRY';
                    const amountForDb = isManualEntryRow
                        ? manualAmountFromRecord
                        : (normalized.itemAmount.toLowerCase() === 'included in total' ? normalized.receiptTotal : normalized.itemAmount);
                    const receiptTotalForDb = isManualEntryRow ? manualAmountFromRecord : normalized.receiptTotal;
                    const totalAmountForDb = isManualEntryRow ? receiptTotalForDb : receiptBatchTotal;

                    allRows.push({
                        id: `${internalId}-${i}`, // Unique key for React using DB ID
                        uid: normalized.uniqueId || fallbackUid,
                        internalId: internalId,
                        timestamp,
                        rawDate,
                        ypName: ypName,
                        youngPersonName: youngPersonName,
                        staffName,
                        storeName: normalized.storeName,
                        product: normalized.product,
                        expenseType: normalized.category,
                        receiptDateTime: normalized.dateTime || receiptDate,
                        receiptDate,
                        amount: amountForDb,
                        totalAmount: totalAmountForDb,
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
                    storeName: '-',
                    product: 'Petty Cash / Reimbursement',
                    expenseType: 'Batch Request',
                    receiptDateTime: dateProcessed,
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
                totalAmount: Number(entry.amount.toFixed(2)),
                uid: '',
                storeName: 'group petty cash',
                product: 'group petty cash',
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
            const totalAmount = Number(normalizeMoneyValue(normalized.receiptTotal || normalized.itemAmount, '0.00'));
            const dateKey = toDateKey(normalized.dateTime || '');
            const productKey = normalizeTextKey(normalized.product || '');
            const signatureKey = [
                normalizeTextKey(normalized.storeName || ''),
                productKey,
                normalizeMoneyValue(String(totalAmount), '0.00')
            ].join('|');

            parsed.push({
                staffName: fallbackStaff,
                amount,
                totalAmount,
                uid: (normalized.uniqueId || '').trim().toLowerCase(),
                storeName: (normalized.storeName || '').trim(),
                product: (normalized.product || '').trim(),
                rawDate: normalized.dateTime || '',
                dateKey,
                signatureKey
            });
        }

        if (parsed.length > 0) return parsed;

        const blockMatches = Array.from(formText.matchAll(/Particular:\s*(.*?)(?:\n|$)/gi));
        if (blockMatches.length > 0) {
            return blockMatches.map((match, idx) => {
                const blockStart = (match as any).index || 0;
                const blockEnd = formText.indexOf('Particular:', blockStart + 1);
                const blockText = formText.substring(blockStart, blockEnd === -1 ? formText.length : blockEnd);

                const pMatch = blockText.match(/Particular:\s*(.*?)(?:\n|$)/i);
                const dMatch = blockText.match(/Date\s*Purchased:\s*(.*?)(?:\n|$)/i);
                const aMatch = blockText.match(/Amount:\s*\$?([0-9,.]+(?:\.[0-9]{2})?)/i);

                const product = pMatch ? pMatch[1].trim() : 'Reimbursement Item';
                const date = dMatch ? dMatch[1].trim() : '';
                const numericAmount = aMatch ? Number(normalizeMoneyValue(aMatch[1].replace(/,/g, ''), '0.00')) : 0;

                return {
                    staffName: fallbackStaff,
                    amount: numericAmount,
                    totalAmount: numericAmount,
                    uid: `particular-${idx + 1}`,
                    storeName: 'reimbursement',
                    product: product,
                    rawDate: date,
                    dateKey: toDateKey(date),
                    signatureKey: [
                        'reimbursement',
                        normalizeTextKey(product),
                        normalizeMoneyValue(String(numericAmount), '0.00')
                    ].join('|')
                };
            });
        }

        const particularAmountLines = parseParticularAmountLines(formText);
        if (particularAmountLines.length > 0) {
            return particularAmountLines.map((entry, idx) => {
                const numericAmount = Number(normalizeMoneyValue(entry.amount, '0.00'));
                return {
                    staffName: fallbackStaff,
                    amount: numericAmount,
                    totalAmount: numericAmount,
                    uid: `particular-${idx + 1}`,
                    storeName: 'reimbursement',
                    product: entry.product,
                    rawDate: entry.date,
                    dateKey: toDateKey(entry.date),
                    signatureKey: [
                        'reimbursement',
                        normalizeTextKey(entry.product),
                        normalizeMoneyValue(String(numericAmount), '0.00')
                    ].join('|')
                };
            });
        }

        const amountMatch = formText.match(/Total\s*Amount:\s*\$?([\d,]+\.?\d*)/i) ||
            formText.match(/Amount:\s*\$?([\d,]+\.?\d*)/i) ||
            receiptText.match(/GRAND\s*TOTAL.*?\$\s*([\d,]+\.?\d*)/i);
        const fallbackAmount = amountMatch ? Number((amountMatch[1] || '0').replace(/,/g, '')) : 0;

        return [{
            staffName: fallbackStaff,
            amount: Number.isNaN(fallbackAmount) ? 0 : fallbackAmount,
            totalAmount: Number.isNaN(fallbackAmount) ? 0 : fallbackAmount,
            uid: '',
            storeName: '',
            product: '',
            rawDate: '',
            dateKey: '',
            signatureKey: `fallback|${normalizeMoneyValue(String(fallbackAmount || 0), '0.00')}`
        }];
    }, [reimbursementFormText, receiptDetailsText, requestMode]);

    const overLimitTransactionCount = useMemo(
        () => currentInputTransactions.filter((tx) => tx.amount > 300).length,
        [currentInputTransactions]
    );

    const currentInputOverallAmount = useMemo(() => {
        const formText = reimbursementFormText.trim();
        const receiptText = receiptDetailsText.trim();

        const formTotalMatch = formText.match(/Total\s*Amount:\s*\$?([\d,]+\.?\d*)/i);
        if (formTotalMatch) {
            return Number(formTotalMatch[1].replace(/,/g, '')) || 0;
        }

        const receiptTotalMatch = receiptText.match(/GRAND\s*TOTAL.*?\$\s*([\d,]+\.?\d*)/i);
        if (receiptTotalMatch) {
            return Number(receiptTotalMatch[1].replace(/,/g, '')) || 0;
        }

        if (currentInputTransactions.length > 0) {
            return Number(currentInputTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0).toFixed(2));
        }

        return 0;
    }, [reimbursementFormText, receiptDetailsText, currentInputTransactions]);

    const formVsReceiptTotals = useMemo(() => {
        const formText = reimbursementFormText.trim();
        const receiptText = receiptDetailsText.trim();

        const formTotalMatch = formText.match(/Total\s*Amount:\s*\$?([\d,]+\.?\d*)/i);
        const receiptTotalMatch = receiptText.match(/GRAND\s*TOTAL.*?\$\s*([\d,]+\.?\d*)/i);

        const formTotal = formTotalMatch ? Number(formTotalMatch[1].replace(/,/g, '')) : null;
        const receiptTotal = receiptTotalMatch ? Number(receiptTotalMatch[1].replace(/,/g, '')) : null;

        const hasBoth = formTotal !== null && receiptTotal !== null && Number.isFinite(formTotal) && Number.isFinite(receiptTotal);
        const difference = hasBoth ? Number(Math.abs((formTotal as number) - (receiptTotal as number)).toFixed(2)) : null;

        return {
            formTotal,
            receiptTotal,
            difference,
            isFormHigherMismatch: Boolean(hasBoth && (formTotal as number) > (receiptTotal as number) + 0.01)
        };
    }, [reimbursementFormText, receiptDetailsText]);

    const currentInputAgedCount = useMemo(() => currentInputTransactions.filter((tx) => {
        if (!tx.rawDate) return false;
        const parsedDate = parseDateValue(tx.rawDate);
        if (!parsedDate) return false;
        const ageMs = Date.now() - parsedDate.getTime();
        const days = ageMs / (1000 * 60 * 60 * 24);
        return days > 30;
    }).length, [currentInputTransactions]);

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
            const txStoreKey = normalizeTextKey(tx.storeName);
            const txProductKey = normalizeTextKey(tx.product);
            const txDateKey = String(tx.dateKey || '').trim().toLowerCase();
            const txAmount = normalizeMoneyValue(String(tx.amount), '0.00');
            const txTotalAmount = normalizeMoneyValue(String(tx.totalAmount), txAmount);
            const txReference = normalizeReferenceKey(tx.uid);

            if (!txStoreKey || !txProductKey || !txTotalAmount) return;

            historyRows.forEach((row: any) => {
                const historyStaff = normalizeNameKey(String(row.staffName || ''));
                const historyStoreKey = normalizeTextKey(String(row.storeName || ''));
                const historyProductKey = normalizeTextKey(String(row.product || ''));
                const historyDateKey = toDateKey(String(row.receiptDate || row.dateProcessed || ''));
                const historyAmount = normalizeMoneyValue(String(row.totalAmount || row.amount || '0.00'), '0.00');
                const historyTotalAmount = normalizeMoneyValue(String(row.totalAmount || row.amount || '0.00'), '0.00');
                const historyReference = normalizeReferenceKey(String(row.uid || row.nabCode || ''));
                const historyNabCodeRaw = String(row.nabCode || row.uid || '').trim();
                const historyNabCode = isValidNabReference(historyNabCodeRaw) ? historyNabCodeRaw.toUpperCase() : '';

                if (!historyStaff) return;

                const storeMatch = txStoreKey === historyStoreKey;
                const productMatch = txProductKey === historyProductKey;
                const staffMatch = txStaff && historyStaff ? txStaff === historyStaff : false;
                const dateMatch = txDateKey && historyDateKey ? txDateKey === historyDateKey : false;
                const totalAmountMatch = txTotalAmount === historyTotalAmount;
                const exactMatch = staffMatch && storeMatch && totalAmountMatch && dateMatch;
                const nearMatch = staffMatch && storeMatch && totalAmountMatch && !dateMatch;

                if (!exactMatch && !nearMatch) return;

                const evidence: DuplicateMatchEvidence = {
                    txStaffName: tx.staffName,
                    txStoreName: tx.storeName || '-',
                    txProduct: tx.product || '-',
                    txDateTime: tx.rawDate || '-',
                    txDateKey: txDateKey || '-',
                    txAmount,
                    txTotalAmount,
                    txReference: txReference || '-',
                    historyStaffName: String(row.staffName || '-'),
                    historyStoreName: String(row.storeName || '-'),
                    historyProduct: String(row.product || '-'),
                    historyDateTime: String(row.receiptDateTime || row.receiptDate || '-'),
                    historyDateKey: historyDateKey || '-',
                    historyAmount,
                    historyTotalAmount,
                    historyReference: historyReference || '-',
                    historyNabCode,
                    historyProcessedAt: String(row.dateProcessed || '-')
                };

                if (exactMatch) {
                    redMatches.push(evidence);
                } else if (nearMatch || (productMatch && staffMatch && storeMatch && totalAmountMatch)) {
                    yellowMatches.push(evidence);
                }
            });
        });

        if (redMatches.length > 0) return { signal: 'red', redMatches, yellowMatches };
        if (yellowMatches.length > 0) return { signal: 'yellow', redMatches, yellowMatches };
        return { signal: 'green', redMatches, yellowMatches };
    }, [currentInputTransactions, databaseRows, DUPLICATE_LOOKBACK_DAYS]);

    const isOver300ApprovalRequired = currentInputOverallAmount >= 300 && requestMode === 'solo';
    const hasFraudDuplicate = (duplicateCheckResult.signal === 'red' || duplicateCheckResult.signal === 'yellow') && requestMode === 'solo';
    const isOver30DaysApprovalRequired = currentInputAgedCount > 0 && !hasFraudDuplicate && requestMode === 'solo';


    const isJulianApprovalRequired = isOver300ApprovalRequired || isOver30DaysApprovalRequired;

    const rulesStatusItems = useMemo<RuleStatusItem[]>(() => {
        const formText = reimbursementFormText.trim();
        const receiptText = receiptDetailsText.trim();
        const hasInput = !!(formText || receiptText);

        if (requestMode === 'manual') {
            return [{
                id: 'special',
                title: 'Special Instruction Active',
                detail: 'Manual validation rules are bypassed. Direct entry enabled.',
                severity: 'info',
                status: 'pass'
            }];
        }

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
            const rowStore = normalizeTextKey(String(row.storeName || ''));
            const rowProduct = normalizeTextKey(String(row.product || ''));
            const signatureKey = [
                rowStore,
                rowProduct,
                rowAmount
            ].join('|');
            historyBySignature.set(signatureKey, [...(historyBySignature.get(signatureKey) || []), row]);
        });

        const historyUidMatches = currentInputTransactions
            .filter(tx => tx.uid && historyByUid.has(tx.uid))
            .flatMap(tx => historyByUid.get(tx.uid) || []);
        const historySignatureMatches = currentInputTransactions
            .map(tx => historyBySignature.get(tx.signatureKey) || [])
            .flat();

        const overLimitCount = overLimitTransactionCount;
        const agedCount = currentInputAgedCount;

        const missingStaffCount = currentInputTransactions.filter((tx) => {
            const staff = normalizeEmployeeName(tx.staffName);
            return !staff || staff === 'unknown';
        }).length;
        const missingStoreCount = currentInputTransactions.filter((tx) => {
            const store = normalizeTextKey(tx.storeName);
            return !store || store === '-';
        }).length;

        const clientMatch = formText.match(/^(?:Client(?:'|’)?s?\s*full\s*name|Name)\s*:\s*(.+)$/im);
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

        const rule1 = getRuleMeta('r1', 'Fraud Exact Match', 'critical');
        if (rule1) {
            items.push({
                id: 'r1',
                title: rule1.title,
                detail: duplicateCheckResult.redMatches.length > 0
                    ? `${duplicateCheckResult.redMatches.length} exact fraud match(es): same staff + store + purchase date + amount in history.`
                    : 'No exact fraud match found for staff + store + purchase date + amount.',
                severity: rule1.severity,
                status: duplicateCheckResult.redMatches.length > 0 ? 'blocked' : 'pass'
            });
        }

        const rule2 = getRuleMeta('r2', 'Fraud Near Match', 'high');
        if (rule2) {
            items.push({
                id: 'r2',
                title: rule2.title,
                detail: duplicateCheckResult.yellowMatches.length > 0
                    ? `${duplicateCheckResult.yellowMatches.length} near fraud match(es): same staff + store + amount, with purchase date mismatch/missing.`
                    : firstHistoryMatch
                        ? `No near fraud match. Last related processed record: ${firstHistoryMatch.dateProcessed || '-'} | NAB: ${firstHistoryMatch.nabCode || '-'}`
                        : 'No near fraud pattern found in history.',
                severity: rule2.severity,
                status: duplicateCheckResult.yellowMatches.length > 0 ? 'warning' : 'pass'
            });
        }

        const rule3 = getRuleMeta('r3', 'Receipt Amount > $300', 'high');
        if (rule3) {
            items.push({
                id: 'r3',
                title: rule3.title,
                detail: isOver300ApprovalRequired
                    ? `Total reimbursement amount is $${currentInputOverallAmount.toFixed(2)} (at or above $300): Save as Pending only with Julian approval.`
                    : overLimitCount > 0
                        ? `${overLimitCount} transaction(s) are more than $300 (partial blocked: Save as Pending only).`
                        : 'Total reimbursement amount is below $300 threshold.',
                severity: rule3.severity,
                status: isOver300ApprovalRequired || overLimitCount > 0 ? 'warning' : 'pass'
            });
        }

        const rule4 = getRuleMeta('r4', 'Receipt Age (> 30 days)', 'medium');
        if (rule4) {
            items.push({
                id: 'r4',
                title: rule4.title,
                detail: agedCount > 0
                    ? hasFraudDuplicate
                        ? `${agedCount} receipt(s) appear older than 30 days from purchase date, but fraud duplicate handling takes priority.`
                        : `${agedCount} receipt(s) appear older than 30 days from purchase date: Save as Pending only with Julian approval.`
                    : 'No receipts older than 30 days detected.',
                severity: rule4.severity,
                status: agedCount > 0 ? 'warning' : 'pass'
            });
        }

        const rule5 = getRuleMeta('r5', 'Staff & Store Integrity', 'high');
        if (rule5) {
            items.push({
                id: 'r5',
                title: rule5.title,
                detail: missingStaffCount > 0 || missingStoreCount > 0
                    ? `Missing data for fraud checks: staff=${missingStaffCount}, store=${missingStoreCount}.`
                    : missingFields.length > 0
                        ? `Core form fields missing: ${missingFields.join(', ')}.`
                        : 'Staff and store values are complete for fraud checks.',
                severity: rule5.severity,
                status: missingStaffCount > 0 || missingStoreCount > 0 || missingFields.length > 0 ? 'warning' : 'pass'
            });
        }

        const rule7 = getRuleMeta('r7', 'Form and Receipt Total Consistency', 'high');
        if (rule7) {
            const formTotal = formVsReceiptTotals.formTotal;
            const receiptTotal = formVsReceiptTotals.receiptTotal;
            const difference = formVsReceiptTotals.difference;

            const hasBothTotals = formTotal !== null && receiptTotal !== null
                && Number.isFinite(formTotal) && Number.isFinite(receiptTotal);

            const detail = !hasBothTotals
                ? 'Form total or receipt total is not fully available for comparison yet.'
                : formVsReceiptTotals.isFormHigherMismatch
                    ? `Reimbursement form total is higher than receipt total. Reimbursement form total is ${formTotal!.toFixed(2)}. Receipt total is ${receiptTotal!.toFixed(2)}. Difference amount is ${(difference || 0).toFixed(2)}.`
                    : receiptTotal! > formTotal! + 0.01
                        ? `Receipt total is higher than reimbursement form total. Reimbursement form total is ${formTotal!.toFixed(2)}. Receipt total is ${receiptTotal!.toFixed(2)}. Difference amount is ${(difference || 0).toFixed(2)}. Proceed based on reimbursement form total.`
                        : `Form and receipt totals are aligned. Reimbursement form total is ${formTotal!.toFixed(2)}. Receipt total is ${receiptTotal!.toFixed(2)}.`;

            const status: RuleStatusItem['status'] = !hasBothTotals
                ? 'warning'
                : formVsReceiptTotals.isFormHigherMismatch
                    ? 'blocked'
                    : receiptTotal! > formTotal! + 0.01
                        ? 'warning'
                        : 'pass';

            items.push({
                id: 'r7',
                title: rule7.title,
                detail,
                severity: rule7.severity,
                status
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
    }, [currentInputTransactions, databaseRows, reimbursementFormText, receiptDetailsText, rulesConfig, duplicateCheckResult, overLimitTransactionCount, isOver300ApprovalRequired, currentInputOverallAmount, currentInputAgedCount, hasFraudDuplicate, formVsReceiptTotals]);

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
                if (!hasSupabaseEnv) {
                    const next = historyData.filter(item => item.id !== selectedRow.internalId);
                    setHistoryData(next);
                    saveLocalAuditLogs(next);
                    handleRowModalClose();
                    return;
                }

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
                showWarningToast('Failed to delete record.');
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

                if (!hasSupabaseEnv) {
                    const next = historyData.filter(item => !internalIdsToDelete.has(item.id));
                    setHistoryData(next);
                    saveLocalAuditLogs(next);
                    setSelectedIds(new Set());
                    return;
                }

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
                showWarningToast('Failed to delete records.');
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

        // 2. Update Amount in Text Blob (supports Manual Mode: Amount Transferred)
        const amountVal = normalizeMoneyValue(String(editedRowData.totalAmount), '0.00');
        const amountLabelRegex = /(\*\*Amount(?: Transferred)?:\*\*\s*)\$?(.*?)(\n|$)/i;
        if (amountLabelRegex.test(newContent)) {
            newContent = newContent.replace(amountLabelRegex, `$1$${amountVal}$3`);
        } else {
            newContent = newContent.replace(/(Amount(?: Transferred)?:\s*)\$?(.*?)(\n|$)/i, `$1$${amountVal}$3`);
        }

        // 2b. Keep Manual Mode summary table and total line in sync with edited amount
        if (newContent.includes('MANUAL-ENTRY')) {
            newContent = newContent.replace(
                /(\|\s*1\s*\|\s*MANUAL-ENTRY\s*\|\s*[^|]*\|\s*[^|]*\|\s*[^|]*\|\s*[^|]*\|\s*)\$?[\d,]+(?:\.\d{1,2})?(\s*\|\s*)\$?[\d,]+(?:\.\d{1,2})?(\s*\|[^\n]*\n?)/i,
                `$1$${amountVal}$2$${amountVal}$3`
            );
            newContent = newContent.replace(/(\*\*TOTAL\s+AMOUNT:\s*)\$?[\d,]+(?:\.\d{1,2})?(\*\*)/i, `$1$${amountVal}$2`);
        }

        // 3. Update Client and Location in Text Blob
        const clientValue = String(editedRowData.ypName || '').trim();
        const locationValue = String(editedRowData.youngPersonName || '').trim();
        const clientContentValue = clientValue || '-';
        const locationContentValue = locationValue || '-';

        if (newContent.match(/\*\*Client:\*\*/i)) {
            newContent = newContent.replace(/(\*\*Client:\*\*\s*)(.*?)(\n|$)/i, `$1${clientContentValue}$3`);
        } else if (newContent.match(/(^|\n)Client:\s*/i)) {
            newContent = newContent.replace(/((?:^|\n)Client:\s*)(.*?)(\n|$)/i, `$1${clientContentValue}$3`);
        } else if (newContent.match(/\*\*Client \/ Location:\*\*/)) {
            newContent = newContent.replace(/(\*\*Client \/ Location:\*\*\s*)(.*?)(\n|$)/, `$1${clientContentValue}$3`);
        } else {
            newContent += `\n**Client:** ${clientContentValue}`;
        }

        if (newContent.match(/\*\*Location:\*\*/i)) {
            newContent = newContent.replace(/(\*\*Location:\*\*\s*)(.*?)(\n|$)/i, `$1${locationContentValue}$3`);
        } else if (newContent.match(/(^|\n)Location:\s*/i)) {
            newContent = newContent.replace(/((?:^|\n)Location:\s*)(.*?)(\n|$)/i, `$1${locationContentValue}$3`);
        } else {
            newContent += `\n**Location:** ${locationContentValue}`;
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
                    yp_name: clientValue || null,
                    location: locationValue || null,
                    nab_code: editedRowData.nabCode,
                    full_email_content: newContent
                };
            }
            return item;
        });
        setHistoryData(updatedHistory);

        if (!hasSupabaseEnv) {
            saveLocalAuditLogs(updatedHistory);
            handleRowModalClose();
            return;
        }

        // Persist to Supabase
        try {
            const { error } = await supabase
                .from('audit_logs')
                .update({
                    staff_name: editedRowData.staffName,
                    amount: parseFloat(amountVal),
                    yp_name: clientValue || null,
                    location: locationValue || null,
                    nab_code: editedRowData.nabCode,
                    full_email_content: newContent
                })
                .eq('id', editedRowData.internalId);

            if (error) throw error;

            handleRowModalClose();
        } catch (e) {
            console.error("Supabase Update Error", e);
            showWarningToast('Failed to save changes to the database. Please check your connection.');
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
            if (!hasSupabaseEnv) {
                const updateMap = new Map<any, any>();

                Array.from(uniqueIdsSet).forEach((internalId) => {
                    const originalRecord = historyData.find(r => r.id === internalId);
                    if (!originalRecord) return;

                    let newContent = originalRecord.full_email_content || "";
                    const nextRecord: any = { ...originalRecord };

                    if (massEditData.staffName) {
                        nextRecord.staff_name = massEditData.staffName;
                        newContent = newContent.replace(/(\*\*Staff Member:\*\*\s*)(.*?)(\n|$)/, `$1${massEditData.staffName}$3`);
                    }

                    if (massEditData.totalAmount) {
                        const cleanAmount = massEditData.totalAmount.replace(/[^0-9.]/g, '');
                        nextRecord.amount = parseFloat(cleanAmount);
                        newContent = newContent.replace(/(\*\*Amount:\*\*\s*\$?)(.*?)(\n|$)/, `$1$${cleanAmount}$3`);
                    }

                    if (massEditData.nabCode) {
                        nextRecord.nab_code = massEditData.nabCode;
                        if (newContent.match(/NAB (?:Code|Reference):/)) {
                            newContent = newContent.replace(/(NAB (?:Code|Reference):(?:\*\*|)\s*)(.*?)(\n|$)/, `$1${massEditData.nabCode}$3`);
                        } else {
                            newContent += `\n**NAB Code:** ${massEditData.nabCode}`;
                        }
                    }

                    const massClientValue = String(massEditData.ypName || '').trim();
                    const massLocationValue = String(massEditData.youngPersonName || '').trim();

                    if (massClientValue) {
                        nextRecord.yp_name = massClientValue;
                        if (newContent.match(/\*\*Client:\*\*/i)) {
                            newContent = newContent.replace(/(\*\*Client:\*\*\s*)(.*?)(\n|$)/i, `$1${massClientValue}$3`);
                        } else if (newContent.match(/(^|\n)Client:\s*/i)) {
                            newContent = newContent.replace(/((?:^|\n)Client:\s*)(.*?)(\n|$)/i, `$1${massClientValue}$3`);
                        } else if (newContent.match(/\*\*Client \/ Location:\*\*/)) {
                            newContent = newContent.replace(/(\*\*Client \/ Location:\*\*\s*)(.*?)(\n|$)/, `$1${massClientValue}$3`);
                        } else {
                            newContent += `\n**Client:** ${massClientValue}`;
                        }
                    }

                    if (massLocationValue) {
                        nextRecord.location = massLocationValue;
                        if (newContent.match(/\*\*Location:\*\*/i)) {
                            newContent = newContent.replace(/(\*\*Location:\*\*\s*)(.*?)(\n|$)/i, `$1${massLocationValue}$3`);
                        } else if (newContent.match(/(^|\n)Location:\s*/i)) {
                            newContent = newContent.replace(/((?:^|\n)Location:\s*)(.*?)(\n|$)/i, `$1${massLocationValue}$3`);
                        } else {
                            newContent += `\n**Location:** ${massLocationValue}`;
                        }
                    }

                    if (massEditData.uid) {
                        if (newContent.match(/\*\*Receipt ID:\*\*/)) {
                            newContent = newContent.replace(/(\*\*Receipt ID:\*\*\s*)(.*?)(\n|$)/, `$1${massEditData.uid}$3`);
                        } else {
                            newContent += `\n**Receipt ID:** ${massEditData.uid}`;
                        }
                    }

                    if (massEditData.timestamp) {
                        const newDate = new Date(massEditData.timestamp);
                        if (!isNaN(newDate.getTime())) {
                            nextRecord.created_at = newDate.toISOString();
                        }
                    }

                    nextRecord.full_email_content = newContent;
                    updateMap.set(internalId, nextRecord);
                });

                const nextHistory = historyData.map(item => updateMap.get(item.id) || item);
                setHistoryData(nextHistory);
                saveLocalAuditLogs(nextHistory);

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
                return;
            }

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

                // 4. Client and Location
                const massClientValue = String(massEditData.ypName || '').trim();
                const massLocationValue = String(massEditData.youngPersonName || '').trim();

                if (massClientValue) {
                    dbUpdates.yp_name = massClientValue;
                    if (newContent.match(/\*\*Client:\*\*/i)) {
                        newContent = newContent.replace(/(\*\*Client:\*\*\s*)(.*?)(\n|$)/i, `$1${massClientValue}$3`);
                    } else if (newContent.match(/(^|\n)Client:\s*/i)) {
                        newContent = newContent.replace(/((?:^|\n)Client:\s*)(.*?)(\n|$)/i, `$1${massClientValue}$3`);
                    } else if (newContent.match(/\*\*Client \/ Location:\*\*/)) {
                        newContent = newContent.replace(/(\*\*Client \/ Location:\*\*\s*)(.*?)(\n|$)/, `$1${massClientValue}$3`);
                    } else {
                        newContent += `\n**Client:** ${massClientValue}`;
                    }
                }

                if (massLocationValue) {
                    dbUpdates.location = massLocationValue;
                    if (newContent.match(/\*\*Location:\*\*/i)) {
                        newContent = newContent.replace(/(\*\*Location:\*\*\s*)(.*?)(\n|$)/i, `$1${massLocationValue}$3`);
                    } else if (newContent.match(/(^|\n)Location:\s*/i)) {
                        newContent = newContent.replace(/((?:^|\n)Location:\s*)(.*?)(\n|$)/i, `$1${massLocationValue}$3`);
                    } else {
                        newContent += `\n**Location:** ${massLocationValue}`;
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
            showWarningToast('Failed to save mass edits. Please check console.');
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
            showWarningToast('No records found for this period.');
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
        setEmailCopied(null);
        setSaveStatus('idle');
        setIsEditing(false);
        setOcrStatus('');
        setReimbursementFormText('');
        setReceiptDetailsText('');
        setRequestMode('solo');
        setSelectedEmployees(new Map());

        setEmployeeSearchQuery(new Map());
        setShowEmployeeDropdown(new Map());
        setAmountSelectionByTx(new Map());
        setShowApprovedClaimantModal(false);
        setApprovedClaimantEmailContent('');
        setApprovedClaimantCopied(false);
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

    const handleCopyEmail = async (target: 'julian' | 'claimant') => {
        const rawContent = target === 'julian' ? julianEmailContent : claimantEmailContent;
        if (!rawContent) return;

        const contentToCopy = stripClientLocationLine(stripInternalAuditMeta(rawContent));
        const targetId = target === 'julian' ? 'email-copy-julian' : 'email-copy-claimant';
        const emailElement = document.getElementById(targetId);
        if (emailElement) {
            try {
                const blobHtml = new Blob([emailElement.innerHTML], { type: 'text/html' });
                const blobText = new Blob([stripClientLocationLine(emailElement.innerText)], { type: 'text/plain' });
                const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
                await navigator.clipboard.write(data);
                setEmailCopied(target);
                setTimeout(() => setEmailCopied(null), 2000);
                return;
            } catch (e) {
                console.warn('ClipboardItem API failed', e);
            }
        }

        await navigator.clipboard.writeText(contentToCopy);
        setEmailCopied(target);
        setTimeout(() => setEmailCopied(null), 2000);
    };

    const handleCopyApprovedClaimantEmail = async () => {
        if (!approvedClaimantEmailContent) return;

        const emailElement = document.getElementById('approved-claimant-copy-content');
        if (emailElement) {
            try {
                const blobHtml = new Blob([emailElement.innerHTML], { type: 'text/html' });
                const blobText = new Blob([stripClientLocationLine(emailElement.innerText)], { type: 'text/plain' });
                const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
                await navigator.clipboard.write(data);
                setApprovedClaimantCopied(true);
                setTimeout(() => setApprovedClaimantCopied(false), 2000);
                return;
            } catch (e) {
                console.warn('ClipboardItem API failed', e);
            }
        }

        await navigator.clipboard.writeText(stripClientLocationLine(approvedClaimantEmailContent));
        setApprovedClaimantCopied(true);
        setTimeout(() => setApprovedClaimantCopied(false), 2000);
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

    const addGroupLiquidationsFromTransactions = (transactions: Array<{ staffName?: string; ypName?: string; location?: string; amount?: string | number }>) => {
        if (requestMode !== 'group' || transactions.length === 0) return;

        const now = new Date();
        const nowIso = now.toISOString();
        const currentWeekKey = getWeekKeyLocal(now);
        const pendingItems = transactions
            .map((tx) => {
                const staffName = String(tx.staffName || '').trim();
                if (!staffName) return null;
                const staffKey = normalizeNameKey(staffName);
                if (!staffKey) return null;
                return {
                    staffName,
                    staffKey,
                    ypName: String(tx.ypName || '-').trim() || '-',
                    location: String(tx.location || '-').trim() || '-',
                    amount: normalizeMoneyValue(String(tx.amount || '0.00'), '0.00'),
                    weekKey: currentWeekKey,
                    createdAt: nowIso
                };
            })
            .filter((item): item is Omit<GroupLiquidationQueueItem, 'id'> => Boolean(item));

        if (pendingItems.length === 0) return;
        setGroupLiquidationQueue((prev) => {
            const next = [...prev];
            pendingItems.forEach((incoming, idx) => {
                const existingIndex = next.findIndex((item) => item.staffKey === incoming.staffKey && item.weekKey === incoming.weekKey);
                if (existingIndex >= 0) {
                    next[existingIndex] = {
                        ...next[existingIndex],
                        staffName: incoming.staffName,
                        ypName: incoming.ypName,
                        location: incoming.location,
                        amount: incoming.amount,
                        createdAt: incoming.createdAt
                    };
                    return;
                }

                next.unshift({
                    ...incoming,
                    id: `groupliq-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`
                });
            });
            saveGroupLiquidationQueue(next);
            return next;
        });
    };

    const handleSettleGroupLiquidation = (id: string) => {
        setGroupLiquidationQueue((prev) => {
            const next = prev.filter((item) => item.id !== id);
            saveGroupLiquidationQueue(next);
            return next;
        });
    };

    const handleSettleLiquidation = async (id: string) => {
        if (!hasSupabaseEnv) {
            setErrorMessage('Supabase environment not configured. Cannot settle liquidation.');
            return;
        }

        setIsSettlingLiquidation(id);
        try {
            const { error } = await supabase
                .from('reimbursement_logs')
                .update({ nab_code: 'PAID' })
                .eq('id', id);

            if (error) throw error;

            // Refresh history
            await fetchHistory();
            showSavedToast([{ nab_code: 'PAID', amount: 0 }]);
        } catch (err: any) {
            console.error('Settlement error:', err);
            setErrorMessage(`Failed to settle liquidation: ${err.message}`);
        } finally {
            setIsSettlingLiquidation(null);
        }
    };

    const handleSaveToCloud = async (contentOverride?: string) => {

        const contentToSave = contentOverride || (isEditing ? editableContent : results?.phase4);
        if (!contentToSave) return;
        const isPendingSave = contentToSave.includes('<!-- STATUS: PENDING -->');
        const normalizeOptionalText = (value: unknown): string | null => {
            const normalized = String(value || '').replace(/\*\*/g, '').trim();
            if (!normalized) return null;
            const lowered = normalized.toLowerCase();
            if (lowered === '-' || lowered === 'n/a' || lowered === 'na' || lowered === 'unknown') return null;
            if (lowered.startsWith('enter ')) return null;
            return normalized;
        };

        setIsSaving(true);
        setSaveStatus('idle');

        try {
            // Use getParsedTransactions logic here as well for consistency
            const transactions = getParsedTransactions();
            const payloads = transactions.map(tx => {
                let nabCode = tx.currentNabRef;
                if (isPendingSave) {
                    nabCode = 'PENDING';
                } else if (!isValidNabReference(nabCode)) {
                    nabCode = null;
                }

                const ypNameValue = normalizeOptionalText(tx.ypName);
                const locationValue = normalizeOptionalText(tx.location);

                return {
                    staff_name: tx.staffName,
                    amount: parseFloat(String(tx.amount).replace(/[^0-9.-]/g, '')) || 0,
                    nab_code: nabCode,
                    yp_name: ypNameValue,
                    location: locationValue,
                    full_email_content: contentToSave,
                    created_at: new Date().toISOString()
                };
            });

            if (payloads.length === 0) {
                // Fallback for single block if parsing failed
                const staffNameMatch = contentToSave.match(/\*\*Staff Member:\*\*\s*(.*)/) || contentToSave.match(/Staff Member:\s*(.*)/i);
                const amountMatch = contentToSave.match(/\*\*Amount(?: Transferred)?:\*\*\s*(.*)/i) || contentToSave.match(/Amount:\s*(.*)/i);
                const nabMatch = contentToSave.match(/NAB (?:Code|Reference):(?:\*\*|)\s*(.*)/i);
                const fallbackClient = extractFieldValue(contentToSave, [
                    /\*\*Client(?:'|’)?s?\s*Full\s*Name:\*\*\s*(.*)/i,
                    /Client(?:'|’)?s?\s*Full\s*Name:\s*(.*)/i,
                    /\*\*Client:\*\*\s*(.*)/i,
                    /Client:\s*(.*)/i,
                    /\*\*YP Name:\*\*\s*(.*)/i,
                    /YP Name:\s*(.*)/i
                ]);
                const fallbackLocation = extractFieldValue(contentToSave, [
                    /\*\*Address:\*\*\s*(.*)/i,
                    /Address:\s*(.*)/i,
                    /\*\*Location:\*\*\s*(.*)/i,
                    /Location:\s*(.*)/i,
                    /\*\*Client\s*\/\s*Location:\*\*\s*(.*)/i,
                    /Client\s*\/\s*Location:\s*(.*)/i
                ]);

                const staffName = staffNameMatch ? staffNameMatch[1].trim() : 'Unknown';
                const amountRaw = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';
                const amount = parseFloat(amountRaw.replace(/[^0-9.-]/g, '')) || 0;
                let nabCode = nabMatch ? nabMatch[1].trim() : null;

                if (isPendingSave) {
                    nabCode = 'PENDING';
                } else if (!isValidNabReference(nabCode)) {
                    nabCode = null;
                }

                payloads.push({
                    staff_name: staffName,
                    amount: amount,
                    nab_code: nabCode,
                    yp_name: normalizeOptionalText(fallbackClient),
                    location: normalizeOptionalText(fallbackLocation),
                    full_email_content: contentToSave,
                    created_at: new Date().toISOString()
                });
            }


            if (!hasSupabaseEnv) {
                const now = Date.now();
                const localPayloads = payloads.map((payload, idx) => ({
                    ...payload,
                    id: `local-${now}-${idx}-${Math.floor(Math.random() * 1000)}`
                }));
                const merged = [...localPayloads, ...loadLocalAuditLogs()];
                saveLocalAuditLogs(merged);
                setHistoryData(merged);
                addGroupLiquidationsFromTransactions(transactions);
                setSaveStatus('success');
                showSavedToast(payloads as Array<{ nab_code?: string | null; amount?: number }>);
                resetAll();
                scrollToReimbursementForm();
                return;
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

            addGroupLiquidationsFromTransactions(transactions);
            setSaveStatus('success');
            showSavedToast(payloads as Array<{ nab_code?: string | null; amount?: number }>);
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
        setManualNabCodeInput('');
        setManualNabCodeError(null);
    };

    const confirmSaveWithContent = (
        status: 'PENDING' | 'PAID' | 'PENDING_LIQUIDATION',
        baseContent: string,
        options?: { duplicateSignal?: DuplicateTrafficLight; reviewerReason?: string; detail?: string }
    ) => {
        let withStatus = upsertStatusTag(baseContent, status);
        withStatus = (status === 'PENDING' && isFormHigherMismatchDetail(options?.detail))
            ? upsertClaimantRevisionSection(withStatus)
            : stripClaimantRevisionSection(withStatus);

        const julianApprovalContext = {
            approvalReason: isOver30DaysDetail(options?.detail)
                ? 'Receipt is older than 30 days from purchase date'
                : 'Total reimbursement amount is at or above $300',
            fraudReceiptStatus: options?.duplicateSignal === 'red'
                ? `Matched exact fraud duplicate (${duplicateCheckResult.redMatches.length})`
                : options?.duplicateSignal === 'yellow'
                    ? `Matched near fraud duplicate (${duplicateCheckResult.yellowMatches.length})`
                    : 'Not matched in duplicate history'
        };

        withStatus = (status === 'PENDING' && isJulianApprovalDetail(options?.detail))
            ? upsertJulianApprovalSection(withStatus, julianApprovalContext)
            : stripJulianApprovalSection(withStatus);

        const finalContent = appendDuplicateAuditMeta(withStatus, options?.duplicateSignal ? {
            signal: options.duplicateSignal,
            reason: options.reviewerReason,
            detail: options.detail,
            lookbackDays: DUPLICATE_LOOKBACK_DAYS
        } : undefined);

        handleSaveToCloud(finalContent);
        closeSaveModal();
    };

    const confirmSave = (
        status: 'PENDING' | 'PAID' | 'PENDING_LIQUIDATION',
        options?: { duplicateSignal?: DuplicateTrafficLight; reviewerReason?: string; detail?: string }
    ) => {
        const baseContent = isEditing ? editableContent : results?.phase4 || '';
        confirmSaveWithContent(status, baseContent, options);
    };


    const handleSaveAsPaid = () => {
        const hasTransactions = parsedTransactions.length > 0;
        const missingNabIndexes = parsedTransactions
            .filter(tx => !isValidNabReference(tx.currentNabRef))
            .map(tx => tx.index);

        if (hasTransactions && missingNabIndexes.length > 0) {
            const normalizedManualNab = manualNabCodeInput.trim().toUpperCase();
            if (!isValidNabReference(normalizedManualNab)) {
                setManualNabCodeError('NAB code must be exactly 11 characters (1 letter + 10 digits).');
                setSaveModalDecision({ mode: 'nab', detail: 'NAB code is required before saving as PAID. Enter bank-provided NAB code manually.' });
                setShowSaveModal(true);
                return;
            }

            const currentContent = isEditing ? editableContent : (results?.phase4 || '');
            let updatedContent = currentContent;
            missingNabIndexes.forEach((index) => {
                updatedContent = setTransactionNabInContent(updatedContent, index, normalizedManualNab);
            });

            if (isEditing) {
                setEditableContent(updatedContent);
            } else {
                setResults(prev => (prev ? { ...prev, phase4: updatedContent } : prev));
            }

            confirmSaveWithContent('PAID', updatedContent, { duplicateSignal: 'green', detail: 'No duplicate patterns detected at save approval.' });
            return;
        }

        confirmSave('PAID', { duplicateSignal: 'green', detail: 'No duplicate patterns detected at save approval.' });
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

        let updatedRecords: Array<{ id: any; nab_code: string; full_email_content: string; staff_name?: string; amount?: number; yp_name?: string; location?: string }> = [];
        let combinedClaimantEmail = '';

        setIsApprovingPending(true);
        try {
            updatedRecords = pendingApprovalStaffGroup.records.map((record: any) => {
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
                    full_email_content: updatedContent,
                    staff_name: record.staff_name,
                    amount: record.amount,
                    yp_name: record.yp_name,
                    location: record.location
                };
            });

            const claimantBlocks = updatedRecords
                .map((record) => {
                    const rawContent = String(record.full_email_content || '');
                    if (!rawContent.trim()) return '';

                    let content = stripClientLocationLine(
                        stripInternalAuditMeta(
                            stripJulianApprovalSection(rawContent)
                        )
                    );

                    // Recompose header if it was stripped or is missing
                    if (!content.includes('Hi,') && !content.includes('I hope this message')) {
                        const staffName = record.staff_name || 'Staff Member';
                        const ypName = record.yp_name || 'Client Name';
                        const address = record.location || 'Address';
                        const amount = record.amount ? Number(record.amount).toFixed(2) : '0.00';

                        const header = [
                            'Hi,',
                            '',
                            'I hope this message finds you well.',
                            '',
                            'I am writing to confirm that your reimbursement request has been successfully processed today.',
                            '',
                            `**Staff Member:** ${staffName}`,
                            `**Client's Full Name:** ${ypName}`,
                            `**Address:** ${address}`,
                            `**Amount:** $${amount}`,
                            ''
                        ].join('\n');

                        content = header + '\n' + content.trim();
                    }

                    return content;
                })
                .filter(Boolean);

            combinedClaimantEmail = claimantBlocks.length <= 1
                ? (claimantBlocks[0] || '')
                : claimantBlocks
                    .map((block, idx) => `Approved Reimbursement ${idx + 1}\n\n${block}`)
                    .join('\n\n------------------------------\n\n');

            if (!hasSupabaseEnv) {
                const updatesById = new Map<any, { id: any; nab_code: string; full_email_content: string }>(
                    updatedRecords.map(record => [record.id, record])
                );

                const nextHistory = historyData.map(item => {
                    const updated = updatesById.get(item.id);
                    if (!updated) return item;
                    return {
                        ...item,
                        nab_code: updated.nab_code,
                        full_email_content: updated.full_email_content
                    };
                });

                setHistoryData(nextHistory);
                saveLocalAuditLogs(nextHistory);
                closePendingApprovalModal();
                if (combinedClaimantEmail) {
                    setApprovedClaimantEmailContent(combinedClaimantEmail);
                    setApprovedClaimantCopied(false);
                    setShowApprovedClaimantModal(true);
                }
                return;
            }

            let hadNabConflict = false;
            const appliedRecords: Array<{ id: any; nab_code: string | null; full_email_content: string }> = [];

            for (const record of updatedRecords) {
                const { error } = await supabase
                    .from('audit_logs')
                    .update({
                        nab_code: record.nab_code,
                        full_email_content: record.full_email_content
                    })
                    .eq('id', record.id);

                if (error && error.code === '23505') {
                    hadNabConflict = true;
                    const { error: fallbackError } = await supabase
                        .from('audit_logs')
                        .update({ full_email_content: record.full_email_content })
                        .eq('id', record.id);

                    if (fallbackError) throw fallbackError;
                    appliedRecords.push({ ...record, nab_code: null });
                    continue;
                }

                if (error) throw error;
                appliedRecords.push(record);
            }

            const updatesById = new Map<any, { id: any; nab_code: string | null; full_email_content: string }>(
                appliedRecords.map(record => [record.id, record])
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
            if (combinedClaimantEmail) {
                setApprovedClaimantEmailContent(combinedClaimantEmail);
                setApprovedClaimantCopied(false);
                setShowApprovedClaimantModal(true);
            }
            if (hadNabConflict) {
                showWarningToast('Approved successfully. Duplicate NAB assignment was skipped for at least one entry.');
            }
        } catch (error) {
            console.error('Failed to approve pending record:', error);
            if (isNetworkFetchError(error) && updatedRecords.length > 0) {
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
                if (combinedClaimantEmail) {
                    setApprovedClaimantEmailContent(combinedClaimantEmail);
                    setApprovedClaimantCopied(false);
                    setShowApprovedClaimantModal(true);
                }
                showWarningToast('Network issue while syncing. Approval was applied on-screen; please refresh later to confirm cloud sync.');
                return;
            }

            const message = (error as any)?.message || 'Please try again.';
            showWarningToast(`Failed to approve pending record. ${message}`);
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
            showWarningToast('Failed to update follow-up timestamp. Please try again.');
        } finally {
            setFollowUpingGroupKey(null);
        }
    };

    const handleSmartSave = () => {
        const hasTransactions = parsedTransactions.length > 0;
        const allHaveRef = parsedTransactions.every(tx => isValidNabReference(tx.currentNabRef));
        setSaveStatus('idle');
        setErrorMessage(null);

        if (requestMode === 'solo') {
            const combinedText = `${reimbursementFormText}\n${receiptDetailsText}`;
            const tableHeaderRegex = /\|?\s*Receipt\s*#\s*\|\s*Unique\s*ID\s*\/\s*Fallback\s*\|\s*Store\s*Name\s*\|\s*Date\s*&\s*Time\s*\|\s*Product\s*\(Per\s*Item\)\s*\|\s*Category\s*\|\s*Item\s*Amount\s*\|\s*Receipt\s*Total\s*\|\s*Notes\s*\|?/i;
            const hasReceiptTable = tableHeaderRegex.test(combinedText);
            if (!hasReceiptTable) {
                setErrorMessage('Receipt table is required for Solo Mode. Paste the full receipt table before saving.');
                return;
            }

            const invalidReceiptRows = currentInputTransactions.filter((tx) => {
                const storeKey = normalizeTextKey(tx.storeName || '');
                const productKey = normalizeTextKey(tx.product || '');
                const rawDate = String(tx.rawDate || '').trim();
                const totalValue = Number(normalizeMoneyValue(String(tx.totalAmount), '0.00'));
                if (!storeKey || storeKey === 'particulars') return true;
                if (!productKey || productKey === '-') return true;
                if (!rawDate) return true;
                if (!Number.isFinite(totalValue) || totalValue <= 0) return true;
                return false;
            });

            if (invalidReceiptRows.length > 0) {
                setErrorMessage('Receipt table rows are incomplete. Please provide Store Name, Product, Date & Time, and Receipt Total for every row.');
                return;
            }
        }

        if (requestMode === 'group' && hasTransactions && !allHaveRef) {
            setManualNabCodeError(null);
            setSaveModalDecision({ mode: 'nab', detail: 'NAB code is required for Group Mode. Provide a valid NAB code to continue.' });
            setShowSaveModal(true);
            return;
        }

        // IF NAB CODE IS PRESENT: Save immediately without questions (No validation warnings/modals)
        if (hasTransactions && allHaveRef) {
            confirmSave('PAID', {
                duplicateSignal: 'green',
                detail: 'Direct save triggered by presence of NAB reference.'
            });
            return;
        }

        if (duplicateCheckResult.signal === 'red') {

            const ageContext = currentInputAgedCount > 0
                ? ` Receipt age check: ${currentInputAgedCount} record(s) are older than 30 days; fraud handling takes priority.`
                : '';
            const detail = `Matched ${duplicateCheckResult.redMatches.length} duplicate receipt pattern(s) with same Store + Product + Total Amount in the last ${DUPLICATE_LOOKBACK_DAYS} days (Date/Time is optional).${ageContext}`;
            setSaveStatus('duplicate');
            setSaveModalDecision({ mode: 'red', detail });
            setShowSaveModal(true);
            return;
        }

        if (duplicateCheckResult.signal === 'yellow') {
            const ageContext = currentInputAgedCount > 0
                ? ` Receipt age check: ${currentInputAgedCount} record(s) are older than 30 days; fraud handling takes priority.`
                : '';
            const detail = `Matched ${duplicateCheckResult.yellowMatches.length} near-duplicate pattern(s) in the last ${DUPLICATE_LOOKBACK_DAYS} days.${ageContext}`;
            setSaveModalDecision({ mode: 'yellow', detail });
            setShowSaveModal(true);
            return;
        }

        if (formVsReceiptTotals.isFormHigherMismatch && formVsReceiptTotals.formTotal !== null && formVsReceiptTotals.receiptTotal !== null) {
            const detail = `Reimbursement form total is higher than receipt total. Reimbursement form total is ${formVsReceiptTotals.formTotal.toFixed(2)}. Receipt total is ${formVsReceiptTotals.receiptTotal.toFixed(2)}. Difference amount is ${(formVsReceiptTotals.difference || 0).toFixed(2)}.`;
            setSaveModalDecision({ mode: 'yellow', detail });
            setShowSaveModal(true);
            return;
        }

        if (isOver30DaysApprovalRequired) {
            const detail = `${currentInputAgedCount} receipt(s) are older than 30 days from purchase date (30-day receipt age). Save as Pending only and subject to Julian approval. Fraud receipt check: Not matched in duplicate history.`;
            setSaveModalDecision({ mode: 'yellow', detail });
            setShowSaveModal(true);
            return;
        }

        if (isOver300ApprovalRequired) {
            const detail = `Total reimbursement amount is $${currentInputOverallAmount.toFixed(2)} (at or above $300). Save as Pending only and subject to Julian approval.`;
            setSaveModalDecision({ mode: 'yellow', detail });
            setShowSaveModal(true);
            return;
        }

        if (hasTransactions && !allHaveRef) {
            setManualNabCodeError(null);
            setSaveModalDecision({ mode: 'nab', detail: 'NAB code is required before saving as PAID. Enter bank-provided NAB code manually.' });
            setShowSaveModal(true);
            return;
        }

        const status = (hasTransactions && allHaveRef) ? 'PAID' : 'PENDING';
        confirmSave(status, {
            duplicateSignal: 'green',
            detail: `No duplicate patterns detected within ${DUPLICATE_LOOKBACK_DAYS}-day lookback.`
        });
    };

    const handleSaveSpecialInstruction = () => {
        setSaveStatus('idle');
        setErrorMessage(null);
        if (!results?.phase4) {
            setErrorMessage('Run Start Audit first to generate Special Instruction output.');
            return;
        }

        if (parsedTransactions.length === 0) {
            setErrorMessage('No transaction rows found for Special Instruction.');
            return;
        }

        const allHaveRef = parsedTransactions.every(tx => isValidNabReference(tx.currentNabRef));

        // If NAB code is already entered, skip confirmation and save immediately
        if (allHaveRef) {
            confirmSave('PAID', {
                duplicateSignal: 'green',
                detail: 'Special Instruction direct save triggered by presence of NAB reference.'
            });
            return;
        }

        const nowIso = new Date().toISOString();

        const payloads = parsedTransactions.map((tx, idx) => {
            const selectedEmployee = selectedEmployees.get(tx.index);
            const typedName = String(employeeSearchQuery.get(tx.index) || '').trim();
            const staffName = selectedEmployee
                ? getEmployeeDisplayName(selectedEmployee)
                : typedName || tx.formattedName || tx.staffName || 'Unknown';

            const selectedAmount = String(amountSelectionByTx.get(tx.index) || tx.amount || '0').trim();
            const amount = Number(normalizeMoneyValue(selectedAmount, '0.00'));
            const nabCode = String(tx.currentNabRef || '').trim();
            const hasValidNab = isValidNabReference(nabCode);
            const normalizedNab = hasValidNab ? nabCode.toUpperCase() : 'Nab code is pending';
            const statusTag = hasValidNab ? '<!-- STATUS: PAID -->' : '<!-- STATUS: PENDING -->';

            const content = [
                'Hi,',
                '',
                'Special instruction entry recorded for NAB/EOD logging.',
                '',
                `**Staff Member:** ${staffName}`,
                `**Amount:** $${amount.toFixed(2)}`,
                `**NAB Code:** ${hasValidNab ? normalizedNab : 'Enter NAB Code'}`,
                statusTag,
                '<!-- SPECIAL_INSTRUCTION -->'
            ].join('\n');

            return {
                id: `special-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
                staff_name: staffName,
                amount,
                nab_code: normalizedNab,
                full_email_content: content,
                created_at: nowIso,
                is_special_instruction: true
            };
        });

        if (payloads.some((p) => !Number.isFinite(p.amount) || p.amount <= 0)) {
            setErrorMessage('Special Instruction amount must be greater than 0.');
            return;
        }

        const next = [...payloads, ...specialInstructionLogs];
        setSpecialInstructionLogs(next);
        saveSpecialInstructionLogs(next);
        showSavedToast(payloads as Array<{ nab_code?: string | null; amount?: number }>);
        setSaveStatus('success');
        resetAll();
        scrollToReimbursementForm();
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
        if (!reimbursementFormText.trim() && !receiptDetailsText.trim() && requestMode === 'solo') {
            setErrorMessage("Please paste Reimbursement Form or Receipt Details first.");
            return;
        }

        setProcessingState(ProcessingState.PROCESSING);
        setErrorMessage(null);
        setResults(null);
        setEmailCopied(null);
        setSaveStatus('idle');
        setManualAuditIssues([]);
        setShowManualAuditModal(false);
        setIsEditing(false);
        setOcrStatus('');
        setShowApprovedClaimantModal(false);
        setApprovedClaimantEmailContent('');
        setApprovedClaimantCopied(false);

        try {
            setOcrStatus('Processing...');

            const liquidationScope = requestMode === 'group'
                ? groupPendingThisWeek.map((item) => ({
                    id: item.id,
                    staffName: item.staffName,
                    amount: item.amount,
                    date: item.date
                }))
                : dbOutstandingLiquidations;

            const options: ModeLogic.ModeOptions = {
                formText: reimbursementFormText.trim(),
                receiptText: receiptDetailsText.trim(),
                historyData,
                outstandingLiquidations: liquidationScope
            };

            let result: ModeLogic.ProcessingResult & { errorMessage?: string, issues?: any[] };

            if (requestMode === 'manual') {
                result = ModeLogic.processManualMode(options);
            } else if (requestMode === 'group') {
                result = ModeLogic.processGroupMode(options);
            } else {
                result = ModeLogic.processSoloMode(options);
            }

            if (result.errorMessage) {
                setErrorMessage(result.errorMessage);
                setProcessingState(ProcessingState.IDLE);
                return;
            }

            // For Solo Mode specific issues and rules blocking
            if (requestMode === 'solo' && result.issues) {
                const issues = result.issues;
                if (issues.length > 0 && !bypassManualAuditRef.current) {
                    const blockingIssues = issues.filter((issue) => issue.level === 'error');
                    if (blockingIssues.length > 0) {
                        setErrorMessage(blockingIssues.map((issue) => issue.message).join(' | '));
                        showWarningToast('Manual validation found blocking errors.');
                        setProcessingState(ProcessingState.IDLE);
                        setOcrStatus('Needs review');
                        return;
                    }
                    setManualAuditIssues(issues.filter(i => i.level !== 'error'));
                }
            }
            bypassManualAuditRef.current = false;

            setResults({
                phase1: result.phase1,
                phase2: result.phase2,
                phase3: result.phase3,
                phase4: result.phase4
            });

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
                const mismatchFormTotalMatch = content.match(/Reimbursement\s*form\s*total\s*is\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
                const mismatchReceiptTotalMatch = content.match(/Receipt\s*total\s*is\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
                const mismatchFormTotal = mismatchFormTotalMatch ? Number(mismatchFormTotalMatch[1].replace(/,/g, '')) : null;
                const mismatchReceiptTotal = mismatchReceiptTotalMatch ? Number(mismatchReceiptTotalMatch[1].replace(/,/g, '')) : null;

                if (mismatchFormTotal !== null && mismatchReceiptTotal !== null && mismatchFormTotal > mismatchReceiptTotal + 0.01) {
                    discrepancyReason = 'For revision mismatch reimbursement form total is higher than receipt total';
                }

                const formAmountMatch = content.match(/Amount on Form:\s*\$([0-9,.]+)/);
                const receiptAmountMatch = content.match(/Actual Receipt Total:\s*\$([0-9,.]+)/);
                if (!discrepancyReason && formAmountMatch && receiptAmountMatch) {
                    discrepancyReason = `Mismatch: Form $${formAmountMatch[1]} / Rcpt $${receiptAmountMatch[1]}`;
                } else if (!discrepancyReason) {
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
                amount: String(r.amount || '0.00').replace('(Based on Receipts/Form Audit)', '').replace(/\*/g, '').trim()
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
                if (/for revision mismatch reimbursement form total is higher than receipt total/i.test(reason)) {
                    status = 'For revision mismatch reimbursement form total is higher than receipt total';
                } else if (reason && reason !== 'Discrepancy / Pending') {
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
    const specialProcessedRecords = useMemo<any[]>(() => processRecords(specialInstructionLogs), [specialInstructionLogs]);
    const logEligibleRecords = useMemo<any[]>(() => [...allProcessedRecords, ...specialProcessedRecords], [allProcessedRecords, specialProcessedRecords]);

    const todaysProcessedRecords = useMemo<any[]>(() => {
        const now = new Date(nowTick);
        return logEligibleRecords
            .filter(r => isWithinWeekdayResetWindow(r.created_at, now))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }, [logEligibleRecords, nowTick]);

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
                    totalAmount: Number(record.amount || 0),
                    latestDate: currentDate,
                    oldestAgeDays: record.pendingAgeDays || 0
                });
                return;
            }

            const existing = grouped.get(key)!;
            existing.records.push(record);
            existing.count += 1;
            existing.totalAmount += Number(record.amount || 0);
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
        if (requestMode === 'manual') {

            return <><CloudUpload size={12} strokeWidth={2.5} /> Save to NAB/EOD</>;
        }
        if (results?.phase4.toLowerCase().includes('discrepancy')) {
            return <><CloudUpload size={12} strokeWidth={2.5} /> Save Record</>;
        }
        return <><CloudUpload size={12} strokeWidth={2.5} /> Save & Pay</>;
    };

    const duplicateMatchesForModal = useMemo<DuplicateMatchEvidence[]>(() => {
        const matches = saveModalDecision?.mode === 'red'
            ? duplicateCheckResult.redMatches
            : saveModalDecision?.mode === 'yellow'
                ? duplicateCheckResult.yellowMatches
                : [];

        const unique = new Map<string, DuplicateMatchEvidence>();
        matches.forEach((match) => {
            const dedupeKey = [
                normalizeTextKey(match.historyStoreName),
                normalizeTextKey(match.historyProduct),
                match.historyDateKey,
                match.historyTotalAmount,
                match.historyNabCode
            ].join('|');
            if (!unique.has(dedupeKey)) {
                unique.set(dedupeKey, match);
            }
        });
        return Array.from(unique.values()).slice(0, 6);
    }, [saveModalDecision, duplicateCheckResult]);

    const duplicateNabCodesForModal = useMemo<string[]>(() => {
        const codes = duplicateMatchesForModal
            .map(match => String(match.historyNabCode || '').trim())
            .filter(code => isValidNabReference(code));
        return Array.from(new Set(codes.map(code => code.toUpperCase())));
    }, [duplicateMatchesForModal]);

    const claimantBaseEmailContent = useMemo(() => {
        const source = isEditing ? editableContent : (results?.phase4 || '');
        if (!source) return '';
        const withoutUidMeta = stripUidFallbackMeta(source);
        return stripInternalAuditMeta(stripClaimantRevisionSection(stripJulianApprovalSection(withoutUidMeta)));
    }, [isEditing, editableContent, results?.phase4]);

    const claimantEmailContent = useMemo(() => {
        if (!claimantBaseEmailContent) return '';
        return formVsReceiptTotals.isFormHigherMismatch
            ? stripInternalAuditMeta(upsertClaimantRevisionSection(claimantBaseEmailContent))
            : stripInternalAuditMeta(stripClaimantRevisionSection(claimantBaseEmailContent));
    }, [claimantBaseEmailContent, formVsReceiptTotals.isFormHigherMismatch]);

    const julianApprovalContext = useMemo(() => ({
        approvalReason: isOver30DaysApprovalRequired
            ? 'Receipt is older than 30 days from purchase date'
            : 'Total reimbursement amount is at or above $300',
        fraudReceiptStatus: duplicateCheckResult.signal === 'red'
            ? `Matched exact fraud duplicate (${duplicateCheckResult.redMatches.length})`
            : duplicateCheckResult.signal === 'yellow'
                ? `Matched near fraud duplicate (${duplicateCheckResult.yellowMatches.length})`
                : 'Not matched in duplicate history'
    }), [isOver30DaysApprovalRequired, duplicateCheckResult]);

    const julianEmailContent = useMemo(() => {
        if (!claimantBaseEmailContent) return '';
        return stripInternalAuditMeta(upsertJulianApprovalSection(claimantBaseEmailContent, { ...julianApprovalContext, onlyBlock: true }));
    }, [claimantBaseEmailContent, julianApprovalContext]);

    const displayEmailContent = useMemo(() => {
        if (formVsReceiptTotals.isFormHigherMismatch) return claimantEmailContent;
        if (isJulianApprovalRequired) {
            return julianEmailContent + "\n\n" + claimantEmailContent;
        }
        return claimantEmailContent;
    }, [formVsReceiptTotals.isFormHigherMismatch, isJulianApprovalRequired, julianEmailContent, claimantEmailContent]);

    const fraudExactMatchesForRulesCard = useMemo<DuplicateMatchEvidence[]>(() => {
        const unique = new Map<string, DuplicateMatchEvidence>();
        duplicateCheckResult.redMatches.forEach((match) => {
            const dedupeKey = [
                normalizeTextKey(match.historyStoreName),
                normalizeTextKey(match.historyProduct),
                normalizeTextKey(match.historyProcessedAt),
                match.historyTotalAmount,
                normalizeReferenceKey(match.historyNabCode)
            ].join('|');
            if (!unique.has(dedupeKey)) {
                unique.set(dedupeKey, match);
            }
        });
        return Array.from(unique.values()).slice(0, 5);
    }, [duplicateCheckResult.redMatches]);

    const hasRuleInput = Boolean(reimbursementFormText.trim() || receiptDetailsText.trim());

    const handleCopyDuplicateNabCodes = () => {
        if (duplicateNabCodesForModal.length === 0) return;
        handleCopyField(duplicateNabCodesForModal.join('\n'), 'dup-nab-all');
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
            {saveToast.visible && (
                <div className="fixed top-5 right-5 z-[70] w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-emerald-300/35 bg-[#11161f]/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(16,185,129,0.25)] animate-in fade-in slide-in-from-top-3 duration-200">
                    <div className="px-4 py-3 border-b border-emerald-300/20 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.16em] font-bold text-emerald-300">Saved to Database</p>
                        {saveToast.recordCount > 1 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-300/35 bg-emerald-500/15 text-emerald-200 font-semibold">
                                {saveToast.recordCount} records
                            </span>
                        )}
                    </div>
                    <div className="px-4 py-3 space-y-1.5 text-sm">
                        <p className="text-slate-300">NAB Code: <span className="text-white font-semibold">{saveToast.nabCode}</span></p>
                        <p className="text-slate-300">Amount: <span className="text-white font-semibold">${saveToast.amount}</span></p>
                    </div>
                </div>
            )}
            {warningToast.visible && (
                <div className="fixed top-5 right-5 z-[71] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-300/40 bg-[#1a1410]/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(251,191,36,0.22)] animate-in fade-in slide-in-from-top-3 duration-200">
                    <div className="px-4 py-3 border-b border-amber-300/20 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.16em] font-bold text-amber-200">Warning</p>
                        <AlertCircle size={14} className="text-amber-300" />
                    </div>
                    <div className="px-4 py-3 space-y-1.5 text-sm">
                        <p className="text-slate-200">{warningToast.message}</p>
                        <p className="text-[11px] text-amber-200/90">Check Rules Status for more details.</p>
                    </div>
                </div>
            )}
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
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Location</label>
                                            {isRowEditMode ? (
                                                <input
                                                    type="text"
                                                    value={editedRowData?.youngPersonName || ''}
                                                    onChange={(e) => setEditedRowData({ ...editedRowData, youngPersonName: e.target.value })}
                                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                                />
                                            ) : (
                                                <p className="text-slate-300 text-sm">{selectedRow.youngPersonName}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Client</label>
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
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Location</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Client</th>

                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Staff Name</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Type of expense</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Product</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[100px]">Receipt Date</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[100px]">Amount</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[120px]">Date Processed</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {filteredDatabaseRows.map((row, index) => {
                                                    const isPending = String(row.nabCode || '').trim().toUpperCase() === 'PENDING';
                                                    return (
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
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{isPending ? '-' : row.timestamp}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs font-bold text-amber-400">{row.nabCode}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right text-xs font-bold text-slate-200 bg-white/5">{row.totalAmount}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 truncate max-w-[250px]" title={row.youngPersonName}>{row.youngPersonName}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.ypName}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 uppercase font-semibold">{row.staffName}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{isPending ? '-' : row.expenseType}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 truncate max-w-[200px]" title={row.product}>{isPending ? '-' : row.product}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{isPending ? '-' : row.receiptDate}</td>
                                                            <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right text-xs text-slate-200">{isPending ? '-' : row.amount}</td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-200">{isPending ? '-' : row.dateProcessed}</td>
                                                        </tr>
                                                    );
                                                })}

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
                                <ModeTabs
                                    currentMode={requestMode}
                                    onModeChange={(mode) => {
                                        if (mode !== requestMode) {
                                            resetAll();
                                            setRequestMode(mode);
                                        }
                                    }}
                                />

                                {requestMode === 'solo' && (
                                    <SoloMode
                                        reimbursementFormText={reimbursementFormText}
                                        setReimbursementFormText={setReimbursementFormText}
                                        receiptDetailsText={receiptDetailsText}
                                        setReceiptDetailsText={setReceiptDetailsText}
                                        handleProcess={handleProcess}
                                        processingState={processingState}
                                        errorMessage={errorMessage}
                                        results={results}
                                        resetAll={resetAll}
                                        reimbursementFormRef={reimbursementFormRef}
                                    />
                                )}

                                {requestMode === 'group' && (
                                    <GroupMode
                                        reimbursementFormText={reimbursementFormText}
                                        setReimbursementFormText={setReimbursementFormText}
                                        handleProcess={handleProcess}
                                        processingState={processingState}
                                        errorMessage={errorMessage}
                                        results={results}
                                        resetAll={resetAll}
                                        reimbursementFormRef={reimbursementFormRef}
                                    />
                                )}

                                {requestMode === 'manual' && (
                                    <ManualMode
                                        handleProcess={handleProcess}
                                        processingState={processingState}
                                        errorMessage={errorMessage}
                                        results={results}
                                        resetAll={resetAll}
                                    />
                                )}

                                {hasRuleInput && (
                                    <div className="bg-[#1c1e24]/60 backdrop-blur-md rounded-[32px] border border-white/5 shadow-lg p-6 relative">
                                        <h3 className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest pl-1">Rules Status</h3>
                                        <div className="space-y-3 pl-1">
                                            {rulesStatusItems.map((rule) => {
                                                const isBlocked = rule.status === 'blocked';
                                                const isWarning = rule.status === 'warning';
                                                const isExactFraudBlocked = rule.id === 'r1' && isBlocked;
                                                const evidenceRows = isExactFraudBlocked ? fraudExactMatchesForRulesCard : [];
                                                const badgeClass = isBlocked
                                                    ? 'bg-red-500/15 text-red-300 border-red-500/30'
                                                    : isWarning
                                                        ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                                                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';

                                                return (
                                                    <div
                                                        key={rule.id}
                                                        className={isExactFraudBlocked
                                                            ? 'rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2.5 shadow-[0_0_28px_rgba(248,113,113,0.28)] fraud-rule-breathe'
                                                            : 'rounded-xl border border-white/10 bg-black/20 px-3 py-2.5'}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            {isBlocked ? (
                                                                <AlertCircle size={15} className={isExactFraudBlocked ? 'text-red-200 mt-0.5 fraud-rule-breathe-soft' : 'text-red-400 mt-0.5'} />
                                                            ) : isWarning ? (
                                                                <AlertCircle size={15} className="text-amber-400 mt-0.5" />
                                                            ) : (
                                                                <CheckCircle size={15} className="text-emerald-400 mt-0.5" />
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="text-xs font-semibold text-white uppercase tracking-wide">{rule.title}</p>
                                                                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${badgeClass} ${isExactFraudBlocked ? 'fraud-rule-breathe-soft' : ''}`}>{rule.status}</span>
                                                                </div>
                                                                <p className="text-xs text-slate-400 mt-1">{rule.detail}</p>
                                                                {isExactFraudBlocked && evidenceRows.length > 0 && (
                                                                    <div className="mt-2 space-y-1.5">
                                                                        {evidenceRows.map((match, idx) => (
                                                                            <div key={`${match.historyNabCode}-${match.historyProcessedAt}-${idx}`} className="rounded-md border border-red-300/20 bg-black/25 px-2 py-1.5">
                                                                                <div className="flex items-start justify-between gap-2">
                                                                                    <p className="text-[11px] text-slate-200"><span className="text-slate-400">NAB:</span> {match.historyNabCode || '-'}</p>
                                                                                    <button
                                                                                        onClick={() => handleCopyField(`NAB: ${match.historyNabCode || '-'}\nProcessed: ${match.historyProcessedAt || '-'}\nAmount: $${match.historyTotalAmount || '0.00'}`, `fraud-evidence-${idx}`)}
                                                                                        className="px-1.5 py-0.5 rounded border border-white/15 bg-black/30 hover:bg-white/10 text-[10px] text-white flex items-center gap-1"
                                                                                    >
                                                                                        {copiedField === `fraud-evidence-${idx}` ? <Check size={10} /> : <Copy size={10} />}
                                                                                        {copiedField === `fraud-evidence-${idx}` ? 'Copied' : 'Copy'}
                                                                                    </button>
                                                                                </div>
                                                                                <p className="text-[11px] text-slate-200"><span className="text-slate-400">Processed:</span> {match.historyProcessedAt || '-'}</p>
                                                                                <p className="text-[11px] text-slate-200"><span className="text-slate-400">Amount:</span> ${match.historyTotalAmount || '0.00'}</p>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
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
                                )}

                                {requestMode === 'solo' && (
                                    <LiquidationTracker
                                        items={dbOutstandingLiquidations}
                                        onSettle={handleSettleLiquidation}
                                        isSettling={isSettlingLiquidation}
                                    />
                                )}

                                {requestMode === 'group' && (
                                    <div className="bg-[#1c1e24]/60 backdrop-blur-md rounded-[32px] border border-white/5 shadow-lg overflow-hidden flex flex-col">
                                        <div className="px-6 py-4 border-b border-white/5 bg-indigo-500/10 flex items-center justify-between">
                                            <p className="text-xs font-bold uppercase tracking-widest text-indigo-200">Group Liquidation Monitor</p>
                                            <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                                                {groupPendingThisWeek.length} This Week Pending
                                            </span>
                                        </div>

                                        {groupPendingLiquidations.length === 0 ? (
                                            <div className="p-6 text-center text-slate-400 text-sm">No pending group liquidations.</div>
                                        ) : (
                                            <div className="max-h-[320px] overflow-auto custom-scrollbar">
                                                <div className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-wider text-amber-300 font-bold">This Week Pending</div>
                                                <table className="w-full text-xs">
                                                    <thead className="sticky top-0 bg-[#161922] text-slate-400 uppercase tracking-wider z-10">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left">Staff Name</th>
                                                            <th className="px-3 py-2 text-left">YP Name</th>
                                                            <th className="px-3 py-2 text-left">Location</th>
                                                            <th className="px-3 py-2 text-right">Amount</th>
                                                            <th className="px-3 py-2 text-right">Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {groupPendingThisWeek.length === 0 && (
                                                            <tr className="border-t border-white/5">
                                                                <td className="px-3 py-3 text-slate-500" colSpan={5}>No pending rows for this week.</td>
                                                            </tr>
                                                        )}
                                                        {groupPendingThisWeek.map((item) => (
                                                            <tr key={item.id} className="border-t border-white/5">
                                                                <td className="px-3 py-2 text-white whitespace-nowrap">{item.staffName}</td>
                                                                <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{item.ypName}</td>
                                                                <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{item.location}</td>
                                                                <td className="px-3 py-2 text-emerald-300 font-semibold text-right whitespace-nowrap">${item.amount}</td>
                                                                <td className="px-3 py-2 text-right">
                                                                    <button
                                                                        onClick={() => handleSettleGroupLiquidation(item.id)}
                                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white hover:bg-emerald-400 transition-colors"
                                                                    >
                                                                        Settle
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                {groupPendingPreviousWeeks.length > 0 && (
                                                    <>
                                                        <div className="px-4 pt-4 pb-2 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-t border-white/5">Previous Weeks (Non-blocking)</div>
                                                        <table className="w-full text-xs">
                                                            <tbody>
                                                                {groupPendingPreviousWeeks.map((item) => (
                                                                    <tr key={item.id} className="border-t border-white/5 opacity-75">
                                                                        <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{item.staffName}</td>
                                                                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.ypName}</td>
                                                                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.location}</td>
                                                                        <td className="px-3 py-2 text-slate-300 text-right whitespace-nowrap">${item.amount}</td>
                                                                        <td className="px-3 py-2 text-right">
                                                                            <button
                                                                                onClick={() => handleSettleGroupLiquidation(item.id)}
                                                                                className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                                                                            >
                                                                                Remove
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        <div className="px-4 py-3 border-t border-white/5 bg-indigo-500/5 text-[10px] text-slate-400 text-center">
                                            Only this week pending rows are used for group request exclusion and budget allocation checks.
                                        </div>
                                    </div>
                                )}
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
                                {(results || requestMode === 'manual') && (
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
                                                        onClick={handleAddBankingDetail}
                                                        className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 hover:scale-105 transition-all"
                                                        title="Add Banking Detail"
                                                    >
                                                        <Plus size={12} strokeWidth={3} /> Add Box
                                                    </button>
                                                    <button
                                                        onClick={saveStatus === 'success' ? handleStartNewAudit : (requestMode === 'manual' ? handleSaveSpecialInstruction : handleSmartSave)}


                                                        disabled={isSaving || isEditing}
                                                        className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${saveStatus === 'success' ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : saveStatus === 'error' || saveStatus === 'duplicate' ? 'bg-red-500 text-white shadow-red-500/20' : isEditing ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed' : 'bg-slate-700 text-white hover:bg-slate-600 shadow-slate-900/20'}`}
                                                    >
                                                        {getSaveButtonText()}
                                                    </button>
                                                    {requestMode === 'solo' && (
                                                        <button onClick={() => handleCopyEmail('julian')} disabled={isEditing || !isJulianApprovalRequired} className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${emailCopied === 'julian' ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : isEditing || !isJulianApprovalRequired ? 'bg-indigo-500/50 text-white/50 cursor-not-allowed' : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:bg-indigo-600 hover:scale-105 active:scale-95'}`}>
                                                            {emailCopied === 'julian' ? (<><Check size={12} strokeWidth={3} /> Copied Julian</>) : (<><Copy size={12} strokeWidth={3} /> Copy to Julian</>)}
                                                        </button>
                                                    )}

                                                    <button onClick={() => handleCopyEmail('claimant')} disabled={isEditing} className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${emailCopied === 'claimant' ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : isEditing ? 'bg-indigo-500/50 text-white/50 cursor-not-allowed' : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:bg-indigo-600 hover:scale-105 active:scale-95'}`}>
                                                        {emailCopied === 'claimant' ? (<><Check size={12} strokeWidth={3} /> Copied Claimant</>) : (<><Copy size={12} strokeWidth={3} /> Copy to Claimant</>)}
                                                    </button>
                                                </div>
                                            </div>

                                            {parsedTransactions.length > 0 && parsedTransactions.map((tx, idx) => {
                                                const txKey = tx.index;
                                                const selectedEmployee = selectedEmployees.get(txKey);
                                                const searchQuery = employeeSearchQuery.get(txKey) || tx.formattedName;
                                                const showDropdown = showEmployeeDropdown.get(txKey) || false;
                                                const filteredEmployees = getFilteredEmployees(searchQuery);
                                                const amountOptionsRaw = Array.from(new Set(parsedTransactions.map((entry) => entry.amount.replace(/[^0-9.\-]/g, '')).filter(Boolean)));
                                                const selectedAmount = amountSelectionByTx.get(txKey) || tx.amount.replace(/[^0-9.\-]/g, '') || '0.00';
                                                const amountOptions = amountOptionsRaw.length > 0 ? amountOptionsRaw : [selectedAmount];

                                                return (
                                                    <div key={idx} className="mx-8 mt-6 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden group">
                                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                                            <CreditCard size={80} className="text-white" />
                                                        </div>
                                                        <div className="relative z-10">
                                                            <div className="flex justify-between items-center mb-4">
                                                                <h4 className="text-sm font-bold text-indigo-200 uppercase tracking-widest flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                                                                    Banking Details ({idx + 1}/{parsedTransactions.length})
                                                                </h4>
                                                                {parsedTransactions.length > 1 && (
                                                                    <button
                                                                        onClick={() => handleRemoveBankingDetail(txKey)}
                                                                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                                                                        title="Remove this box"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                {/* Payee Name with Searchable Dropdown */}
                                                                <div className="bg-black/30 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-colors relative">
                                                                    <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Payee Name</p>
                                                                    <div className="flex justify-between items-center">
                                                                        <div className="flex-1 relative">
                                                                            <input
                                                                                type="text"
                                                                                value={searchQuery}
                                                                                onChange={(e) => handleEmployeeSearchChange(txKey, e.target.value)}
                                                                                onFocus={() => handleEmployeeSearchFocus(txKey)}
                                                                                onBlur={() => handleEmployeeSearchBlur(txKey)}
                                                                                className="w-full bg-transparent text-white font-semibold uppercase border-none outline-none placeholder:text-slate-600"
                                                                                placeholder="Search employee..."
                                                                            />
                                                                            {/* Dropdown */}
                                                                            {showDropdown && filteredEmployees.length > 0 && (
                                                                                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1c1e24] border border-white/10 rounded-lg shadow-xl max-h-40 overflow-y-auto z-50">
                                                                                    {filteredEmployees.map((emp) => (
                                                                                        <button
                                                                                            key={emp.id}
                                                                                            onClick={() => handleEmployeeSelect(txKey, emp)}
                                                                                            className="w-full text-left px-3 py-2 hover:bg-white/10 text-white text-sm uppercase transition-colors"
                                                                                        >
                                                                                            {getEmployeeDisplayName(emp)}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <button onClick={() => handleCopyField(searchQuery, 'name')} className="text-indigo-400 hover:text-white transition-colors ml-2">
                                                                            {copiedField === 'name' ? <Check size={14} /> : <Copy size={14} />}
                                                                        </button>
                                                                    </div>
                                                                    {selectedEmployee && normalizeEmployeeName(searchQuery) !== normalizeEmployeeName(selectedEmployee.fullName) && (
                                                                        <button
                                                                            onClick={() => createAliasFromQuery(txKey)}
                                                                            className="mt-2 text-[10px] uppercase tracking-wider text-indigo-300 hover:text-indigo-100"
                                                                        >
                                                                            Save typed name as alias
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="bg-black/30 rounded-xl p-3 border border-white/5 hover:border-emerald-500/30 transition-colors">
                                                                    <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Amount</p>
                                                                    <div className="flex justify-between items-center">
                                                                        <input
                                                                            type="text"
                                                                            value={selectedAmount}
                                                                            onChange={(e) => handleTransactionAmountChange(txKey, e.target.value)}
                                                                            placeholder="0.00"
                                                                            className="w-full bg-transparent text-emerald-400 font-bold text-lg border-none outline-none"
                                                                        />
                                                                        <button onClick={() => handleCopyField(selectedAmount, `amount-${txKey}`)} className="text-emerald-500 hover:text-white transition-colors ml-2">
                                                                            {copiedField === `amount-${txKey}` ? <Check size={14} /> : <Copy size={14} />}
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
                                                                            onClick={() => selectedEmployee?.bsb && handleCopyField(selectedEmployee.bsb, `bsb-${txKey}`)}
                                                                            className="text-slate-500 hover:text-white transition-colors"
                                                                            disabled={!selectedEmployee?.bsb}
                                                                        >
                                                                            {copiedField === `bsb-${txKey}` ? <Check size={12} /> : <Copy size={12} />}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Account #</p>
                                                                    <div className="flex justify-between items-center">
                                                                        <p className="text-slate-300 font-mono">{selectedEmployee?.account || '---'}</p>
                                                                        <button
                                                                            onClick={() => selectedEmployee?.account && handleCopyField(selectedEmployee.account, `account-${txKey}`)}
                                                                            className="text-slate-500 hover:text-white transition-colors"
                                                                            disabled={!selectedEmployee?.account}
                                                                        >
                                                                            {copiedField === `account-${txKey}` ? <Check size={12} /> : <Copy size={12} />}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="mt-4 bg-black/20 rounded-xl p-3 border border-indigo-500/25">
                                                                <p className="text-[10px] uppercase text-indigo-300 font-bold mb-1">NAB Code</p>
                                                                <input
                                                                    type="text"
                                                                    value={tx.currentNabRef || ''}
                                                                    onChange={(e) => handleTransactionNabChange(txKey, e.target.value)}
                                                                    placeholder="Enter NAB Code"
                                                                    className="w-full bg-transparent border-none outline-none text-sm font-mono text-indigo-100 placeholder:text-indigo-300/60"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
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
                                                        <>
                                                            <MarkdownRenderer
                                                                content={displayEmailContent}
                                                                id="email-output-content"
                                                                theme="dark"
                                                            />
                                                            <div className="hidden">
                                                                <MarkdownRenderer
                                                                    content={julianEmailContent}
                                                                    id="email-copy-julian"
                                                                    theme="light"
                                                                />
                                                                <MarkdownRenderer
                                                                    content={claimantEmailContent}
                                                                    id="email-copy-claimant"
                                                                    theme="light"
                                                                />
                                                            </div>
                                                        </>
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
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-semibold text-white uppercase">{group.staffName}</p>
                                                        <span className="text-sm font-bold text-emerald-400">(${group.totalAmount.toFixed(2)})</span>
                                                    </div>
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
                                    <div>
                                        <h2 className="text-xl font-semibold text-white">NAB Banking Log (Current Cycle)</h2>
                                        <p className="text-[11px] text-slate-400">Auto-clears every weekday at 6:00 AM.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleCopyTable('nab-log-table', 'nab')} className={`px-4 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${reportCopied === 'nab' ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                                        {reportCopied === 'nab' ? <Check size={16} /> : <Copy size={16} />}
                                        {reportCopied === 'nab' ? 'Copied Table!' : 'Copy for Outlook'}
                                    </button>
                                    <button onClick={handleRefreshCycleView} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Refresh current cycle">
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
                                                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>No banking records in the current cycle.</td>
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
                                    <div>
                                        <h2 className="text-xl font-semibold text-white">End of Day Schedule</h2>
                                        <p className="text-[11px] text-slate-400">Cycle resets every weekday at 6:00 AM.</p>
                                    </div>
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
                                    <button onClick={handleRefreshCycleView} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Refresh current cycle">
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
                                                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No activity recorded in the current cycle.</td></tr>
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
                                            <p className="text-sm text-slate-400">Upload a new CSV to replace active staff list. Missing accounts go to approval queue, not auto-delete.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <input
                                                ref={employeeCsvInputRef}
                                                type="file"
                                                accept=".csv,text/csv,.txt"
                                                onChange={handleCsvFileChange}
                                                className="hidden"
                                            />
                                            <button
                                                onClick={handleCsvUploadClick}
                                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                                            >
                                                <Upload size={14} />
                                                Upload .CSV for Update
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (window.confirm('Reset to default list?')) {
                                                        setEmployeeRawText(DEFAULT_EMPLOYEE_DATA);
                                                        setEmployeeList(parseEmployeeData(DEFAULT_EMPLOYEE_DATA));
                                                        persistPendingDeactivationEmployees([]);
                                                        setCsvImportMessage('Employee list reset to defaults.');
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
                                    {csvImportMessage && (
                                        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-3 py-2">
                                            {csvImportMessage}
                                        </div>
                                    )}
                                    <div className="bg-black/30 rounded-xl border border-white/10 p-1">
                                        <textarea
                                            value={employeeRawText}
                                            onChange={(e) => setEmployeeRawText(e.target.value)}
                                            className="w-full h-64 bg-transparent border-none text-slate-300 font-mono text-xs p-4 focus:ring-0 resize-y"
                                            spellCheck={false}
                                        />
                                    </div>

                                    <div className="bg-black/20 rounded-xl border border-amber-400/20 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs uppercase tracking-wider text-amber-200 font-bold">For Approval to Deactivate</p>
                                            <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-100">
                                                {pendingDeactivationEmployees.length} account(s)
                                            </span>
                                        </div>
                                        {pendingDeactivationEmployees.length === 0 ? (
                                            <p className="text-xs text-slate-500">No pending deactivation requests.</p>
                                        ) : (
                                            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                                                {pendingDeactivationEmployees.map((employee) => (
                                                    <div key={`${employee.account}-${employee.id}`} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 rounded-lg bg-black/25 border border-white/10">
                                                        <div>
                                                            <p className="text-sm text-white font-semibold uppercase">{getEmployeeDisplayName(employee)}</p>
                                                            <p className="text-xs text-slate-400">BSB: {employee.bsb} | Account: {employee.account}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleKeepPendingEmployee(employee.account)}
                                                                className="px-3 py-1.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-[10px] font-bold uppercase tracking-wider"
                                                            >
                                                                Keep Active
                                                            </button>
                                                            <button
                                                                onClick={() => handleApproveDeactivateEmployee(employee.account)}
                                                                className="px-3 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-200 text-[10px] font-bold uppercase tracking-wider"
                                                            >
                                                                Approve Deactivate
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
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
                            <div className={`bg-[#1c1e24] w-full max-w-xl rounded-[24px] border shadow-2xl overflow-hidden ${saveModalDecision?.mode === 'red' && isRedPopupAlertActive ? 'border-red-400/70 animate-pulse shadow-[0_0_45px_rgba(248,113,113,0.45)]' : 'border-white/10'}`}>
                                <div className={`px-6 py-5 border-b border-white/10 flex items-center gap-3 ${saveModalDecision?.mode === 'red' ? (isRedPopupAlertActive ? 'bg-red-500/30 animate-pulse' : 'bg-red-500/10') : saveModalDecision?.mode === 'yellow' ? 'bg-amber-500/10' : 'bg-white/5'}`}>
                                    {saveModalDecision?.mode === 'red' ? (
                                        <AlertCircle className={`${isRedPopupAlertActive ? 'text-red-100 animate-pulse drop-shadow-[0_0_10px_rgba(248,113,113,0.9)]' : 'text-red-300'}`} size={20} />
                                    ) : saveModalDecision?.mode === 'yellow' ? (
                                        <AlertCircle className="text-amber-300" size={20} />
                                    ) : (
                                        <HelpCircle className="text-indigo-300" size={20} />
                                    )}
                                    <div>
                                        <h3 className={`text-white font-bold ${saveModalDecision?.mode === 'red' && isRedPopupAlertActive ? 'tracking-wide' : ''}`}>
                                            {saveModalDecision?.mode === 'red' && 'Possible Fraud Duplicate'}
                                            {saveModalDecision?.mode === 'yellow' && isJulianApprovalDetail(saveModalDecision?.detail) && 'Pending - Subject to Julian Approval'}
                                            {saveModalDecision?.mode === 'yellow' && isFormHigherMismatchDetail(saveModalDecision?.detail) && 'Reject and Request Revision'}
                                            {saveModalDecision?.mode === 'yellow' && !isJulianApprovalDetail(saveModalDecision?.detail) && !isFormHigherMismatchDetail(saveModalDecision?.detail) && 'Potential Duplicate Needs Review'}
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
                                                    : isJulianApprovalDetail(saveModalDecision?.detail)
                                                        ? 'This can proceed only as Pending and will be routed for Julian approval.'
                                                        : isFormHigherMismatchDetail(saveModalDecision?.detail)
                                                            ? 'This is rejected for payment because reimbursement form total is higher than receipt total. Save as Pending to send claimant revision email.'
                                                            : 'This can proceed only as Pending. Reviewer reason is required for audit trail.'}
                                            </p>
                                            {(saveModalDecision.mode === 'red' || (saveModalDecision.mode === 'yellow' && !isJulianApprovalDetail(saveModalDecision?.detail) && !isFormHigherMismatchDetail(saveModalDecision?.detail))) && (
                                                <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-3 space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs font-semibold text-red-200 uppercase tracking-wider">Matched NAB Code(s)</p>
                                                        {duplicateNabCodesForModal.length > 1 && (
                                                            <button
                                                                onClick={handleCopyDuplicateNabCodes}
                                                                className="text-[11px] px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center gap-1"
                                                            >
                                                                {copiedField === 'dup-nab-all' ? <Check size={12} /> : <Copy size={12} />}
                                                                Copy All
                                                            </button>
                                                        )}
                                                    </div>
                                                    {duplicateNabCodesForModal.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            {duplicateNabCodesForModal.map((code, idx) => (
                                                                <button
                                                                    key={`${code}-${idx}`}
                                                                    onClick={() => handleCopyField(code, `dup-nab-${idx}`)}
                                                                    className="px-2 py-1 rounded-md border border-white/15 bg-black/30 text-xs text-white font-mono hover:bg-white/10 flex items-center gap-1"
                                                                >
                                                                    <span>{code}</span>
                                                                    {copiedField === `dup-nab-${idx}` ? <Check size={12} /> : <Copy size={12} />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-slate-300">No valid NAB code found on matched history.</p>
                                                    )}
                                                </div>
                                            )}
                                            {duplicateMatchesForModal.length > 0 && (
                                                <div className="space-y-2">
                                                    {duplicateMatchesForModal.map((match, idx) => (
                                                        <div key={`${match.historyDateKey}-${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-300">
                                                            <p><span className="text-slate-400">Store:</span> <span className="text-white">{match.historyStoreName}</span></p>
                                                            <p><span className="text-slate-400">Product:</span> <span className="text-white">{match.historyProduct}</span></p>
                                                            <p><span className="text-slate-400">Date & Time (Optional):</span> <span className="text-white">{match.historyDateTime}</span></p>
                                                            <p><span className="text-slate-400">Date Match:</span> <span className="text-white">{(match.txDateKey !== '-' && match.historyDateKey !== '-') ? (match.txDateKey === match.historyDateKey ? 'Yes' : 'No (optional)') : 'Not provided'}</span></p>
                                                            <p><span className="text-slate-400">Total Amount:</span> <span className="text-white">${match.historyTotalAmount}</span></p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">
                                                    {(isJulianApprovalDetail(saveModalDecision?.detail) || isFormHigherMismatchDetail(saveModalDecision?.detail)) ? 'Reviewer reason (optional)' : 'Reviewer reason (required)'}
                                                </label>
                                                <textarea
                                                    value={reviewerOverrideReason}
                                                    onChange={(e) => setReviewerOverrideReason(e.target.value)}
                                                    rows={3}
                                                    placeholder={(isJulianApprovalDetail(saveModalDecision?.detail) || isFormHigherMismatchDetail(saveModalDecision?.detail))
                                                        ? (isFormHigherMismatchDetail(saveModalDecision?.detail)
                                                            ? 'Optional note for claimant revision request'
                                                            : 'Optional note for Julian approval routing')
                                                        : 'Explain why this should be saved as pending'}
                                                    className="w-full bg-black/20 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-400/70 resize-none"
                                                />
                                            </div>
                                        </>
                                    )}
                                    {saveModalDecision?.mode === 'nab' && (
                                        <div className="space-y-2">
                                            <label className="text-xs text-slate-400 block mb-1">Provide NAB Code (manual)</label>
                                            <input
                                                type="text"
                                                value={manualNabCodeInput}
                                                onChange={(e) => {
                                                    setManualNabCodeInput(e.target.value.toUpperCase());
                                                    if (manualNabCodeError) setManualNabCodeError(null);
                                                }}
                                                placeholder="A1234567890"
                                                className="w-full bg-black/20 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/70 font-mono"
                                            />
                                            <p className="text-[11px] text-slate-400">Required format: 11 characters (1 letter + 10 digits).</p>
                                            {manualNabCodeError && <p className="text-xs text-red-300">{manualNabCodeError}</p>}
                                        </div>
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
                                                duplicateSignal: isFormHigherMismatchDetail(saveModalDecision?.detail) ? 'green' : saveModalDecision.mode,
                                                reviewerReason: reviewerOverrideReason.trim() || (isJulianApprovalDetail(saveModalDecision?.detail)
                                                    ? (isOver30DaysDetail(saveModalDecision?.detail)
                                                        ? 'Auto-routed: receipt is older than 30 days, pending Julian approval.'
                                                        : 'Auto-routed: total reimbursement at or above $300, pending Julian approval.')
                                                    : isFormHigherMismatchDetail(saveModalDecision?.detail)
                                                        ? 'Auto-rejected: reimbursement form total is higher than receipt total. Claimant revision requested.'
                                                        : reviewerOverrideReason),
                                                detail: saveModalDecision.detail
                                            })}
                                            disabled={!isJulianApprovalDetail(saveModalDecision?.detail) && !isFormHigherMismatchDetail(saveModalDecision?.detail) && !reviewerOverrideReason.trim()}
                                            className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isJulianApprovalDetail(saveModalDecision?.detail)
                                                ? 'Save as PENDING (For Julian Approval)'
                                                : isFormHigherMismatchDetail(saveModalDecision?.detail)
                                                    ? 'Reject and Save as PENDING'
                                                    : 'Save as PENDING'}
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
                                                onClick={handleSaveAsPaid}
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

                    {showApprovedClaimantModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-[#1c1e24] w-full max-w-3xl rounded-[24px] border border-white/10 shadow-2xl overflow-hidden">
                                <div className="px-6 py-5 border-b border-white/10 bg-indigo-500/10 flex items-center gap-3">
                                    <CheckCircle className="text-indigo-300" size={20} />
                                    <div>
                                        <h3 className="text-white font-bold">Claimant Letter Ready</h3>
                                        <p className="text-xs text-slate-300">Combined approved entries are ready to copy and send to claimant.</p>
                                    </div>
                                </div>

                                <div className="p-6 max-h-[55vh] overflow-y-auto bg-black/20">
                                    <MarkdownRenderer content={approvedClaimantEmailContent} theme="dark" />
                                    <div className="hidden">
                                        <MarkdownRenderer content={approvedClaimantEmailContent} theme="light" id="approved-claimant-copy-content" />
                                    </div>
                                </div>

                                <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setShowApprovedClaimantModal(false);
                                            setApprovedClaimantCopied(false);
                                        }}
                                        className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        Close
                                    </button>
                                    <button
                                        onClick={handleCopyApprovedClaimantEmail}
                                        disabled={!approvedClaimantEmailContent.trim()}
                                        className="px-4 py-2 rounded-lg bg-indigo-500 text-white font-semibold hover:bg-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {approvedClaimantCopied ? <Check size={14} /> : <Copy size={14} />}
                                        {approvedClaimantCopied ? 'Copied Claimant Letter' : 'Copy to Claimant'}
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

                                        {/* Location */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Location</label>
                                            <input type="text" value={massEditData.youngPersonName} onChange={(e) => setMassEditData({ ...massEditData, youngPersonName: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-700" placeholder="(Keep Original)" />
                                        </div>

                                        {/* Client */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Client</label>
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
