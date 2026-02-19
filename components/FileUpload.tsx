import React, { useRef, useState } from 'react';
import { Upload, X, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { FileWithPreview } from '../types';
import { formatBytes } from '../utils/fileHelpers';

interface FileUploadProps {
  label: string;
  files: FileWithPreview[];
  onFilesChange: (files: FileWithPreview[]) => void;
  multiple?: boolean;
  accept?: string;
  description?: string;
  manualText?: string;
  onManualTextChange?: (text: string) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  label,
  files,
  onFilesChange,
  multiple = false,
  accept = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv",
  description = "Support for JPG, PDF, Word, Excel",
  manualText,
  onManualTextChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionErrors, setConversionErrors] = useState<string[]>([]);

  // Helper to unify file processing from Drop, Input, and Paste
  const processFiles = async (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;

    setIsConverting(true);
    setConversionErrors([]); // Clear previous errors
    const processedFiles: File[] = [];

    // Dynamically import heic2any
    let heic2any: any;
    try {
      console.log("Loading HEIC converter...");
      const module = await import('heic2any');
      heic2any = module.default || module;
      console.log("HEIC converter loaded successfully");
    } catch (err) {
      console.error("Failed to load heic2any library:", err);
      // Show error in UI instead of blocking alert
      setConversionErrors(["HEIC converter not loaded. Please convert files to JPG manually."]);
      // Still process non-HEIC files
      const nonHeicFiles = incomingFiles.filter(f => {
        const isHeic = f.type.toLowerCase() === 'image/heic' ||
          f.type.toLowerCase() === 'image/heif' ||
          f.name.toLowerCase().endsWith('.heic') ||
          f.name.toLowerCase().endsWith('.heif');
        return !isHeic;
      });
      if (nonHeicFiles.length > 0) {
        processedFiles.push(...nonHeicFiles);
      }
      setIsConverting(false);

      // Generate previews and update state
      const newFilesWithPreview = processedFiles.map((file: File) => Object.assign(file, {
        preview: URL.createObjectURL(file)
      }));

      if (multiple) {
        onFilesChange([...files, ...newFilesWithPreview]);
      } else if (newFilesWithPreview.length > 0) {
        onFilesChange([newFilesWithPreview[0]]);
      }
      return;
    }

    for (const file of incomingFiles) {
      // Robust check for HEIC
      const isHeic = file.type.toLowerCase() === 'image/heic' ||
        file.type.toLowerCase() === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');

      if (isHeic) {
        try {
          console.log(`Converting HEIC file: ${file.name} (${formatBytes(file.size)})`);

          // Check file size - large HEIC files might cause issues
          if (file.size > 50 * 1024 * 1024) {
            console.warn(`Large HEIC file detected: ${file.name}. Conversion may take longer.`);
          }

          // Convert to JPEG with better error handling
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.85
          });

          // Handle both single blob and array of blobs
          const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

          if (!blob) {
            throw new Error('Conversion returned empty result');
          }

          // Create new File with .jpg extension
          const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
          const newFile = new File([blob], newName, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });

          console.log(`Successfully converted: ${newName} (${formatBytes(newFile.size)})`);
          processedFiles.push(newFile);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          console.error("HEIC conversion failed for:", file.name, errorMsg, e);
          // Show which file failed but continue with others
          setConversionErrors(prev => [...prev, `${file.name} (${errorMsg})`]);
          // Skip this file and continue
          continue;
        }
      } else {
        processedFiles.push(file);
      }
    }

    // Generate previews for all successfull files
    const newFilesWithPreview = processedFiles.map((file: File) => Object.assign(file, {
      preview: URL.createObjectURL(file)
    }));

    if (multiple) {
      onFilesChange([...files, ...newFilesWithPreview]);
    } else {
      if (newFilesWithPreview.length > 0) {
        onFilesChange([newFilesWithPreview[0]]);
      }
    }

    setIsConverting(false);

    // Reset input value to allow re-uploading same file if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (indexToRemove: number) => {
    const updatedFiles = files.filter((_, index) => index !== indexToRemove);
    onFilesChange(updatedFiles);
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Unified Paste Handler Logic
  const handlePasteLogic = (clipboardData: DataTransfer | null) => {
    if (!clipboardData) return;

    const extractedFiles: File[] = [];

    // 1. Check for standard files (e.g. copied from file explorer)
    if (clipboardData.files.length > 0) {
      extractedFiles.push(...Array.from(clipboardData.files));
    }
    // 2. Check for raw items (e.g. screenshots in clipboard memory)
    else if (clipboardData.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            // Create a named file from the blob
            const file = new File([blob], `screenshot-${Date.now()}.png`, { type: item.type || 'image/png' });
            extractedFiles.push(file);
          }
        }
      }
    }

    if (extractedFiles.length > 0) {
      processFiles(extractedFiles);
      return true; // handled
    }
    return false;
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Only handle if focused to avoid conflicts, though React's onPaste usually implies focus or bubbling
    if (handlePasteLogic(e.clipboardData)) {
      e.preventDefault();
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <img src={(file as FileWithPreview).preview} alt={file.name} className="h-full w-full object-cover" />;
    }
    if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx') || file.name.endsWith('.csv')) {
      return <FileSpreadsheet className="text-emerald-400" />;
    }
    if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
      return <FileText className="text-blue-400" />;
    }
    return <FileText className="text-slate-400" />;
  };

  return (
    <div className="w-full">
      {/* Header Row: Label Left, Description Right */}
      <div className="flex justify-between items-baseline mb-3 px-1">
        <label className="block text-base font-medium text-slate-200">{label}</label>
        <span className="text-xs text-slate-500">{description}</span>
      </div>

      {/* Dropzone Box */}
      <div
        ref={containerRef}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        tabIndex={0}
        className={`group relative flex flex-col items-center justify-center w-full h-40 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer outline-none overflow-hidden
          ${isDragging
            ? 'border-indigo-400 bg-indigo-500/10'
            : isFocused
              ? 'border-indigo-500/50 bg-white/5 ring-1 ring-indigo-500/30'
              : 'border-slate-600/60 bg-slate-800/30 hover:bg-slate-800/50 hover:border-slate-500'
          }
        `}
      >
        <div className="flex flex-col items-center justify-center space-y-3 p-5 text-center">
          {isConverting ? (
            <div className="flex flex-col items-center justify-center space-y-3 animate-pulse">
              <div className="p-3 rounded-full bg-indigo-500/20 text-indigo-400">
                <Loader2 size={24} className="animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-indigo-300">Processing files...</p>
                <p className="text-xs text-slate-500">Converting HEIC images if needed</p>
              </div>
            </div>
          ) : (
            <>
              {/* Circular Icon Background */}
              <div className={`p-3 rounded-full transition-colors duration-300
                 ${isDragging ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-700 group-hover:text-indigo-400'}
              `}>
                {isDragging ? <Upload size={24} className="animate-bounce" /> : <Upload size={24} />}
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-300">
                  <span className="text-indigo-400 hover:text-indigo-300 underline decoration-dotted underline-offset-2">Upload files</span>, Paste, or Drag & Drop
                </p>
                <p className="text-xs text-slate-500">
                  {multiple ? "Multiple files allowed" : "Single file"} • Ctrl+V to paste
                </p>
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          multiple={multiple}
          accept={accept}
          onChange={handleFileChange}
        />
      </div>

      {/* Conversion Errors */}
      {conversionErrors.length > 0 && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-400 font-medium mb-2">
            Failed to convert {conversionErrors.length} file(s). Please convert to JPG first:
          </p>
          <ul className="space-y-1">
            {conversionErrors.map((filename, idx) => (
              <li key={idx} className="text-xs text-red-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                {filename}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setConversionErrors([])}
            className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Manual Text Input Fallback */}
      {onManualTextChange !== undefined && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Manual Text Fallback (Optional)</span>
            <span className="text-[10px] text-slate-600">If AI is busy/offline</span>
          </div>
          <textarea
            value={manualText || ''}
            onChange={(e) => onManualTextChange(e.target.value)}
            placeholder="Paste text from receipt or enter details manually here..."
            className="w-full h-24 bg-black/20 border border-white/10 rounded-xl p-3 text-xs text-slate-300 focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-600 resize-none custom-scrollbar"
          />
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="relative flex items-center p-3 border border-white/10 rounded-xl bg-white/5 backdrop-blur-sm group hover:border-white/20 transition-colors">
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-black/20 flex items-center justify-center border border-white/5">
                {getFileIcon(file)}
              </div>
              <div className="ml-4 flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="ml-4 flex-shrink-0 bg-transparent rounded-md text-slate-500 hover:text-red-400 transition-colors focus:outline-none opacity-0 group-hover:opacity-100"
              >
                <X size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileUpload;