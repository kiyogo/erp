import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { DocxEditorModal } from '../components/editor/DocxEditorModal';
import { filesApi } from '../api/endpoints';
import { getFileBlob, storeFileBlob, formatFileSize } from '../utils/fileStorage';
import { downloadFile, generateValidPdfBlob } from '../utils/fileExporter';
import {
  Printer,
  Download,
  Save,
  ArrowLeft,
  X,
  Plus,
  Trash2,
  FileSpreadsheet,
  FileText,
  FileCode,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCw,
  Search,
  Check,
  Copy,
  Table as TableIcon,
} from 'lucide-react';

export const DocumentEditorPage: React.FC = () => {
  const params = useParams<{ type?: string; fileKey?: string; '*': string }>();
  const location = useLocation();
  const navigate = useNavigate();

  let docType = (params.type || 'docx').toLowerCase().replace(/^\./, '');
  let fileKey = params.fileKey || '';

  if (!fileKey || location.pathname.includes('/docx/')) {
    const cleanPath = location.pathname.replace(/^\/(files\/)?document\//, '');
    const parts = cleanPath.split('/').filter(Boolean);
    if (parts.length > 0) {
      if (['docx', 'doc', 'xlsx', 'xls', 'pdf', 'txt', 'csv'].includes(parts[0].toLowerCase())) {
        docType = parts[0].toLowerCase();
        parts.shift();
      }
      if (parts.length > 0 && parts[parts.length - 1] === 'edit') {
        parts.pop();
      }
      fileKey = decodeURIComponent(parts.join('/'));
    }
  } else if (fileKey.endsWith('/edit')) {
    fileKey = fileKey.slice(0, -5);
  }
  const [docFile, setDocFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [docName, setDocName] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string>('Đã đồng bộ');
  const [zoom, setZoom] = useState<number>(100);

  // PDF state
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  // Excel state
  const [excelData, setExcelData] = useState<string[][]>([]);
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);
  const [formulaValue, setFormulaValue] = useState<string>('');

  // Code / Text state
  const [textLines, setTextLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Load File Meta & Content
  useEffect(() => {
    let activePdfUrl = '';
    const loadFileData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        let meta: any = null;
        const cachedMeta = localStorage.getItem('doc_meta_' + fileKey);
        if (cachedMeta) {
          try {
            meta = JSON.parse(cachedMeta);
          } catch (e) {}
        }

        if (!meta) {
          // Check mock file system in localStorage
          try {
            const rawFs = localStorage.getItem('minepanel_custom_fs');
            if (rawFs) {
              const parsedFs = JSON.parse(rawFs);
              for (const dir of Object.values(parsedFs) as any[]) {
                if (Array.isArray(dir)) {
                  const match = dir.find((f: any) => f.key === fileKey || f.name.includes(fileKey));
                  if (match) {
                    meta = match;
                    break;
                  }
                }
              }
            }
          } catch (e) {}
        }

        const name = meta?.name || `Tai_Lieu_${fileKey.slice(0, 8)}.${docType}`;
        setDocName(name);
        setDocFile(meta || { key: fileKey, name, type: 'file', size: '24.5 KB' });

        // Load content
        let storedBlob = await getFileBlob(fileKey);
        if (!storedBlob && fileKey) {
          const response = await filesApi.download(fileKey);
          storedBlob = response.data;
          await storeFileBlob(fileKey, storedBlob);
        }
        if (storedBlob) {
          if (docType === 'docx' || docType === 'doc') {
            // Handled inside DocxEditorModal
          } else if (docType === 'pdf') {
            setPdfBlob(storedBlob);
            activePdfUrl = URL.createObjectURL(storedBlob);
            setPdfBlobUrl(activePdfUrl);
          } else {
            const text = await storedBlob.text();
            setContent(text);
          }
        } else {
          // Generate default content based on type
          if (['xlsx', 'xls', 'csv'].includes(docType)) {
            const defaultRows = [
              ['STT', 'Mã mục', 'Danh mục nghiệp vụ', 'Đơn vị', 'Số lượng', 'Đơn giá (VNĐ)', 'Thành tiền (VNĐ)'],
              ['01', 'REV-01', 'Doanh thu Dịch vụ Cloud Enterprise', 'Gói', '120', '25,000,000', '3,000,000,000'],
              ['02', 'REV-02', 'Bản quyền phần mềm Core ERP v3', 'License', '450', '4,500,000', '2,025,000,000'],
              ['03', 'EXP-01', 'Chi phí hạ tầng Data Center & Cloud', 'Tháng', '12', '120,000,000', '1,440,000,000'],
              ['04', 'EXP-02', 'Chi phí lương & BHXH nhân sự công nghệ', 'Tháng', '12', '680,000,000', '8,160,000,000'],
              ['05', 'EXP-03', 'Chi phí kiểm toán độc lập & an ninh mạng', 'Gói', '2', '85,000,000', '170,000,000'],
              ['06', 'REV-03', 'Doanh thu bảo trì & hỗ trợ 24/7 SLA', 'Hợp đồng', '35', '50,000,000', '1,750,000,000'],
              ['', '', 'TỔNG CỘNG DOANH THU THỰC TẾ', '', '', '', '18,450,000,000'],
            ];
            setExcelData(defaultRows);
          } else if (docType === 'pdf') {
            const validBlob = generateValidPdfBlob(
              name.replace(/\.pdf$/i, '').replace(/_/g, ' ') || `Tai Lieu ${fileKey.slice(0, 8)}`,
              `So ho so: KIYO-DOC-2026/0889 - Ban hanh ngay ${new Date().toLocaleDateString('vi-VN')}`,
              [
                'Can cu theo Luat Doanh Nghiep va Dieu le hoat dong cua Cong ty Co phan Cong nghe KIYOVN.',
                'Toan bo noi dung tai lieu nay da duoc tham dinh, ma hoa va bao mat luu tru tren he thong dien tu.',
                'Moi thong tin trong van ban co gia tri phap ly tuong duong van ban giay truyen thong.',
                'Chung thu so va chu ky dien tu duoc chung thuc theo tieu chuan an toan ISO/IEC 27001.',
                'Cac phong ban, doi tac va ca nhan lien quan chiu trach nhiem thuc thi theo quy che quan tri noi bo.',
              ]
            );
            await storeFileBlob(fileKey, validBlob);
            setPdfBlob(validBlob);
            activePdfUrl = URL.createObjectURL(validBlob);
            setPdfBlobUrl(activePdfUrl);
          } else {
            const defaultCode = `// KIYOVN Enterprise Document System
// File: ${name}
// Key: ${fileKey}
// Last Modified: ${new Date().toLocaleString()}

{
  "system": "KIYOVN Enterprise Core",
  "document_id": "${fileKey}",
  "status": "approved",
  "digital_sign": {
    "signed": true,
    "algorithm": "SHA-256 with RSA",
    "root_ca": "KIYOVN Root CA Enterprise"
  }
}`;
            setContent(defaultCode);
            setTextLines(defaultCode.split('\n'));
          }
        }
      } catch (err: any) {
        console.error('Failed to load document:', err);
        setLoadError(err?.response?.data?.message || 'Không thể tải tài liệu từ máy chủ.');
      } finally {
        setLoading(false);
      }
    };

    loadFileData();

    return () => {
      if (activePdfUrl) {
        URL.revokeObjectURL(activePdfUrl);
      }
    };
  }, [fileKey, docType]);

  // Save handler for Excel / Text / Code
  const handleSaveData = async () => {
    setSaveStatus('Đang lưu...');
    try {
      let blobToSave: Blob;
      if (['xlsx', 'xls', 'csv'].includes(docType)) {
        const csvContent = excelData.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        blobToSave = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      } else {
        blobToSave = new Blob([content], { type: 'text/plain;charset=utf-8;' });
      }

      await storeFileBlob(fileKey, blobToSave);
      setSaveStatus('Đã lưu thành công!');
      setTimeout(() => setSaveStatus('Đã đồng bộ'), 2500);
    } catch (e) {
      setSaveStatus('Lưu thất bại!');
      setTimeout(() => setSaveStatus('Đã đồng bộ'), 2500);
    }
  };

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveData();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, excelData]);

  // 1. DOCX / WORD EDITOR
  if (['docx', 'doc'].includes(docType)) {
    if (loading) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F3F5F7', color: '#334155', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ width: 360, padding: 28, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)', textAlign: 'center' }}>
            <div style={{ width: 34, height: 34, border: '3px solid #BFDBFE', borderTopColor: '#2563EB', borderRadius: '50%', margin: '0 auto 14px', animation: 'doc-editor-spin 0.8s linear infinite' }} />
            <strong style={{ display: 'block', fontSize: 16, color: '#1E293B' }}>Đang tải tài liệu</strong>
            <span style={{ display: 'block', marginTop: 8, fontSize: 13, color: '#64748B' }}>Chuẩn bị nội dung để có thể soạn thảo.</span>
          </div>
          <style>{'@keyframes doc-editor-spin { to { transform: rotate(360deg); } }'}</style>
        </div>
      );
    }

    if (loadError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F3F5F7', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ width: 420, padding: 28, background: '#FFFFFF', border: '1px solid #FECACA', borderRadius: 12, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)', textAlign: 'center' }}>
            <strong style={{ display: 'block', fontSize: 16, color: '#B91C1C' }}>Không thể mở tài liệu</strong>
            <span style={{ display: 'block', marginTop: 8, fontSize: 13, color: '#64748B' }}>{loadError}</span>
            <button type="button" onClick={() => window.close()} style={{ marginTop: 18, border: 'none', borderRadius: 6, background: '#2563EB', color: '#FFFFFF', padding: '8px 14px', cursor: 'pointer' }}>Đóng tab</button>
          </div>
        </div>
      );
    }

    return (
      <DocxEditorModal
        open={true}
        onClose={() => {
          if (window.opener) {
            window.close();
          } else if (window.history.length > 1) {
            navigate(-1);
          } else {
            window.close();
          }
        }}
        fileName={docName || `Tai_lieu_${fileKey}.docx`}
        fileKey={fileKey}
        onSaveSuccess={(updatedName, updatedBlob) => {
          void (async () => {
            try {
              if (updatedBlob) await filesApi.updateContent(fileKey, updatedBlob);
              if (updatedName !== docName) await filesApi.update(fileKey, updatedName);
              setDocName(updatedName);
              setSaveStatus('Đã đồng bộ');
            } catch {
              setSaveStatus('Chưa thể đồng bộ lên máy chủ');
            }
          })();
        }}
      />
    );
  }

  // 2. EXCEL / SPREADSHEET EDITOR
  if (['xlsx', 'xls', 'csv'].includes(docType)) {
    const colHeaders = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    const handleCellChange = (r: number, c: number, val: string) => {
      const updated = [...excelData.map(row => [...row])];
      if (!updated[r]) updated[r] = [];
      updated[r][c] = val;
      setExcelData(updated);
      setSaveStatus('Chưa lưu thay đổi');
    };

    const handleAddRow = () => {
      const cols = excelData[0]?.length || 7;
      setExcelData(prev => [...prev, new Array(cols).fill('')]);
      setSaveStatus('Chưa lưu thay đổi');
    };

    const handleAddCol = () => {
      setExcelData(prev => prev.map(row => [...row, '']));
      setSaveStatus('Chưa lưu thay đổi');
    };

    return (
      <div className="flex flex-col h-screen w-screen bg-[#F3F4F6] text-[#1F2937] overflow-hidden select-none font-sans">
        {/* Top Header */}
        <div className="h-[44px] bg-[#107C41] text-white flex items-center justify-between px-4 shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-[32px] h-[32px] bg-[#0E6835] rounded-md flex items-center justify-center font-bold text-white shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <input
                value={docName}
                onChange={e => setDocName(e.target.value)}
                className="bg-transparent text-white font-bold text-[14px] outline-none border-b border-transparent hover:border-white/50 focus:border-white px-1"
              />
              <span className="text-white/60 text-[12px]">&middot;</span>
              <span className="text-white/80 text-[12px] font-medium">{saveStatus}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveData}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded text-[12.5px] font-medium transition-all"
            >
              <Save className="w-4 h-4" /> Lưu (Ctrl+S)
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded text-[12.5px] font-medium transition-all"
            >
              <Printer className="w-4 h-4" /> In
            </button>
            <button
              onClick={() => downloadFile(docName, excelData.map(r => r.join(',')).join('\n'))}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded text-[12.5px] font-medium transition-all"
            >
              <Download className="w-4 h-4" /> Tải về
            </button>
            <button
              onClick={() => window.close()}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-600 text-white transition-all ml-2"
              title="Đóng tab"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="h-[38px] bg-white border-b border-[#E5E7EB] flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={handleAddRow}
            className="flex items-center gap-1 text-[12.5px] text-[#374151] px-2.5 py-1 rounded border border-[#D1D5DB] hover:bg-[#F9FAFB] font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-[#107C41]" /> Thêm hàng
          </button>
          <button
            onClick={handleAddCol}
            className="flex items-center gap-1 text-[12.5px] text-[#374151] px-2.5 py-1 rounded border border-[#D1D5DB] hover:bg-[#F9FAFB] font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-[#107C41]" /> Thêm cột
          </button>
          <div className="w-[1px] h-[20px] bg-[#E5E7EB]" />
          {/* Formula Bar */}
          <div className="flex-1 flex items-center gap-2">
            <span className="font-serif italic font-bold text-[#6B7280] text-[13px]">fx</span>
            <input
              type="text"
              value={formulaValue}
              onChange={e => {
                setFormulaValue(e.target.value);
                if (activeCell) {
                  handleCellChange(activeCell.r, activeCell.c, e.target.value);
                }
              }}
              placeholder="Nhập công thức hoặc giá trị ô..."
              className="flex-1 border border-[#D1D5DB] rounded px-2.5 py-1 text-[12.5px] outline-none focus:border-[#107C41]"
            />
          </div>
        </div>

        {/* Spreadsheet Grid */}
        <div className="flex-1 overflow-auto bg-[#F9FAFB] p-4">
          <div className="bg-white border border-[#D1D5DB] rounded shadow-sm inline-block min-w-full">
            <table className="border-collapse w-full text-[13px]">
              <thead>
                <tr className="bg-[#F3F4F6] text-[#4B5563]">
                  <th className="w-[45px] p-2 border-r border-b border-[#D1D5DB] text-center font-semibold text-[11.5px]">#</th>
                  {Array.from({ length: Math.max(7, excelData[0]?.length || 7) }).map((_, colIdx) => (
                    <th key={colIdx} className="p-2 border-r border-b border-[#D1D5DB] text-center font-semibold min-w-[130px]">
                      {colHeaders[colIdx] || `C${colIdx + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {excelData.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-[#F0FDF4] transition-colors">
                    <td className="bg-[#F9FAFB] border-r border-b border-[#D1D5DB] text-center font-medium text-[#6B7280] text-[11.5px] p-1.5 select-none">
                      {rowIdx + 1}
                    </td>
                    {Array.from({ length: Math.max(7, excelData[0]?.length || 7) }).map((_, colIdx) => {
                      const val = row[colIdx] || '';
                      const isHeaderRow = rowIdx === 0;
                      const isTotalRow = rowIdx === excelData.length - 1;
                      const isSelected = activeCell?.r === rowIdx && activeCell?.c === colIdx;

                      return (
                        <td
                          key={colIdx}
                          className={`border-r border-b border-[#E5E7EB] p-0 relative ${isSelected ? 'outline outline-2 outline-[#107C41] z-10' : ''}`}
                          onClick={() => {
                            setActiveCell({ r: rowIdx, c: colIdx });
                            setFormulaValue(val);
                          }}
                        >
                          <input
                            type="text"
                            value={val}
                            onChange={e => {
                              handleCellChange(rowIdx, colIdx, e.target.value);
                              setFormulaValue(e.target.value);
                            }}
                            className={`w-full h-full p-2 outline-none bg-transparent ${isHeaderRow ? 'font-bold text-[#107C41] bg-[#F8FAFC]' : isTotalRow ? 'font-bold text-[#111827]' : 'text-[#1F2937]'}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Sheet Bar */}
        <div className="h-[28px] bg-white border-t border-[#D1D5DB] flex items-center justify-between px-4 text-[12px] text-[#6B7280]">
          <div className="flex items-center gap-1">
            <span className="bg-[#E0F2F1] text-[#107C41] font-bold px-3 py-1 rounded-t border-t border-x border-[#107C41]">Sheet1</span>
            <button className="w-5 h-5 flex items-center justify-center hover:bg-[#E5E7EB] rounded font-bold text-[#4B5563]">+</button>
          </div>
          <span>Tổng số hàng: {excelData.length} | Cột: {excelData[0]?.length || 7}</span>
        </div>
      </div>
    );
  }

  // 3. PDF DOCUMENT VIEWER
  if (docType === 'pdf') {
    return (
      <div className="w-screen h-screen bg-[#525659] overflow-hidden">
        {pdfBlobUrl ? (
          <object
            data={`${pdfBlobUrl}#toolbar=1&navpanes=1&statusbar=1&view=FitH`}
            type="application/pdf"
            className="w-full h-full border-0 block"
          >
            <iframe
              src={`${pdfBlobUrl}#toolbar=1&navpanes=1&statusbar=1&view=FitH`}
              className="w-full h-full border-0 block"
              title={docName}
            >
              <div className="flex flex-col items-center justify-center h-full text-white gap-4">
                <p>Trình duyệt của bạn không hỗ trợ xem trực tiếp file PDF.</p>
                <a
                  href={pdfBlobUrl}
                  download={docName}
                  className="bg-[#1a73e8] text-white px-4 py-2 rounded font-medium hover:bg-[#1557b0]"
                >
                  Tải file PDF về máy
                </a>
              </div>
            </iframe>
          </object>
        ) : (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#bdc1c6]">Đang tải trình đọc PDF...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 4. CODE / TEXT / OTHER FILES
  return (
    <div className="flex flex-col h-screen w-screen bg-[#1E1E1E] text-[#D4D4D4] overflow-hidden font-mono text-[13.5px]">
      {/* Top Header */}
      <div className="h-[44px] bg-[#252526] border-b border-[#333333] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-[28px] h-[28px] bg-[#009688] rounded flex items-center justify-center text-white">
            <FileCode className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[13.5px] text-[#E0E0E0]">{docName}</span>
            <span className="text-[#888] text-[12px]">&middot;</span>
            <span className="text-[#A0AEC0] text-[12px]">{saveStatus}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(content);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1 bg-[#333333] hover:bg-[#444444] text-white px-3 py-1.5 rounded text-[12px]"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Đã sao chép' : 'Sao chép'}
          </button>
          <button
            onClick={handleSaveData}
            className="flex items-center gap-1.5 bg-[#009688] hover:bg-[#00796B] text-white px-3.5 py-1.5 rounded text-[12px] font-semibold"
          >
            <Save className="w-4 h-4" /> Lưu (Ctrl+S)
          </button>
          <button
            onClick={() => window.close()}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-600 text-white transition-all ml-1"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line Numbers */}
        <div className="w-[48px] bg-[#1E1E1E] border-r border-[#333333] select-none text-[#858585] text-right pr-3 pt-4 text-[12.5px] leading-[1.6]">
          {content.split('\n').map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          value={content}
          onChange={e => {
            setContent(e.target.value);
            setSaveStatus('Chưa lưu thay đổi');
          }}
          className="flex-1 bg-[#1E1E1E] text-[#D4D4D4] p-4 outline-none resize-none font-mono text-[13.5px] leading-[1.6] overflow-auto"
          spellCheck={false}
        />
      </div>

      {/* Status Bar */}
      <div className="h-[24px] bg-[#007ACC] text-white flex items-center justify-between px-3 text-[11px] shrink-0 font-sans">
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span>Dòng: {content.split('\n').length}</span>
          <span>Ký tự: {content.length}</span>
        </div>
        <span>KIYOVN Document Editor Engine v3.5</span>
      </div>
    </div>
  );
};
