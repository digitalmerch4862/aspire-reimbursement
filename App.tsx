import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Upload, X, FileText, FileSpreadsheet, CheckCircle, Circle, Loader2,
    HelpCircle, AlertCircle, RefreshCw, Send, LayoutDashboard, Edit2, Check,
    Copy, CreditCard, ClipboardList, Calendar, BarChart3, PieChart, TrendingUp,
    Users, Database, Search, Download, Save, CloudUpload, Trash2
} from 'lucide-react';
import FileUpload from './components/FileUpload';
import ProcessingStep from './components/ProcessingStep';
import MarkdownRenderer from './components/MarkdownRenderer';
import Logo from './components/Logo';
import { AIProviderSelector } from './components/AIProviderSelector';
import { analyzeReimbursement } from './services/geminiService';
import type { AIProvider } from './services/aiProviderConfig';
import { aiService } from './services/multiProviderAIService';
import { fileToBase64 } from './utils/fileHelpers';
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

export const App = () => {
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

    // AI Provider State
    const [selectedAIProvider, setSelectedAIProvider] = useState<AIProvider>('gemini');

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
        if (currentNabRef === 'PENDING') currentNabRef = ''; // Clear pending for input value

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

            // Improved Client/Location Extraction
            // 1. Look for specific field
            let ypName = 'N/A';
            const ypMatch = content.match(/\*\*Client \/ Location:\*\*\s*(.*?)(?:\n|$)/);
            if (ypMatch) {
                ypName = ypMatch[1].trim();
            }

            const dateProcessed = new Date(record.created_at).toLocaleDateString();
            const nabRefDisplay = record.nab_code || 'PENDING';

            // Extract Young Person Name from "Name / Location" string
            let youngPersonName = ypName;
            if (ypName && ypName !== 'N/A' && ypName.includes('/')) {
                const parts = ypName.split('/');
                if (parts.length > 0) {
                    youngPersonName = parts[0].trim();
                }
            }

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

                    if (cols.length >= 5) {
                        tableRowsFound = true;
                        const storeCol = cols[1];
                        const dateMatch = storeCol.match(/(\d{2}\/\d{2}\/\d{2,4})/);
                        const receiptDate = dateMatch ? dateMatch[1] : dateProcessed;

                        allRows.push({
                            id: `${internalId}-${i}`, // Unique key for React using DB ID
                            uid: receiptId, // Display Receipt ID/Reference in UID column
                            internalId: internalId,
                            timestamp,
                            rawDate,
                            ypName: ypName,
                            youngPersonName: youngPersonName,
                            staffName,
                            product: cols[2], // Product Name
                            expenseType: cols[3], // Category
                            receiptDate,
                            amount: cols[4], // Item Amount
                            totalAmount: totalAmount, // Grand Total (Uses Form Total)
                            dateProcessed,
                            nabCode: nabRefDisplay // Display Bank Ref in Nab Code column
                        });
                    }
                }
                if (foundTable && line === '') {
                    foundTable = false;
                }
            }

            if (!tableRowsFound) {
                allRows.push({
                    id: `${internalId}-summary`,
                    uid: receiptId,
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
        // Regex: Look for "NAB Code:" or "NAB Reference:"
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

        let report = `[📋 CLICK TO COPY REPORT]\n\n`;
        report += `# ${reportTitle}\n`;
        report += `**Date Range:** ${startDate.toLocaleDateString()} - ${now.toLocaleDateString()}\n\n`;

        report += `## 📊 EXECUTIVE SUMMARY\n`;
        report += `| Metric | Value |\n`;
        report += `| :--- | :--- |\n`;
        report += `| **Total Spend** | **$${totalSpend.toFixed(2)}** |\n`;
        report += `| **Total Requests** | ${totalRequests} |\n`;
        report += `| **Pending Categorization** | ${pendingCount} |\n`;
        report += `| **Highest Single Item** | $${maxItem.amount.toFixed(2)} (${maxItem.product}) |\n\n`;

        report += `## 🏆 TOP SPENDERS (STAFF)\n`;
        report += `| Rank | Staff Member | Total Amount |\n`;
        report += `| :--- | :--- | :--- |\n`;
        topStaff.forEach((s, i) => {
            report += `| ${i + 1} | ${s[0]} | **$${s[1].toFixed(2)}** |\n`;
        });
        report += `\n`;

        report += `## 📍 SPENDING BY YP\n`;
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
    };

    const handleStartNewAudit = () => {
        resetAll();
        fetchHistory();
    };

    const handleCopyEmail = async () => {
        if (!results?.phase4) return;
        if (isEditing) {
            navigator.clipboard.writeText(editableContent);
            setEmailCopied(true);
            setTimeout(() => setEmailCopied(false), 2000);
            return;
        }
        const emailElement = document.getElementById('email-output-content');
        if (emailElement) {
            try {
                const blobHtml = new Blob([emailElement.innerHTML], { type: 'text/html' });
                const blobText = new Blob([emailElement.innerText], { type: 'text/plain' });
                const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
                await navigator.clipboard.write(data);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 2000);
                return;
            } catch (e) {
                console.warn("ClipboardItem API failed", e);
            }
        }
        navigator.clipboard.writeText(results.phase4);
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
                    const amount = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';
                    let uniqueReceiptId = nabMatch ? nabMatch[1].trim() : null;

                    if (!uniqueReceiptId || uniqueReceiptId === 'PENDING') {
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
                const amount = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';

                let uniqueReceiptId = nabMatch && nabMatch[1].trim() !== 'PENDING' ? nabMatch[1].trim() : (receiptIdMatch ? receiptIdMatch[1].trim() : null);

                if (!uniqueReceiptId && (contentToSave.toLowerCase().includes('discrepancy') || contentToSave.toLowerCase().includes('mismatch') || contentToSave.includes('STATUS: PENDING'))) {
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

        } catch (error) {
            console.error("Supabase Save Error:", error);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const confirmSave = (status: 'PENDING' | 'PAID') => {
        const tag = status === 'PENDING' ? '\n\n<!-- STATUS: PENDING -->' : '\n\n<!-- STATUS: PAID -->';
        const baseContent = isEditing ? editableContent : results?.phase4 || '';
        const finalContent = baseContent.includes('<!-- STATUS:') ? baseContent : baseContent + tag;
        handleSaveToCloud(finalContent);
        setShowSaveModal(false);
    };

    const handleSmartSave = () => {
        const hasTransactions = parsedTransactions.length > 0;
        const allHaveRef = parsedTransactions.every(tx => !!tx.currentNabRef && tx.currentNabRef.trim() !== '' && tx.currentNabRef !== 'PENDING');
        const status = (hasTransactions && allHaveRef) ? 'PAID' : 'PENDING';
        confirmSave(status);
    };

    const handleProcess = async () => {
        if (receiptFiles.length === 0) {
            setErrorMessage("Please upload at least one receipt.");
            return;
        }

        setProcessingState(ProcessingState.PROCESSING);
        setErrorMessage(null);
        setResults(null);
        setEmailCopied(false);
        setSaveStatus('idle');
        setIsEditing(false);

        try {
            const receiptImages = await Promise.all(receiptFiles.map(async (file) => ({
                mimeType: file.type || 'application/octet-stream',
                data: await fileToBase64(file),
                name: file.name
            })));

            const formImage = formFiles.length > 0 ? {
                mimeType: formFiles[0].type || 'application/octet-stream',
                data: await fileToBase64(formFiles[0]),
                name: formFiles[0].name
            } : null;

            const fullResponse = await analyzeReimbursement(receiptImages, formImage, selectedAIProvider);

            const parseSection = (tagStart: string, tagEnd: string, text: string) => {
                const startIdx = text.indexOf(tagStart);
                const endIdx = text.indexOf(tagEnd);
                if (startIdx === -1 || endIdx === -1) return "Section not found or parsing error.";
                return text.substring(startIdx + tagStart.length, endIdx).trim();
            };

            if (!fullResponse) throw new Error("No response from AI");

            let phase1 = parseSection('<<<PHASE_1_START>>>', '<<<PHASE_1_END>>>', fullResponse);
            const phase2 = parseSection('<<<PHASE_2_START>>>', '<<<PHASE_2_END>>>', fullResponse);
            const phase3 = parseSection('<<<PHASE_3_START>>>', '<<<PHASE_3_END>>>', fullResponse);
            let phase4 = parseSection('<<<PHASE_4_START>>>', '<<<PHASE_4_END>>>', fullResponse);

            const staffNameMatch = phase4.match(/\*\*Staff Member:\*\*\s*(.*)/);
            if (staffNameMatch) {
                const originalName = staffNameMatch[1].trim();
                const matchedEmployee = findBestEmployeeMatch(originalName, employeeList);
                if (matchedEmployee) {
                    phase4 = phase4.replace(originalName, matchedEmployee.fullName);
                    if (phase1.includes(originalName)) {
                        phase1 = phase1.replace(originalName, matchedEmployee.fullName);
                    }
                }
            }

            setResults({ phase1, phase2, phase3, phase4 });
            setProcessingState(ProcessingState.COMPLETE);
        } catch (err: any) {
            console.error(err);
            let msg = err.message || "An unexpected error occurred during processing.";
            if (msg.includes('400')) msg = "Error 400: The AI could not process the file. Please ensure you are uploading valid Images, PDFs, Word Docs, or Excel files.";
            setErrorMessage(msg);
            setProcessingState(ProcessingState.ERROR);
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

            if (!nabRef || nabRef === 'PENDING' || (typeof nabRef === 'string' && (nabRef.startsWith('DISC-') || nabRef.startsWith('BATCH-')))) {
                if (nabRefMatch) nabRef = nabRefMatch[1].trim();
            }

            if (!nabRef || nabRef === 'PENDING' || (typeof nabRef === 'string' && nabRef.startsWith('DISC-'))) {
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
            const activity = record.isDiscrepancy ? 'Pending' : 'Reimbursement';
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
            if (record.isDiscrepancy) {
                const reason = record.discrepancyReason ? record.discrepancyReason.replace('Mismatch: ', '') : 'Pending';
                status = `Rematch (${reason})`;
            } else {
                const refSuffix = (record.nabRef && record.nabRef !== 'PENDING' && record.nabRef !== 'N/A') ? ` [${record.nabRef}]` : '';
                status = `Paid to Nab${refSuffix}`;
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

    const pendingRecords = useMemo(() => {
        return allProcessedRecords
            .filter(r => r.isDiscrepancy && !dismissedIds.includes(r.id))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [allProcessedRecords, dismissedIds]);

    const eodData = generateEODSchedule(todaysProcessedRecords);
    const reimbursementCount = todaysProcessedRecords.filter(r => !r.isDiscrepancy).length;
    const pendingCountToday = todaysProcessedRecords.filter(r => r.isDiscrepancy).length;
    const nabReportData: any[] = todaysProcessedRecords.filter(r => !r.isDiscrepancy && r.nabRef !== 'PENDING' && r.nabRef !== '');
    const totalAmount = nabReportData.reduce((sum, r) => sum + parseFloat(String(r.amount).replace(/[^0-9.-]+/g, "")), 0);

    const getSaveButtonText = () => {
        if (isSaving) return <><RefreshCw size={12} className="animate-spin" /> Saving...</>;
        if (saveStatus === 'success') return <><RefreshCw size={12} strokeWidth={2.5} /> Start New Audit</>;
        if (saveStatus === 'error') return <><CloudUpload size={12} strokeWidth={2.5} /> Retry Save</>;
        if (saveStatus === 'duplicate') return <><CloudUpload size={12} strokeWidth={2.5} /> Duplicate!</>;
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
                                    <h2 className="text-xl font-semibold text-white">Reimbursement Database (All Records)</h2>
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
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[120px]">UID</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Time Stamp</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Nab Code</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Client / Location</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">YP NAME</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Staff Name</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Type of expense</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Product</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[100px]">Receipt Date</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[100px]">Amount</th>
                                                    <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[100px] bg-white/5">Total Amount</th>
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
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.uid}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.timestamp}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.nabCode}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 truncate max-w-[250px]" title={row.ypName}>{row.ypName}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.youngPersonName}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 uppercase">{row.staffName}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.expenseType}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200 truncate max-w-[200px]" title={row.product}>{row.product}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-xs text-slate-200">{row.receiptDate}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right text-xs text-slate-200">{row.amount}</td>
                                                        <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right text-xs text-slate-200 bg-white/5">{row.totalAmount}</td>
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
                                    <div className="px-6 py-6 border-b border-white/5 flex justify-between items-center">
                                        <h2 className="text-lg font-semibold text-white tracking-tight">Documents</h2>
                                        {results && (
                                            <button onClick={resetAll} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                                                <RefreshCw size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="p-6 space-y-8">
                                        <FileUpload
                                            label="1. Receipt Images"
                                            description="Screenshots, Images, PDF, Word, Excel"
                                            files={receiptFiles}
                                            onFilesChange={setReceiptFiles}
                                            multiple={true}
                                            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.heic,.heif"
                                        />
                                        <div className="relative">
                                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                                <div className="w-full border-t border-white/5"></div>
                                            </div>
                                            <div className="relative flex justify-center">
                                                <span className="bg-[#1c1e24] px-2 text-xs text-slate-500 uppercase tracking-widest">Optional</span>
                                            </div>
                                        </div>
                                        <FileUpload
                                            label="2. Reimbursement Form"
                                            description="Form Image, PDF, Word, Excel"
                                            files={formFiles}
                                            onFilesChange={setFormFiles}
                                            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.heic,.heif"
                                        />
                                        {errorMessage && (
                                            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                                                <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
                                                <p className="text-sm text-red-200">{errorMessage}</p>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleProcess}
                                            disabled={processingState === ProcessingState.PROCESSING || receiptFiles.length === 0}
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
                                    <h3 className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest pl-1">Process Status</h3>
                                    <div className="space-y-6 pl-2">
                                        <ProcessingStep status={processingState === ProcessingState.IDLE ? 'idle' : 'complete'} title="Upload" description="Receipts & Forms received" />
                                        <ProcessingStep status={processingState === ProcessingState.PROCESSING ? 'processing' : results ? 'complete' : 'idle'} title="AI Extraction" description="Analyzing receipt data" />
                                        <ProcessingStep status={processingState === ProcessingState.PROCESSING ? 'idle' : results ? 'complete' : 'idle'} title="Rule Engine" description="Validating policy limits" />
                                        <ProcessingStep status={processingState === ProcessingState.PROCESSING ? 'idle' : results ? 'complete' : 'idle'} title="Final Decision" description="Email generation" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 space-y-6 min-h-[600px]">
                                {!results && processingState === ProcessingState.IDLE && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-[#1c1e24]/30 border border-dashed border-white/5 rounded-[32px] p-12 text-center backdrop-blur-sm">
                                        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                                            <LayoutDashboard size={40} className="text-slate-600" />
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Audit Dashboard</h2>
                                        <p className="max-w-sm mx-auto text-slate-400">Upload documents on the left panel to begin the AI-powered auditing process.</p>
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
                                        <p className="text-slate-400 mt-2 animate-pulse">Running compliance checks</p>
                                    </div>
                                )}
                                {results && (
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full content-start">
                                        <div className="bg-[#1c1e24]/80 backdrop-blur-xl rounded-[32px] border border-white/5 overflow-hidden shadow-lg hover:border-white/10 transition-colors">
                                            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-8 bg-indigo-400 rounded-full shadow-[0_0_10px_rgba(129,140,248,0.5)]"></div>
                                                    <h3 className="font-semibold text-white text-lg">Receipt Analysis</h3>
                                                </div>
                                                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded-md border border-indigo-500/20 uppercase tracking-wider font-bold">Phase 1</span>
                                            </div>
                                            <div className="p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                                                <MarkdownRenderer content={results.phase1} />
                                            </div>
                                        </div>
                                        <div className="bg-[#1c1e24]/80 backdrop-blur-xl rounded-[32px] border border-white/5 overflow-hidden shadow-lg hover:border-white/10 transition-colors">
                                            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-8 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(96,165,250,0.5)]"></div>
                                                    <h3 className="font-semibold text-white text-lg">Standardization</h3>
                                                </div>
                                                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded-md border border-blue-500/20 uppercase tracking-wider font-bold">Phase 2</span>
                                            </div>
                                            <div className="p-6 bg-[#111216] font-mono text-xs text-slate-300 overflow-x-auto">
                                                <pre className="whitespace-pre-wrap">{results.phase2.replace(/```pgsql/g, '').replace(/```sql/g, '').replace(/```/g, '').trim()}</pre>
                                            </div>
                                        </div>
                                        <div className="bg-[#1c1e24]/80 backdrop-blur-xl rounded-[32px] border border-white/5 overflow-hidden shadow-lg hover:border-white/10 transition-colors xl:col-span-2">
                                            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-8 bg-purple-400 rounded-full shadow-[0_0_10px_rgba(192,132,252,0.5)]"></div>
                                                    <h3 className="font-semibold text-white text-lg">Audit Rules Engine</h3>
                                                </div>
                                                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-1 rounded-md border border-purple-500/20 uppercase tracking-wider font-bold">Phase 3</span>
                                            </div>
                                            <div className="p-6">
                                                <MarkdownRenderer content={results.phase3} />
                                            </div>
                                        </div>
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
                                                    {!isEditing ? (
                                                        <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-white/10 text-white hover:bg-white/20 transition-all shadow-lg">
                                                            <Edit2 size={12} strokeWidth={2.5} /> Override / Edit
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button onClick={handleCancelEdit} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all shadow-lg">
                                                                <X size={12} strokeWidth={3} /> Cancel
                                                            </button>
                                                            <button onClick={handleSaveEdit} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg">
                                                                <Check size={12} strokeWidth={3} /> Save Changes
                                                            </button>
                                                        </>
                                                    )}
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
                                                            Banking Details {parsedTransactions.length > 1 ? `(${idx + 1}/${parsedTransactions.length})` : '(Manual Transfer)'}
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
                                                    </div>
                                                </div>
                                            )})}

                                            <div className="px-8 pt-6 pb-2">
                                                <label className="block text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">
                                                    Step 5: Enter Bank/NAB Reference(s)
                                                </label>
                                                <div className="space-y-3">
                                                    {parsedTransactions.length === 0 ? (
                                                        <p className="text-sm text-slate-500 italic">No transactions detected or pending analysis...</p>
                                                    ) : parsedTransactions.map((tx, idx) => (
                                                        <div key={idx} className="relative">
                                                            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" size={16} />
                                                            <input
                                                                type="text"
                                                                value={tx.currentNabRef}
                                                                onChange={(e) => handleTransactionNabChange(idx, e.target.value)}
                                                                placeholder={`Reference for ${tx.formattedName} ($${tx.amount})...`}
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="text-[10px] text-slate-500 mt-2">Paying via bank transfer? Enter the reference code(s) above to update the email automatically.</p>
                                            </div>
                                            <div className="p-8">
                                                <div className="bg-transparent rounded-xl p-8 text-white">
                                                    {isEditing ? (
                                                        <textarea value={editableContent} onChange={(e) => setEditableContent(e.target.value)} className="w-full h-[400px] p-4 font-mono text-sm border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white/5 text-white resize-none" placeholder="Edit email content here..." />
                                                    ) : (
                                                        <MarkdownRenderer content={results.phase4} id="email-output-content" theme="dark" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                                            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Processed</span>
                                            <span className="text-emerald-400 font-mono font-bold">{reimbursementCount}</span>
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
                                {/* AI Provider Selection */}
                                <AIProviderSelector
                                    selectedProvider={selectedAIProvider}
                                    onProviderChange={(provider) => {
                                        setSelectedAIProvider(provider);
                                        aiService.setPreferredProvider(provider);
                                    }}
                                />

                                <div className="h-px bg-white/5"></div>

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
                                        {/* UID */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">UID (Receipt ID)</label>
                                            <input type="text" value={massEditData.uid} onChange={(e) => setMassEditData({ ...massEditData, uid: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-700" placeholder="(Keep Original)" />
                                        </div>

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