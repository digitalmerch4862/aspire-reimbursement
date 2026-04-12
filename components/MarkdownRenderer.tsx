import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  id?: string;
  theme?: 'dark' | 'light';
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '', id, theme = 'dark' }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let tableBuffer: string[] = [];
  let isProcessingTable = false;
  let listBuffer: string[] = [];

  const isDark = theme === 'dark';

  // Define styles based on theme
  const styles = {
    text: isDark ? 'text-slate-300' : 'text-slate-700',
    strong: isDark ? 'text-white' : 'text-slate-900',
    h1: isDark ? 'text-white' : 'text-slate-900',
    h2: isDark ? 'text-white border-white/10' : 'text-slate-900 border-slate-200',
    h3: isDark ? 'text-slate-100' : 'text-slate-800',
    list: isDark ? 'text-slate-400 marker:text-slate-500' : 'text-slate-600 marker:text-slate-400',
    // Existing class-based styles for UI
    tableContainerBorder: isDark ? 'border-slate-700' : 'border-slate-300',
    tableBg: isDark ? 'bg-[#1a1c23]' : 'bg-white',
    tableHeaderBg: isDark ? 'bg-[#2d313a]' : 'bg-slate-100',
    tableHeaderBorder: isDark ? 'border-slate-600' : 'border-slate-300',
    tableHeaderText: isDark ? 'text-slate-200' : 'text-slate-700',
    tableBodyDivide: isDark ? 'divide-slate-700' : 'divide-slate-200',
    tableRowHover: isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50',
    tableCellText: isDark ? 'text-slate-300' : 'text-slate-600',
    tableCellBorder: isDark ? 'border-slate-700' : 'border-slate-200',
  };

  // INLINE STYLES FOR OUTLOOK COPYING (Applied when theme is LIGHT)
  const inlineStyles = {
    container: !isDark ? {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      lineHeight: '1.55',
      color: '#1f2937'
    } : {},
    h1: !isDark ? {
      fontSize: '28px',
      lineHeight: '1.2',
      fontWeight: 700,
      color: '#111827',
      margin: '0 0 16px 0'
    } : {},
    h2: !isDark ? {
      fontSize: '20px',
      lineHeight: '1.3',
      fontWeight: 700,
      color: '#111827',
      margin: '28px 0 12px 0',
      paddingBottom: '8px',
      borderBottom: '1px solid #e5e7eb'
    } : {},
    h3: !isDark ? {
      fontSize: '16px',
      lineHeight: '1.4',
      fontWeight: 700,
      color: '#1f2937',
      margin: '20px 0 8px 0'
    } : {},
    p: !isDark ? {
      margin: '0 0 8px 0',
      color: '#374151'
    } : {},
    strong: !isDark ? {
      fontWeight: 700,
      color: '#111827'
    } : {},
    ul: !isDark ? {
      margin: '0 0 12px 0',
      paddingLeft: '20px',
      color: '#374151'
    } : {},
    li: !isDark ? {
      marginBottom: '6px'
    } : {},
    table: !isDark ? { 
        borderCollapse: 'collapse' as const, 
        width: '100%', 
        fontFamily: 'Arial, sans-serif', 
        fontSize: '13px',
        marginBottom: '16px'
    } : {},
    th: !isDark ? { 
        backgroundColor: '#f3f4f6', 
        border: '1px solid #d1d5db', 
        padding: '8px 12px', 
        textAlign: 'left' as const, 
        fontWeight: 'bold', 
        color: '#111827' 
    } : {},
    td: !isDark ? { 
        border: '1px solid #d1d5db', 
        padding: '8px 12px', 
        color: '#374151', 
        verticalAlign: 'top' as const 
    } : {},
    tr: !isDark ? { backgroundColor: '#ffffff' } : {}
  };

  const renderInlineParts = (value: string) => {
    const parts = value.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className={`font-bold ${styles.strong}`} style={inlineStyles.strong}>{part.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={key} className={`ml-4 list-disc ${styles.list} pl-1 mb-3`} style={inlineStyles.ul}>
        {listBuffer.map((item, index) => (
          <li key={`${key}-${index}`} style={inlineStyles.li}>
            {renderInlineParts(item)}
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const renderTable = (rows: string[], key: string) => {
    if (rows.length < 2) return null; // Need at least header and separator or header and body

    // Filter separator line (contains ---) and empty lines
    const cleanRows = rows.filter(r => !r.includes('---') && r.trim() !== '');
    
    if (cleanRows.length === 0) return null;

    return (
      <div key={key} className={`my-4 border ${styles.tableContainerBorder} rounded-lg overflow-hidden`}>
        <table className={`w-full text-left text-sm border-collapse ${styles.tableBg}`} style={inlineStyles.table}>
          <thead>
            <tr className={`${styles.tableHeaderBg} border-b ${styles.tableHeaderBorder}`} style={inlineStyles.tr}>
              {cleanRows[0].split('|').filter(c => c.trim()).map((header, i) => (
                <th 
                    key={i} 
                    className={`px-3 py-2 font-semibold ${styles.tableHeaderText} border-r ${styles.tableHeaderBorder} last:border-r-0 whitespace-nowrap`}
                    style={inlineStyles.th}
                >
                  {renderInlineParts(header.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y ${styles.tableBodyDivide}`}>
            {cleanRows.slice(1).map((row, rIdx) => (
              <tr key={rIdx} className={`${styles.tableRowHover} transition-colors`} style={inlineStyles.tr}>
                {row.split('|').filter(c => c.trim()).map((cell, cIdx) => (
                  <td 
                    key={cIdx} 
                    className={`px-3 py-2 ${styles.tableCellText} border-r ${styles.tableCellBorder} last:border-r-0 align-top`}
                    style={inlineStyles.td}
                  >
                    {renderInlineParts(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Table detection logic
    if (trimmed.startsWith('|')) {
      if (!isProcessingTable) isProcessingTable = true;
      tableBuffer.push(trimmed);
      return; // Skip rendering, accumulating lines
    } 
    
    // If we were processing a table and hit a non-table line
    if (isProcessingTable) {
      flushList(`list-before-table-${index}`);
      elements.push(renderTable(tableBuffer, `table-${index}`));
      tableBuffer = [];
      isProcessingTable = false;
    }

    if (trimmed === '') {
        flushList(`list-blank-${index}`);
        elements.push(<div key={index} className="h-4"></div>);
        return;
    }

    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList(`list-before-h3-${index}`);
      elements.push(<h3 key={index} className={`text-lg font-bold ${styles.h3} mt-6 mb-2 tracking-tight`} style={inlineStyles.h3}>{trimmed.replace('### ', '')}</h3>);
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList(`list-before-h2-${index}`);
      elements.push(<h2 key={index} className={`text-xl font-bold ${styles.h2} mt-8 mb-3 border-b pb-2`} style={inlineStyles.h2}>{trimmed.replace('## ', '')}</h2>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList(`list-before-h1-${index}`);
      elements.push(<h1 key={index} className={`text-2xl font-bold ${styles.h1} mt-6 mb-4`} style={inlineStyles.h1}>{trimmed.replace('# ', '')}</h1>);
      return;
    }

    // Lists
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
       listBuffer.push(trimmed.replace(/^[-*] /, ''));
       return;
    }

    flushList(`list-before-p-${index}`);

    elements.push(
      <p key={index} className={`${styles.text} leading-relaxed min-h-[1.2em] mb-1`} style={inlineStyles.p}>
        {renderInlineParts(line)}
      </p>
    );
  });

  // Flush remaining table if file ends with table
  flushList('list-end');
  if (isProcessingTable && tableBuffer.length > 0) {
      elements.push(renderTable(tableBuffer, `table-end`));
  }

  return (
    <div id={id} className={`font-sans ${className}`} style={inlineStyles.container}>
      {elements}
    </div>
  );
};

export default MarkdownRenderer;
