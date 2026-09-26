import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Tag, Space, Typography, Breadcrumb, message, Modal, Form, Input, Select, Popconfirm, Dropdown, Tree, Segmented, Tooltip, InputNumber, Upload, Row, Col, Checkbox, Card, AutoComplete, Table } from '../custom-ui';
import {
  FolderOutlined,
  FileOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  HomeOutlined,
  PlusOutlined,
  EditOutlined,
  CopyOutlined,
  ScissorOutlined,
  FileZipOutlined,
  UnlockOutlined,
  EyeOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  ColumnWidthOutlined,
  FileAddOutlined,
  FolderAddOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  SnippetsOutlined,
  CheckOutlined,
  RightOutlined,
  SaveOutlined,
  DatabaseOutlined,
  UserOutlined,
  DownOutlined,
  SafetyCertificateOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileTextOutlined,
  CheckCircleFilled,
  HddOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import type { UploadProps } from '../custom-ui';
import Selecto from 'react-selecto';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services/dataService';
import { filesApi, type StoredFileNode } from '../api/endpoints';
import { downloadFile, generateValidPdfBlob } from '../utils/fileExporter';
import { storeFileBlob, getFileBlob, deleteFileBlob, formatFileSize, generateFileHash } from '../utils/fileStorage';
import { extractReadableTextFromDoc, generateWordViewerHtml } from '../utils/documentViewer';

const { Title, Text } = Typography;
const HIDDEN_FILES_PREFERENCE_KEY = 'minepanel_files_show_hidden';

interface FileItem {
  key: string; name: string; type: 'dir' | 'file'; size: string; modified: string;
  owner?: string; group?: string; permission?: string; mime?: string;
  parentId?: string | null; sizeBytes?: number; isHidden?: boolean; isSystem?: boolean; isProtected?: boolean;
}

const asFileItem = (node: StoredFileNode): FileItem => ({
  key: node.id,
  name: node.name,
  type: node.type,
  size: node.type === 'dir' ? '—' : formatFileSize(node.sizeBytes),
  sizeBytes: node.sizeBytes,
  modified: node.modified,
  owner: node.owner,
  group: node.group,
  permission: node.permission,
  mime: node.mime,
  parentId: node.parentId,
  isHidden: node.isHidden,
  isSystem: node.isSystem,
  isProtected: node.isProtected,
});

const mockFileSystem: Record<string, FileItem[]> = {
  '/': [],
};

const normalizeFileSystem = (value: unknown): Record<string, FileItem[]> | null => {
  // Older builds stored the root directory directly as an array. Migrate that
  // shape so existing files remain visible instead of rendering an empty view.
  if (Array.isArray(value)) return { '/': value as FileItem[] };

  if (!value || typeof value !== 'object') return null;

  const directories = Object.entries(value as Record<string, unknown>)
    .filter(([, entries]) => Array.isArray(entries))
    .reduce<Record<string, FileItem[]>>((result, [directory, entries]) => {
      result[directory] = entries as FileItem[];
      return result;
    }, {});

  return Object.keys(directories).length ? directories : null;
};

const Files: React.FC = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const isEmployeeFilesRoute = location.pathname.toLowerCase().startsWith('/employee/files');
  const [path, setPath] = useState<string[]>(['/']);
  const [pathIds, setPathIds] = useState<Array<string | null>>([null]);
  const [showCheckboxes, setShowCheckboxes] = useState(false);
  const [showExtensions, setShowExtensions] = useState(true);
  const [showHidden, setShowHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN_FILES_PREFERENCE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [canShowHidden, setCanShowHidden] = useState(false);
  const [isVirtualEmployeeRoot, setIsVirtualEmployeeRoot] = useState(false);
  const [virtualRootLabel, setVirtualRootLabel] = useState('');

  const { user } = useAuth();
  const userQuotaGB = useMemo(() => {
    try {
      const targetId = user?.id || '';
      if (targetId) {
        const saved = localStorage.getItem('employee_storage_quota_' + targetId);
        if (saved) return parseFloat(saved) || 2;
      }
    } catch {}
    return 2;
  }, [user?.id]);

  const isDraggingRef = useRef(false);
  const nativeFileInputRef = useRef<HTMLInputElement>(null);
  const [boundEl, setBoundEl] = useState<HTMLDivElement | null>(null);

  // Drag and drop auto upload states
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      dragCounterRef.current += 1;
      setIsDraggingFiles(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      if (!isDraggingFiles) setIsDraggingFiles(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingFiles(false);

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      await handleNativeFileUpload(droppedFiles);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length > 0) {
      await handleNativeFileUpload(fileList);
    }
    e.target.value = '';
  };

  const formatName = (name: string, type: 'dir' | 'file') => {
    if (type === 'dir' || showExtensions) return name;
    const lastDot = name.lastIndexOf('.');
    return lastDot > 0 ? name.substring(0, lastDot) : name;
  };

  const toggleHiddenFiles = () => {
    setShowHidden((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(HIDDEN_FILES_PREFERENCE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const viewMenuProps = {
    items: [
      {
        key: 'checkboxes',
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'max-content' }}>
            <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: '#009688' }}>
              {showCheckboxes ? <CheckOutlined style={{ fontSize: 13 }} /> : null}
            </span>
            <span>{t('files.menuCheckboxes')}</span>
          </div>
        ),
        onClick: () => setShowCheckboxes((prev) => !prev),
      },
      {
        key: 'extensions',
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'max-content' }}>
            <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: '#009688' }}>
              {showExtensions ? <CheckOutlined style={{ fontSize: 13 }} /> : null}
            </span>
            <span>{t('files.menuExtensions')}</span>
          </div>
        ),
        onClick: () => setShowExtensions((prev) => !prev),
      },
      {
        key: 'hidden-files',
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'max-content' }}>
            <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: '#009688' }}>
              {showHidden ? <CheckOutlined style={{ fontSize: 13 }} /> : null}
            </span>
            <span>{t('files.menuHiddenFiles')}</span>
          </div>
        ),
        onClick: toggleHiddenFiles,
      },
    ].filter(Boolean),
  };

  const newMenuProps = {
    items: [
      {
        key: 'new-file',
        icon: <FileAddOutlined style={{ color: '#0078d4', fontSize: 14 }} />,
        label: 'Tệp tin trống',
        onClick: () => {
          form.setFieldsValue({ type: 'file', name: '' });
          setOpen(true);
        },
      },
      {
        key: 'new-folder',
        icon: <FolderAddOutlined style={{ color: '#FF9800', fontSize: 14 }} />,
        label: 'Thư mục',
        onClick: () => {
          form.setFieldsValue({ type: 'dir', name: '' });
          setOpen(true);
        },
      },
      { type: 'divider' },
      {
        key: 'upload-file',
        icon: <UploadOutlined style={{ color: '#009688', fontSize: 14 }} />,
        label: 'Tải lên',
        onClick: () => {
          nativeFileInputRef.current?.click();
        },
      },
    ],
  };
  // Tệp hiển thị được lấy từ API; chỉ giữ cache trong bộ nhớ cho thư mục đang mở.
  const [fs, setFs] = useState<Record<string, FileItem[]>>({});
  const saveFs = (newFs: Record<string, FileItem[]>) => setFs(newFs);

  const userUsedBytes = useMemo(() => {
    let total = 0;
    Object.values(fs).forEach(fileList => {
      fileList.forEach(f => {
        if (f.type === 'file' && f.sizeBytes) {
          total += f.sizeBytes;
        }
      });
    });
    return total;
  }, [fs]);

  const userUsedDisplay = useMemo(() => {
    if (userUsedBytes < 1024 * 1024) {
      return `${(userUsedBytes / 1024).toFixed(1)} KB`;
    }
    return `${(userUsedBytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [userUsedBytes]);

  const userQuotaBytes = userQuotaGB * 1024 * 1024 * 1024;
  const userUsedPercent = Math.min(100, parseFloat(((userUsedBytes / userQuotaBytes) * 100).toFixed(1)));

  const [fileContents, setFileContents] = useState<Record<string, string>>({});

  const saveFileContent = (fileKey: string, content: string) => {
    const updated = { ...fileContents, [fileKey]: content };
    setFileContents(updated);
  };

  const [fileDataUrls, setFileDataUrls] = useState<Record<string, string>>({});

  const saveFileDataUrl = (fileKey: string, dataUrl: string) => {
    const updated = { ...fileDataUrls, [fileKey]: dataUrl };
    setFileDataUrls(updated);
  };

  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [imgPreviewUrl, setImgPreviewUrl] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const [renameForm] = Form.useForm();
  const [permForm] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchAction, setBatchAction] = useState<string>('');
  const [clipboard, setClipboard] = useState<{ action: 'copy' | 'cut'; items: FileItem[] } | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{ visible: boolean, x: number, y: number, isContainer?: boolean } | null>(null);
  const [tooltipOpenKey, setTooltipOpenKey] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [recentPaths, setRecentPaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('minepanel_recent_paths');
      if (saved) {
        const parsed = JSON.parse(saved);
        const cleaned = (Array.isArray(parsed) ? parsed : []).filter(
          (p: string) => typeof p === 'string' && !p.includes('var/www') && !p.includes('etc/nginx') && !p.includes('Hợp_Đồng_Kinh_Tế') && !p.includes('Hồ_Sơ_Pháp_Lý')
        );
        if (cleaned.length > 0) return cleaned;
      }
    } catch (e) {}
    return ['/'];
  });

  // Digital Signature
  const [signOpen, setSignOpen] = useState(false);
  const [signFile, setSignFile] = useState<FileItem | null>(null);
  const [signPin, setSignPin] = useState('');
  // A local marker cannot prove that a document was signed. Only a completed
  // signing-provider transaction may supply this state.
  const signedFiles: Record<string, { signedAt: string; certNumber: string; signerName: string }> = {};

  const [signPosition, setSignPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>(() => {
    try {
      const saved = localStorage.getItem('kiyovn_signature_position');
      if (saved) return saved as any;
    } catch (e) {}
    return 'bottom-right';
  });
  const [signPage, setSignPage] = useState<'first' | 'last'>(() => {
    try {
      const saved = localStorage.getItem('kiyovn_signature_page');
      if (saved) return saved as any;
    } catch (e) {}
    return 'first';
  });

  const empProfile = dataService.getEmployeeProfile();
  const digisig = dataService.getEmployeeDigisig(empProfile?.code || 'EMP-951954');
  const currentCertNumber = digisig?.certNumber || 'Chưa cấp chứng thư';
  const currentUserDisplay = `${empProfile?.name || 'Nguyễn Huy Tùng'} (${empProfile?.code || 'EMP-951954'})`;
  const currentSignatureVisual = digisig?.signatureImage || digisig?.signatureText || empProfile?.name || 'Nguyễn Huy Tùng';

  const handleOpenDocxEditor = async (file: FileItem) => {
    const docType = /\.doc$/i.test(file.name) ? 'doc' : 'docx';
    const editorUrl = `/files/document/${docType}/${encodeURIComponent(file.key)}/edit`;
    localStorage.setItem(`doc_meta_${file.key}`, JSON.stringify(file));
    // Open immediately from the user's click. The separate page shows a
    // loading state while it fetches the document, avoiding a blank tab.
    const editorWindow = window.open(editorUrl, '_blank');
    if (!editorWindow) {
      message.error('Trình duyệt đã chặn tab soạn thảo. Hãy cho phép mở cửa sổ mới rồi thử lại.');
    }
  };

  const handleConfirmSignFile = async () => {
    if (!signFile) return;
    message.error('Không thể ký số: hệ thống chưa được kết nối dịch vụ ký số có chứng thư và khóa riêng được xác thực.');
  };

  const handleNativeFileUpload = async (fileList: File[]) => {
    if (!fileList.length) return;
    try {
      const uploads = await Promise.all(fileList.map(file => filesApi.upload(file, file.name, currentDirectoryId, 'files')));
      await revealStoredItem(uploads[0].data.file);
      message.success(`Đã tải lên thành công ${fileList.length} tệp tin.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Tải tệp lên thất bại.');
    }
  };

  // Update invisible bound div: top=thead top, bottom=win11-main bottom
  useEffect(() => {
    if (!boundEl) return;
    const mainEl = document.querySelector('.win11-main');
    const update = () => {
      const thead = document.querySelector('.win11-table .ant-table-thead tr th');
      if (!thead || !mainEl) return;
      const theadRect = thead.getBoundingClientRect();
      const mainRect = mainEl.getBoundingClientRect();
      // selection top boundary must not go above the table header's bottom
      const top = Math.max(theadRect.bottom, mainRect.top);
      boundEl.style.top = `${top}px`;
      boundEl.style.left = `${mainRect.left}px`;
      boundEl.style.width = `${mainRect.width}px`;
      boundEl.style.height = `${Math.max(0, mainRect.bottom - top)}px`;
    };
    update();
    window.addEventListener('resize', update);
    if (mainEl) {
      mainEl.addEventListener('scroll', update);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (mainEl) {
        mainEl.removeEventListener('scroll', update);
      }
    };
  }, [boundEl, viewMode]);


  const handlePathInputSubmit = (val: string) => {
    let cleanPath = val.trim();
    if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
    if (cleanPath.endsWith('/') && cleanPath !== '/') cleanPath = cleanPath.slice(0, -1);

    // The employee workspace is mounted as a virtual root in the UI. Keep the
    // cache path relative to that root, but always accept and remember the
    // complete employee path that the user sees in the address bar.
    const employeeRootPath = isVirtualEmployeeRoot ? `/${virtualRootLabel || 'Tệp của tôi'}` : '';
    let internalPath = cleanPath;
    if (employeeRootPath) {
      if (cleanPath === '/' || cleanPath === employeeRootPath) {
        internalPath = '/';
      } else if (cleanPath.startsWith(`${employeeRootPath}/`)) {
        internalPath = cleanPath.slice(employeeRootPath.length) || '/';
      } else {
        message.info(`Chỉ có thể truy cập các thư mục trong ${employeeRootPath}.`);
        setIsEditingPath(false);
        return;
      }
    }

    const parts = internalPath === '/' ? ['/'] : ['/', ...internalPath.split('/').filter(Boolean)];

    const visiblePath = employeeRootPath
      ? `${employeeRootPath}${internalPath === '/' ? '' : internalPath}`
      : internalPath;
    const newRecent = [visiblePath, ...recentPaths.filter(p => p !== visiblePath)].slice(0, 10);
    setRecentPaths(newRecent);
    localStorage.setItem('minepanel_recent_paths', JSON.stringify(newRecent));

    setPath(parts);
    setPathIds(prev => prev.slice(0, parts.length));
    setIsEditingPath(false);
  };

  useEffect(() => {
    const closeContextMenu = () => setContextMenuState(null);
    window.addEventListener('click', closeContextMenu);
    return () => window.removeEventListener('click', closeContextMenu);
  }, []);

  useEffect(() => {
    if (!isEditingPath) return;
    const handleOutsidePathClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.win11-path-container')) {
        setIsEditingPath(false);
      }
    };
    document.addEventListener('mousedown', handleOutsidePathClick);
    return () => document.removeEventListener('mousedown', handleOutsidePathClick);
  }, [isEditingPath]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (isDraggingRef.current) return;
      const target = e.target as HTMLElement;
      if (!target) return;

      // Exclude interactive containers from deselecting items
      if (
        target.closest('.ant-table-row') ||
        target.closest('.win11-grid-item') ||
        target.closest('.win11-cmd-bar') ||
        target.closest('.win11-address-bar') ||
        target.closest('.win11-footer') ||
        target.closest('.ant-modal') ||
        target.closest('.ant-popover') ||
        target.closest('.ant-tooltip') ||
        target.closest('.ant-dropdown') ||
        target.closest('.ant-select') ||
        target.closest('.ant-select-dropdown') ||
        target.closest('.ant-checkbox-wrapper') ||
        target.closest('.ant-table-thead') ||
        target.closest('.ant-pagination')
      ) {
        return;
      }

      // Check if click was on the scrollbar of win11-main
      const mainEl = document.querySelector('.win11-main');
      if (mainEl) {
        const rect = mainEl.getBoundingClientRect();
        const isClickOnScrollbar = e.clientX > rect.left + mainEl.clientWidth ||
                                   e.clientY > rect.top + mainEl.clientHeight;
        if (isClickOnScrollbar && mainEl.contains(target)) return;
      }

      setSelectedRowKeys([]);
      setLastSelectedKey(null);
    };

    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  const getCurrentPathString = () => path.length <= 1 ? '/' : '/' + path.slice(1).join('/');
  const currentPathStr = getCurrentPathString();
  const employeeRootPath = isVirtualEmployeeRoot ? `/${virtualRootLabel || 'Tệp của tôi'}` : '';
  const currentDisplayPath = employeeRootPath
    ? `${employeeRootPath}${currentPathStr === '/' ? '' : currentPathStr}`
    : currentPathStr;
  const employeeRecentPaths = employeeRootPath
    ? recentPaths.flatMap((recentPath) => {
      if (recentPath === '/') return [employeeRootPath];
      return recentPath === employeeRootPath || recentPath.startsWith(`${employeeRootPath}/`)
        ? [recentPath]
        : [];
    })
    : recentPaths;
  const visiblePathOptions = Array.from(new Set([
    currentDisplayPath,
    ...employeeRecentPaths,
    ...Object.keys(fs).map((cachedPath) => employeeRootPath
      ? `${employeeRootPath}${cachedPath === '/' ? '' : cachedPath}`
      : cachedPath),
  ]));
  const currentDirectoryId = pathIds[pathIds.length - 1] || null;
  const currentFiles = (fs[currentPathStr] || []).filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));
  const selectionContainsProtected = selectedRowKeys.some(key => currentFiles.find(item => item.key === key)?.isProtected)
    || Boolean(selectedFile?.isProtected);

  const loadDirectory = useCallback(async (directoryId = currentDirectoryId, pathKey = currentPathStr) => {
    try {
      const response = await filesApi.list(directoryId, showHidden, isEmployeeFilesRoute);
      const payload = response.data;
      const listed = payload.data.map(asFileItem);
      setCanShowHidden(payload.context.canShowHidden);
      if (!directoryId) {
        setIsVirtualEmployeeRoot(payload.context.isVirtualEmployeeRoot);
        setVirtualRootLabel(payload.context.rootLabel || '');
        if (!payload.context.isVirtualEmployeeRoot) {
          const rootFolderName = payload.context.rootLabel || 'Nhân Sự';
          const rootFolderItem: FileItem = {
            key: payload.context.parentId,
            name: rootFolderName,
            type: 'dir',
            size: '—',
            modified: '2026-08-29',
            isProtected: true,
            isSystem: true,
          };
          setFs(prev => ({
            ...prev,
            '/': [rootFolderItem],
            ['/' + rootFolderName]: listed,
          }));
          return;
        }
        setPathIds(prev => prev.length === 1 && prev[0] === null ? [payload.context.parentId] : prev);
      }
      setFs(prev => ({ ...prev, [pathKey]: listed }));
    } catch (error: any) {
      const messageText = error?.response?.data?.message || 'Không thể tải danh sách tệp từ máy chủ.';
      message.error(messageText);
    }
  }, [currentDirectoryId, currentPathStr, isEmployeeFilesRoute, showHidden]);

  const revealStoredItem = useCallback(async (_item: StoredFileNode) => {
    // Keep the user in the directory where they chose to upload or create an
    // item. System-generated files still target System at the server level.
    await loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const [lastSelectedKey, setLastSelectedKey] = useState<React.Key | null>(null);

  const handleRowClick = (e: React.MouseEvent, record: FileItem) => {
    const { ctrlKey, metaKey, shiftKey } = e;

    if (shiftKey && lastSelectedKey) {
      const nodes = document.querySelectorAll('.win11-main .ant-table-row, .win11-main .win11-grid-item');
      const keysInView = Array.from(nodes).map(el => (el as HTMLElement).dataset.rowKey || (el as HTMLElement).dataset.key).filter(Boolean) as string[];

      const startIndex = keysInView.indexOf(String(lastSelectedKey));
      const endIndex = keysInView.indexOf(String(record.key));

      if (startIndex !== -1 && endIndex !== -1) {
        const min = Math.min(startIndex, endIndex);
        const max = Math.max(startIndex, endIndex);
        const rangeKeys = keysInView.slice(min, max + 1);

        if (ctrlKey || metaKey) {
          const newKeys = new Set([...selectedRowKeys, ...rangeKeys]);
          setSelectedRowKeys(Array.from(newKeys));
        } else {
          setSelectedRowKeys(rangeKeys);
        }
      }
      return;
    }

    if (ctrlKey || metaKey) {
      if (selectedRowKeys.includes(record.key)) {
        setSelectedRowKeys(selectedRowKeys.filter(k => k !== record.key));
      } else {
        setSelectedRowKeys([...selectedRowKeys, record.key]);
      }
    } else {
      setSelectedRowKeys([record.key]);
    }
    setLastSelectedKey(record.key);
  };

  const handleNavigate = (dir: FileItem) => {
    setPath(prev => [...prev, dir.name]);
    setPathIds(prev => [...prev, dir.key]);
    setSelectedRowKeys([]);
    setSelectedFile(null);
  };
  const handleBreadcrumbClick = (index: number) => {
    setPath(prev => prev.slice(0, index + 1));
    setPathIds(prev => prev.slice(0, index + 1));
    setSelectedRowKeys([]);
  };
  const handleGoBack = () => {
    if (path.length <= 1) return;
    setPath(prev => prev.slice(0, -1));
    setPathIds(prev => prev.slice(0, -1));
    setSelectedRowKeys([]);
  };

  const handleDelete = async (key: string) => {
    const target = currentFiles.find(item => item.key === key) || selectedFile;
    if (target?.isProtected) {
      message.error('Không thể xóa thư mục hệ thống được bảo vệ.');
      return;
    }
    try {
      await filesApi.remove(key);
      await loadDirectory();
      message.success(t('files.msgSuccessDelete'));
      setSelectedRowKeys(prev => prev.filter(k => k !== key));
      if (selectedFile?.key === key) setSelectedFile(null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể xóa tệp.');
    }
  };

  const handleDeleteBatch = async () => {
    if (!selectedRowKeys.length) return;
    const targets = currentFiles.filter(item => selectedRowKeys.includes(item.key));
    if (targets.some(item => item.isProtected)) {
      message.error('Lựa chọn có thư mục hệ thống được bảo vệ, không thể xóa.');
      return;
    }
    try {
      await Promise.all(targets.map(item => filesApi.remove(item.key)));
      await loadDirectory();
      message.success(t('files.msgSuccessDeleteBatch').replace('{count}', String(targets.length)));
      setSelectedRowKeys([]);
      setSelectedFile(null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể xóa các mục đã chọn.');
    }
  };

  const handleDownload = async (name: string, fileKey?: string) => {
    message.loading({ content: `Đang chuẩn bị tải về tệp "${name}"...`, key: 'dl_file' });
    try {
      const key = fileKey || currentFiles.find(f => f.name === name)?.key;
      if (!key) throw new Error('Không tìm thấy mã tệp.');
      const response = await filesApi.download(key);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      message.success({ content: `Đã tải xuống thành công tệp "${name}"!`, key: 'dl_file', duration: 2 });
    } catch (e) {
      message.error({ content: `Tải xuống tệp "${name}" thất bại!`, key: 'dl_file' });
    }
  };

  const handleUpload = () => {
    form.validateFields().then(async values => {
      const isDir = values.type === 'dir';
      const name = values.name.trim();
      try {
        const response = isDir
          ? await filesApi.createFolder(name, currentDirectoryId, 'files')
          : await filesApi.upload(new Blob([], { type: 'text/plain' }), name, currentDirectoryId, 'files');
        await revealStoredItem(response.data.file);
        message.success(isDir ? t('files.msgSuccessCreateDir') : t('files.msgSuccessCreateFile'));
        form.resetFields();
        setOpen(false);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể tạo mục mới.');
      }
    });
  };

  const handleRename = () => {
    renameForm.validateFields().then(async values => {
      if (!selectedFile) return;
      const newName = values.newName.trim();
      if (selectedFile.isProtected) {
        message.error('Không thể đổi tên thư mục hệ thống được bảo vệ.');
        return;
      }
      try {
        await filesApi.update(selectedFile.key, newName);
        await loadDirectory();
        message.success(t('files.msgSuccessRename'));
        setRenameOpen(false);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể đổi tên mục này.');
      }
    });
  };

  const handlePermission = () => {
    permForm.validateFields().then(values => {
      if (!selectedFile) return;
      if (selectedFile.isProtected) {
        message.error('Quyền của thư mục hệ thống được máy chủ khóa.');
        return;
      }
      message.info('Quyền truy cập được quản lý tập trung theo tài khoản và chưa thể sửa từ màn hình này.');
      setPermOpen(false);
    });
  };

  const handleCompress = () => {
    if (!selectedRowKeys.length && !selectedFile) { message.warning(t('files.msgSelectAtLeastOne')); return; }
    message.loading({ content: t('files.msgLoadingCompress'), key: 'compress' });
    setTimeout(() => message.success({ content: t('files.msgSuccessCompress'), key: 'compress', duration: 2 }), 1500);
  };

  const handleExtract = () => {
    if (!selectedFile) return;
    message.loading({ content: t('files.msgLoadingExtract').replace('{name}', selectedFile.name), key: 'extract' });
    setTimeout(() => message.success({ content: t('files.msgSuccessExtract'), key: 'extract', duration: 2 }), 1500);
  };

  const handleCopy = () => {
    const items = selectedRowKeys.map(k => currentFiles.find(f => f.key === k)!).filter(Boolean);
    if (items.some(item => item.isProtected)) {
      message.error('Không thể sao chép thư mục hệ thống được bảo vệ.');
      return;
    }
    if (items.length) { setClipboard({ action: 'copy', items }); message.success(t('files.msgClipboardCopied')); }
  };

  const handleCut = () => {
    const items = selectedRowKeys.map(k => currentFiles.find(f => f.key === k)!).filter(Boolean);
    if (items.some(item => item.isProtected)) {
      message.error('Không thể di chuyển thư mục hệ thống được bảo vệ.');
      return;
    }
    if (items.length) { setClipboard({ action: 'cut', items }); message.success(t('files.msgClipboardCut')); }
  };

  const handleExecuteBatch = () => {
    if (!batchAction) {
      message.warning(t('files.msgSelectAction'));
      return;
    }
    if (selectedRowKeys.length === 0) {
      message.warning(t('files.msgSelectAtLeastOne'));
      return;
    }
    if (batchAction === 'copy') handleCopy();
    else if (batchAction === 'cut') handleCut();
    else if (batchAction === 'compress') handleCompress();
    else if (batchAction === 'delete') handleDeleteBatch();
  };

  const handlePaste = () => {
    if (!clipboard) return;
    message.info('Sao chép và di chuyển tệp sẽ được thực hiện trực tiếp trên máy chủ ở bước mở rộng tiếp theo.');
  };

  const getDefaultContentForFile = (name: string) => {
    const clean = name.replace(/_/g, ' ');
    if (name.endsWith('.pdf')) {
      return `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n---------------------------------------------\n\n${clean.replace(/\.pdf$/i, '').toUpperCase()}\n\nCăn cứ theo Luật Doanh Nghiệp 2020 và Điều lệ Công ty Cổ phần Công nghệ KIYOVN.\nHồ sơ số: KIYO-DOC-2026/0889\nĐơn vị ban hành: Ban Giám Đốc Công ty Cổ phần Công nghệ KIYOVN\nNgày hiệu lực: 01/01/2026\n\nNỘI DUNG VĂN BẢN:\n1. Phê duyệt và áp dụng chính thức quy trình nghiệp vụ số hóa và chữ ký số trên toàn hệ thống.\n2. Tất cả các văn bản, hợp đồng, chứng từ được lưu trữ và mã hóa SHA-256 an toàn.\n3. Văn bản có giá trị pháp lý nội bộ và báo cáo cơ quan ban ngành theo quy định.\n\n[ĐÃ XÁC THỰC CHỮ KÝ SỐ DOANH NGHIỆP - ROOT CA KIYOVN]`;
    }
    if (name.endsWith('.xlsx')) {
      return `BẢNG TỔNG HỢP SỐ LIỆU DOANH NGHIỆP - ${clean.replace(/\.xlsx$/i, '')}\n========================================================================================\nSTT | MÃ MỤC | DANH MỤC NGHIỆP VỤ | ĐƠN VỊ | SỐ LƯỢNG | ĐƠN GIÁ (VNĐ) | THÀNH TIỀN (VNĐ)\n01  | REV-01 | Doanh thu Dịch vụ Cloud | Gói | 120 | 25,000,000 | 3,000,000,000\n02  | REV-02 | Bản quyền phần mềm ERP | License | 450 | 4,500,000 | 2,025,000,000\n03  | EXP-01 | Chi phí hạ tầng Data Center | Tháng | 12 | 120,000,000 | 1,440,000,000\n04  | EXP-02 | Chi phí lương & BHXH nhân sự | Tháng | 12 | 680,000,000 | 8,160,000,000\n----------------------------------------------------------------------------------------\nTỔNG CỘNG DOANH THU THỰC TẾ: 18,450,000,000 VNĐ`;
    }
    if (name.endsWith('.docx')) {
      return `CÔNG TY CỔ PHẦN CÔNG NGHỆ KIYOVN\nSố: 108/2026/QĐ-KIYO\n\n${clean.replace(/\.docx?$/i, '').toUpperCase()}\n\nĐiều 1. Ban hành quy chuẩn quản lý và vận hành thông tin doanh nghiệp điện tử.\nĐiều 2. Các phòng ban chức năng: Kỹ thuật, Kế toán, Nhân sự, Pháp chế chịu trách nhiệm thi hành.\nĐiều 3. Quyết định có hiệu lực thi hành kể từ ngày ký.`;
    }
    if (name.endsWith('.cer')) {
      return `-----BEGIN CERTIFICATE-----\nMIIFdzCCA1+gAwIBAgIUQi81q1f6bY...KIYOVN.ENTERPRISE.ROOT.CA\nIssuer: C=VN, O=KIYOVN Technology JSC, CN=KIYO Internal Root CA\nSubject: C=VN, O=KIYOVN Technology JSC, CN=KIYO Enterprise Secure Digital Signature\nValidity:\n  Not Before: Jan  1 00:00:00 2026 GMT\n  Not After : Jan  1 00:00:00 2036 GMT\n-----END CERTIFICATE-----`;
    }
    if (name.endsWith('.log')) {
      return `[2026-08-27 00:00:01] [INFO] [SecurityEngine] System audit log initialized.\n[2026-08-27 00:00:05] [INFO] [AuthService] SuperAdmin authentication verified with FIDO2 Passkey.\n[2026-08-27 00:15:22] [INFO] [Database] Daily backup snapshot completed successfully (SHA256 locked).\n[2026-08-27 00:20:10] [INFO] [DigitalSignature] Document signed and verified with PKI CA.`;
    }
    return `// KIYOVN Enterprise System File\n// File: ${name}\n// Last Modified: ${new Date().toLocaleString()}\n\n{\n  "system": "KIYOVN ERP Core",\n  "status": "active",\n  "encrypted": true,\n  "version": "3.5.0"\n}`;
  };

  const handlePreview = async (file: FileItem) => {
    if (file.type === 'dir') return;

    if (file.name.match(/\.docx?$/i)) {
      await handleOpenDocxEditor(file);
      return;
    }

    const isImage = Boolean(file.mime?.startsWith('image/')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
    const isVideo = Boolean(file.mime?.startsWith('video/')) || /\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'docx';
    const hashKey = generateFileHash(file.key, file.name);

    try {
      let imageBlob: Blob | null = await getFileBlob(file.key);

      if (!imageBlob) {
        const response = await filesApi.download(file.key);
        if (response.data instanceof Blob) {
          if (response.data.type.includes('json')) {
            const text = await response.data.text();
            try {
              const err = JSON.parse(text);
              message.error(err.message || 'Không thể tải tệp hình ảnh.');
              return;
            } catch {}
          }
          imageBlob = response.data;
        }
      }

      if (isImage) {
        if (imageBlob) {
          if (imgPreviewUrl) URL.revokeObjectURL(imgPreviewUrl);
          const newUrl = URL.createObjectURL(imageBlob);
          setPreviewFile(file);
          setVideoPreviewUrl(null);
          setImgPreviewUrl(newUrl);
          setPreviewOpen(true);
        } else {
          message.error('Dữ liệu hình ảnh không hợp lệ.');
        }
        return;
      }

      if (isVideo) {
        if (imageBlob) {
          if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
          const playableBlob = imageBlob.type.startsWith('video/')
            ? imageBlob
            : new Blob([imageBlob], { type: file.mime || 'video/mp4' });
          const newUrl = URL.createObjectURL(playableBlob);
          setPreviewFile(file);
          setImgPreviewUrl(null);
          setVideoPreviewUrl(newUrl);
          setPreviewOpen(true);
        } else {
          message.error('Dữ liệu video không hợp lệ.');
        }
        return;
      }

      if (imageBlob) {
        await storeFileBlob(file.key, imageBlob);
        await storeFileBlob(hashKey, imageBlob);
      }
      localStorage.setItem('doc_meta_' + hashKey, JSON.stringify(file));
      localStorage.setItem('doc_meta_' + file.key, JSON.stringify(file));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể mở tệp từ máy chủ.');
      return;
    }

    const url = `/files/document/${ext}/${hashKey}/edit`;
    window.open(url, '_blank');
  };

  const closeMediaPreview = () => {
    setPreviewOpen(false);
    if (imgPreviewUrl) {
      URL.revokeObjectURL(imgPreviewUrl);
    }
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setImgPreviewUrl(null);
    setVideoPreviewUrl(null);
    setPreviewFile(null);
  };
  const closeImagePreview = closeMediaPreview;

  useEffect(() => () => {
    if (imgPreviewUrl) URL.revokeObjectURL(imgPreviewUrl);
  }, [imgPreviewUrl]);

  useEffect(() => () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
  }, [videoPreviewUrl]);

  function handleContextMenu(e: React.MouseEvent, record: FileItem) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFile(record);
    setSelectedRowKeys([record.key]);
    const clampedX = Math.min(e.clientX, window.innerWidth - 190);
    const clampedY = Math.min(e.clientY, window.innerHeight - 320);
    setContextMenuState({ visible: true, x: clampedX, y: clampedY, isContainer: false });
  }

  function handleContainerContextMenu(e: React.MouseEvent) {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest('.ant-table-row') || target.closest('.win11-grid-item')) {
      return;
    }
    e.preventDefault();
    setSelectedFile(null);
    const clampedX = Math.min(e.clientX, window.innerWidth - 190);
    const clampedY = Math.min(e.clientY, window.innerHeight - 260);
    setContextMenuState({ visible: true, x: clampedX, y: clampedY, isContainer: true });
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedRowKeys(currentFiles.map(f => f.key));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const columns = [
    {
      title: t('files.columnName'),
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 170,
      render: (v: string, r: FileItem) => (
        <div
          style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', maxWidth: '100%', userSelect: 'none' }}
          onClick={(e) => {
            e.stopPropagation();
            if (r.type === 'dir') handleNavigate(r);
            else handlePreview(r);
          }}
          onContextMenu={(e) => handleContextMenu(e, r)}
        >
          <Space size={6} style={{ maxWidth: '100%' }}>
          {r.type === 'dir' ? <FolderOutlined style={{ color: '#FF9800', fontSize: 16, flexShrink: 0 }} /> : <FileOutlined style={{ color: '#999', fontSize: 16, flexShrink: 0 }} />}
          <Text style={{ color: r.type === 'dir' ? '#009688' : '#333', fontWeight: r.type === 'dir' ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            {formatName(v, r.type)}
          </Text>
          {signedFiles[r.key] && (
            <Tag color="success" style={{ marginLeft: 6, fontSize: 11, padding: '0 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <SafetyCertificateOutlined /> Đã ký số
            </Tag>
          )}
        </Space>
        </div>
      ),
      sorter: (a: FileItem, b: FileItem) => a.name.localeCompare(b.name),
    },
    { title: t('files.columnType'), dataIndex: 'type', key: 'type', width: 90, render: (v: string) => <Tag color={v === 'dir' ? 'orange' : 'default'} style={{ borderRadius: 4 }}>{v === 'dir' ? t('files.typeDir') : t('files.typeFile')}</Tag> },
    { title: t('files.columnSize'), dataIndex: 'size', key: 'size', width: 100, sorter: (a: FileItem, b: FileItem) => parseInt(a.size) - parseInt(b.size) || 0 },
    { title: t('files.columnOwner'), dataIndex: 'owner', key: 'owner', width: 120, render: (v: string) => <Text style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</Text> },
    { title: t('files.columnGroup'), dataIndex: 'group', key: 'group', width: 90, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: t('files.columnPermission'), dataIndex: 'permission', key: 'permission', width: 85, render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: t('files.columnFormat'), dataIndex: 'mime', key: 'mime', width: 110, render: (v: string, r: FileItem) => {
        if (r.type === 'dir') return <Text style={{ fontSize: 12, color: '#999' }}>File folder</Text>;
        const lastDot = r.name.lastIndexOf('.');
        let typeStr = 'File';
        if (lastDot >= 0 && r.name.length > lastDot + 1) {
          typeStr = `${r.name.substring(lastDot + 1).toUpperCase()} File`;
        }
        return <Text style={{ fontSize: 12, color: '#999' }}>{typeStr}</Text>;
      }
    },
    { title: t('files.columnModified'), dataIndex: 'modified', key: 'modified', width: 170, sorter: (a: FileItem, b: FileItem) => a.modified.localeCompare(b.modified) },
    {
      title: t('files.columnActions'), key: 'actions', width: 85, align: 'right' as const,
      render: (_: any, r: FileItem) => (
        <Space size="small">
          <Dropdown
            placement="bottomRight"
            trigger={['click']}
            menu={{
              items: [
                { key: 'preview', icon: <EyeOutlined />, label: t('files.preview'), onClick: () => handlePreview(r) },
                r.name.match(/\.docx?$/i) ? { key: 'edit-doc', icon: <FileWordOutlined style={{ color: '#2B579A' }} />, label: 'Soạn thảo văn bản (.docx)', onClick: () => handleOpenDocxEditor(r) } : null,
                { key: 'sign', icon: <SafetyCertificateOutlined style={{ color: '#009688' }} />, label: 'Ký số', onClick: () => { setSelectedFile(r); setSignFile(r); setSignPin(''); setSignOpen(true); }, disabled: r.type === 'dir' },
                { key: 'rename', icon: <EditOutlined />, label: t('files.rename'), onClick: () => { setSelectedFile(r); renameForm.setFieldsValue({ newName: r.name }); setRenameOpen(true); }, disabled: r.isProtected },
                { key: 'copy', icon: <CopyOutlined />, label: t('files.copy'), onClick: handleCopy, disabled: r.isProtected },
                { key: 'cut', icon: <ScissorOutlined />, label: t('files.cut'), onClick: handleCut, disabled: r.isProtected },
                { key: 'compress', icon: <FileZipOutlined />, label: t('files.compress'), onClick: () => { setSelectedFile(r); handleCompress(); } },
                r.name.endsWith('.zip') ? { key: 'extract', icon: <UnlockOutlined />, label: t('files.extract'), onClick: () => { setSelectedFile(r); handleExtract(); } } : null,
                { key: 'permission', icon: <InfoCircleOutlined />, label: t('files.modalPermTitle'), onClick: () => { setSelectedFile(r); permForm.setFieldsValue({ permission: r.permission, owner: r.owner, group: r.group }); setPermOpen(true); } },
                { type: 'divider' },
                { key: 'download', icon: <DownloadOutlined />, label: t('files.download'), onClick: () => handleDownload(r.name, r.key), disabled: r.type === 'dir' },
              ].filter(Boolean) as any,
              style: { minWidth: 'fit-content', width: 'max-content' }
            }}
          >
            <Button size="small" icon={<DownOutlined style={{ fontSize: 10 }} />} />
          </Dropdown>
          {!r.isProtected && <Popconfirm
            title={t('files.msgDeleteSingleConfirm').replace('{name}', r.name)}
            placement="left"
            onConfirm={() => handleDelete(r.key)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>}
        </Space>
      ),
    },
  ];

  const uploadProps: UploadProps = {
    beforeUpload: async (file) => {
      try {
        const response = await filesApi.upload(file, file.name, currentDirectoryId, 'files');
        await revealStoredItem(response.data.file);
        message.success(t('files.msgSuccessUpload').replace('{name}', file.name));
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Tải tệp lên thất bại.');
      }
      return false;
    },
    showUploadList: false,
  };

  return (
    <div
      className="win11-frame"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingFiles && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(224, 242, 241, 0.92)',
            backdropFilter: 'blur(3px)',
            border: '2.5px dashed #009688',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(0, 150, 136, 0.25)',
            }}
          >
            <UploadOutlined style={{ fontSize: 36, color: '#009688' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#00796B', margin: '0 0 4px 0' }}>
              Thả tệp tin vào đây để tự động tải lên
            </p>
            <p style={{ fontSize: 13, color: '#004D40', margin: 0 }}>
              Tải lên thư mục: <strong style={{ color: '#00796B' }}>{currentDisplayPath}</strong>
            </p>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={nativeFileInputRef}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      {/* Command Bar */}
      <div className="win11-cmd-bar">
        <div className="win11-cmd-group">
          <Dropdown menu={newMenuProps} trigger={['click']} placement="bottomLeft">
            <button className="win11-cmd-btn">
              <PlusOutlined style={{ color: '#0078d4' }} /> {t('files.new')}
            </button>
          </Dropdown>
        </div>
        <div className="win11-cmd-group">
          <button className={`win11-cmd-btn ${(!selectedRowKeys.length && !selectedFile) || selectionContainsProtected ? 'disabled' : ''}`} onClick={handleCut}><ScissorOutlined /> {t('files.cut')}</button>
          <button className={`win11-cmd-btn ${(!selectedRowKeys.length && !selectedFile) || selectionContainsProtected ? 'disabled' : ''}`} onClick={handleCopy}><CopyOutlined /> {t('files.copy')}</button>
          <button className={`win11-cmd-btn ${!clipboard ? 'disabled' : ''}`} onClick={handlePaste}><SnippetsOutlined /> {t('files.paste')}</button>
        </div>
        <div className="win11-cmd-group">
          <button className={`win11-cmd-btn ${(selectedRowKeys.length !== 1 && !selectedFile) || selectionContainsProtected ? 'disabled' : ''}`} onClick={() => {
            const item = selectedFile || currentFiles.find(f => f.key === selectedRowKeys[0]);
            if (item && !item.isProtected) { setSelectedFile(item); renameForm.setFieldsValue({ newName: item.name }); setRenameOpen(true); }
          }}><EditOutlined /> {t('files.rename')}</button>
          <Popconfirm
            title={selectedRowKeys.length > 0 ? t('files.msgDeleteBatchConfirm').replace('{count}', String(selectedRowKeys.length)) : t('files.msgDeleteSingleConfirm').replace('{name}', selectedFile?.name || '')}
            description={t('files.msgDeleteBatchDesc')}
            onConfirm={() => {
              if (selectedRowKeys.length) handleDeleteBatch();
              else if (selectedFile) handleDelete(selectedFile.key);
            }}
            okText={t('common.delete')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true, style: { color: 'black' } }}
            disabled={(!selectedRowKeys.length && !selectedFile) || selectionContainsProtected}
          >
            <button className={`win11-cmd-btn ${(!selectedRowKeys.length && !selectedFile) || selectionContainsProtected ? 'disabled' : ''}`}>
              <DeleteOutlined style={{ color: '#d13438' }} /> {t('files.delete')}
            </button>
          </Popconfirm>
        </div>
        <div className="win11-cmd-group" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tooltip title={`Đã dùng ${userUsedDisplay} trên tổng số ${userQuotaGB} GB hạn mức tài khoản`}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', background: '#F8FAFC', padding: '3px 9px', borderRadius: 4, border: '1px solid #E2E8F0', userSelect: 'none' }}>
              <HddOutlined style={{ color: '#009688', fontSize: 13 }} />
              <span>Dung lượng {userUsedDisplay} / {userQuotaGB} GB</span>
            </div>
          </Tooltip>
        </div>
        <div className="win11-cmd-group" style={{ borderRight: 'none', marginLeft: 'auto' }}>
          <Dropdown menu={viewMenuProps} trigger={['click']} placement="bottomRight">
            <button className="win11-cmd-btn"><EyeOutlined style={{ color: '#0078d4' }} /> {t('files.display')}</button>
          </Dropdown>
          <Segmented options={[{ label: <><UnorderedListOutlined /> {t('files.viewModeList')}</>, value: 'list' }, { label: <><AppstoreOutlined /> {t('files.viewModeGrid')}</>, value: 'grid' }]} value={viewMode} onChange={(v) => setViewMode(v as 'list' | 'grid')} />
        </div>
      </div>

      {/* Address Bar */}
      <div className="win11-address-bar">
        <button className="win11-nav-btn" onClick={handleGoBack} disabled={path.length <= 1}><ArrowLeftOutlined /></button>
        <button className="win11-nav-btn" disabled><ArrowRightOutlined /></button>

        <div
          className="win11-path-container"
          style={{ cursor: 'text' }}
          onClick={() => {
            setPathInput(currentDisplayPath);
            setIsEditingPath(true);
          }}
        >
          {isEditingPath ? (
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
              <FolderOutlined style={{ color: '#FF9800', marginRight: 8, flexShrink: 0 }} />
              <AutoComplete
                autoFocus
                value={pathInput}
                options={visiblePathOptions
                  .filter(p => p && p !== '/var/www' && p !== '/etc/nginx' && !p.includes('Hợp_Đồng_Kinh_Tế') && !p.includes('Hồ_Sơ_Pháp_Lý'))
                  .map(p => ({ value: p }))}
                onChange={setPathInput}
                onSelect={(val: string) => {
                  handlePathInputSubmit(val);
                }}
                style={{ flex: 1, height: '100%' }}
              >
                <Input
                  autoFocus
                  bordered={false}
                  style={{
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    height: '100%',
                    fontSize: 13,
                    color: '#202020',
                    width: '100%',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePathInputSubmit(pathInput);
                    else if (e.key === 'Escape') setIsEditingPath(false);
                  }}
                />
              </AutoComplete>
            </div>
          ) : (
            <>
              <FolderOutlined style={{ color: '#FF9800', marginRight: 8 }} />
              <div style={{ display: 'flex', alignItems: 'center', height: '100%', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>

                {path.map((p, i) => {
                  const stepPathStr = i === 0 ? '/' : '/' + path.slice(1, i + 1).join('/');
                  const subdirs = (fs[stepPathStr] || []).filter(f => f.type === 'dir');
                  const menuItems = subdirs.map(d => ({
                    key: d.name,
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 6, width: 'max-content' }}>
                        <FolderOutlined style={{ color: '#FF9800', fontSize: 13 }} />
                        <span>{d.name}</span>
                      </div>
                    ),
                    onClick: () => {
                      setPath([...path.slice(0, i + 1), d.name]);
                      setPathIds([...pathIds.slice(0, i + 1), d.key]);
                    }
                  }));

                  return (
                    <React.Fragment key={i}>
                      <span
                        className="win11-breadcrumb-item"
                        onClick={(e) => { e.stopPropagation(); handleBreadcrumbClick(i); }}
                      >
                        {i === 0 ? (isVirtualEmployeeRoot ? (virtualRootLabel || 'Nhân Sự') : '/') : p}
                      </span>
                      {i < path.length - 1 || menuItems.length > 0 ? (
                        <Dropdown
                          menu={{ items: menuItems, style: { maxHeight: '300px', overflowY: 'auto' } }}
                          trigger={['click']}
                          disabled={menuItems.length === 0}
                          placement="bottomLeft"
                        >
                          <span
                            className="win11-breadcrumb-separator"
                            style={{ cursor: menuItems.length > 0 ? 'pointer' : 'default' }}
                          >
                            <RightOutlined style={{ fontSize: 10, strokeWidth: 4 }} />
                          </span>
                        </Dropdown>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </div>
              {/* Flex spacer to allow clicking empty space to edit */}
              <div style={{ flex: 1, height: '100%', cursor: 'text' }} onClick={() => {
                setPathInput(currentDisplayPath);
                setIsEditingPath(true);
              }} />
            </>
          )}
        </div>

        <input
          type="text"
          className="win11-search-input"
          placeholder="Tìm kiếm..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: 8, outline: 'none' }}
        />
      </div>

      {/* Main Content Area */}
      <div
        className="win11-main"
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={handleContainerContextMenu}
      >
          {viewMode === 'grid' ? (
            <div className="win11-grid-container">
              <div className="win11-grid-wrapper">
                {currentFiles
                  .filter(f => search ? f.name.toLowerCase().includes(search.toLowerCase()) : true)
                  .map(item => {
                    const isSelected = selectedRowKeys.includes(item.key);
                    const ext = item.name.split('.').pop()?.toLowerCase() || '';
                    const isImg = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext);
                    const imgUrl = isImg ? fileDataUrls[item.key] : null;

                    let fileIcon = <FileOutlined style={{ fontSize: 44, color: '#64748B' }} />;
                    if (item.type === 'dir') {
                      fileIcon = <FolderOutlined style={{ fontSize: 44, color: '#F59E0B' }} />;
                    } else if (ext === 'pdf') {
                      fileIcon = <FilePdfOutlined style={{ fontSize: 44, color: '#E11D48' }} />;
                    } else if (['doc', 'docx'].includes(ext)) {
                      fileIcon = <FileWordOutlined style={{ fontSize: 44, color: '#2563EB' }} />;
                    } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
                      fileIcon = <FileExcelOutlined style={{ fontSize: 44, color: '#16A34A' }} />;
                    } else if (isImg) {
                      fileIcon = <FileImageOutlined style={{ fontSize: 44, color: '#8B5CF6' }} />;
                    } else if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
                      fileIcon = <FileZipOutlined style={{ fontSize: 44, color: '#D97706' }} />;
                    } else if (['txt', 'log', 'md', 'json', 'xml', 'yml', 'yaml'].includes(ext)) {
                      fileIcon = <FileTextOutlined style={{ fontSize: 44, color: '#009688' }} />;
                    }

                    return (
                      <div
                        key={item.key}
                        data-key={item.key}
                        className={`win11-grid-item ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => {
                          handleRowClick(e, item);
                          if (window.innerWidth <= 768) {
                            if (item.type === 'dir') handleNavigate(item);
                            else handlePreview(item);
                          }
                        }}
                        onDoubleClick={() => item.type === 'dir' ? handleNavigate(item) : handlePreview(item)}
                        onContextMenu={(e) => handleContextMenu(e, item)}
                      >
                        {/* Thumbnail / Icon Container */}
                        <div className="win11-grid-item-thumb">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={item.name}
                              style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                borderRadius: 2,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                              }}
                            />
                          ) : (
                            fileIcon
                          )}
                        </div>

                        {/* File Name (up to 2 lines with ellipsis) */}
                        <div
                          title={item.name}
                          className="win11-grid-item-name"
                        >
                          {formatName(item.name, item.type)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <>
              <Table<FileItem>
                className="win11-table"
                dataSource={currentFiles.filter(f => search ? f.name.toLowerCase().includes(search.toLowerCase()) : true)}
                columns={columns}
                pagination={false}
                scroll={{ x: 700 }}
                size="middle"
                locale={{ emptyText: t('common.emptyFolder') }}
                rowSelection={showCheckboxes ? { selectedRowKeys, onChange: setSelectedRowKeys, columnWidth: 24 } : undefined}
                rowClassName={(record: FileItem) => selectedRowKeys.includes(record.key) ? 'ant-table-row-selected' : ''}
                onRow={(record: FileItem) => ({
                  onClick: (e: React.MouseEvent) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.closest('.ant-checkbox-wrapper') ||
                      target.closest('.ant-checkbox') ||
                      target.closest('button') ||
                      target.closest('.ant-dropdown') ||
                      target.closest('.ant-table-selection-column')
                    ) {
                      return;
                    }
                    handleRowClick(e, record);
                    if (window.innerWidth <= 768) {
                      if (record.type === 'dir') handleNavigate(record);
                      else handlePreview(record);
                    }
                  },
                  onDoubleClick: () => record.type === 'dir' ? handleNavigate(record) : handlePreview(record),
                  onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, record)
                })}
              />
            </>
          )}
          {/* Invisible bound div: top=thead top, bottom=win11-main bottom */}
          <div
            ref={setBoundEl}
            style={{ position: 'fixed', pointerEvents: 'none', opacity: 0, zIndex: -1 }}
          />
          {!isMobile && (
            <Selecto
              dragContainer={".win11-main"}
              boundContainer={viewMode === 'list' ? (boundEl ?? undefined) : ".win11-main"}
              dragCondition={(e) => {
                const target = e.inputEvent.target as HTMLElement;
                if (
                  target.closest('.ant-table-thead') ||
                  target.closest('button') ||
                  target.closest('.ant-select') ||
                  target.closest('.ant-dropdown') ||
                  target.closest('.ant-checkbox-wrapper') ||
                  target.closest('.ant-table-selection-column') ||
                  target.closest('input')
                ) {
                  return false;
                }
                const mainEl = document.querySelector('.win11-main');
                return mainEl ? mainEl.contains(target) : false;
              }}
              selectableTargets={['.win11-main .ant-table-row', '.win11-main .win11-grid-item']}
              hitRate={0}
              selectByClick={false}
              selectFromInside={true}
              toggleContinueSelect={['ctrl', 'meta']}
              keyContainer={window}
              onDragStart={(e) => {
                if (e.inputEvent.target.closest('.ant-checkbox-wrapper') ||
                    e.inputEvent.target.closest('.ant-table-selection-column') ||
                    e.inputEvent.target.closest('.ant-table-thead') ||
                    e.inputEvent.target.closest('.ant-pagination') ||
                    e.inputEvent.target.closest('.ant-btn') ||
                    e.inputEvent.target.closest('.ant-dropdown-trigger') ||
                    e.inputEvent.button !== 0) {
                  e.stop();
                  return;
                }
                isDraggingRef.current = true;
              }}
              onDragEnd={() => {
                setTimeout(() => {
                  isDraggingRef.current = false;
                }, 100);
              }}
              onSelect={(e) => {
                if (!isDraggingRef.current) return;
                const keys = e.selected.map(el => el.getAttribute('data-key') || el.getAttribute('data-row-key')).filter(Boolean) as string[];
                setSelectedRowKeys(keys);
              }}
            />
          )}

        </div>

      {/* Batch Actions Footer always at the bottom */}
      <div className="win11-footer" style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', background: '#ffffff' }}>
        <Space size={4}>
          <Checkbox
            style={{ marginLeft: 0, marginRight: 10 }}
            indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < currentFiles.length}
            checked={currentFiles.length > 0 && selectedRowKeys.length === currentFiles.length}
            onChange={(e) => setSelectedRowKeys(e.target.checked ? currentFiles.map(d => d.key) : [])}
          />
          <Select
            size="small"
            value={batchAction || undefined}
            onChange={setBatchAction}
            style={{ width: 140 }}
            placeholder={t('files.batchPlaceholder')}
            options={[
              { value: 'copy', label: <Space><CopyOutlined /> {t('files.copy')}</Space> },
              { value: 'cut', label: <Space><ScissorOutlined /> {t('files.cut')}</Space> },
              { value: 'compress', label: <Space><FileZipOutlined /> {t('files.compress')}</Space> },
              { value: 'delete', label: <Space><DeleteOutlined /> {t('files.delete')}</Space> }
            ]}
          />
          <Button size="small" type={batchAction && selectedRowKeys.length > 0 ? "primary" : "default"} onClick={handleExecuteBatch}>{t('files.batchExecute')}</Button>
        </Space>
      </div>

      <Modal title={t('files.modalNewTitle')} open={open} onOk={handleUpload} onCancel={() => setOpen(false)} okText={t('files.new')} cancelText={t('common.cancel')}>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }} initialValues={{ type: 'file' }}>
          <Form.Item name="type" label={t('files.modalNewType')} rules={[{ required: true }]}>
            <Select options={[{ label: t('files.modalNewTypeFile'), value: 'file' }, { label: t('files.modalNewTypeDir'), value: 'dir' }]} />
          </Form.Item>
          <Form.Item name="name" label={t('files.modalNewName')} rules={[{ required: true, message: t('files.validationNameRequired') }]}>
            <Input placeholder={t('files.modalNewNamePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('files.modalRenameTitle')} open={renameOpen} onOk={handleRename} onCancel={() => setRenameOpen(false)} okText={t('common.save')} cancelText={t('common.cancel')}>
        <Form form={renameForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="newName" label={t('files.modalRenameNewName')} rules={[{ required: true, message: t('files.validationNewNameRequired') }]}>
            <Input placeholder={t('files.modalRenamePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('files.modalPermTitle')} open={permOpen} onOk={handlePermission} onCancel={() => setPermOpen(false)} okText={t('common.save')} cancelText={t('common.cancel')}>
        <Form form={permForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="permission" label={`${t('files.columnPermission')} (ex: 755, 644)`}><Input placeholder="755" /></Form.Item>
          <Form.Item name="owner" label={t('common.owner')}><Input placeholder="www-data" /></Form.Item>
          <Form.Item name="group" label={t('common.group')}><Input placeholder="www-data" /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1E293B' }}>
            {videoPreviewUrl ? <FileOutlined style={{ color: '#7C3AED' }} /> : <FileImageOutlined style={{ color: '#0284C7' }} />}
            <span>{previewFile?.name || (videoPreviewUrl ? 'Xem video' : 'Xem ảnh')}</span>
          </div>
        }
        open={previewOpen}
        onCancel={closeMediaPreview}
        footer={null}
        width="min(92vw, 1100px)"
        centered
        styles={{
          header: { background: '#FFFFFF', color: '#1E293B', padding: '14px 20px', borderBottom: '1px solid #E2E8F0', borderRadius: '8px 8px 0 0' },
          body: { padding: 0, background: '#F8FAFC', borderRadius: '0 0 8px 8px' }
        }}
      >
        {videoPreviewUrl ? (
          <div style={{ minHeight: 280, maxHeight: '75vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 16, background: '#F1F5F9' }}>
            <video
              src={videoPreviewUrl}
              controls
              preload="metadata"
              style={{ display: 'block', width: '100%', maxWidth: 1024, maxHeight: 'calc(75vh - 32px)', background: '#000', borderRadius: 6 }}
              onError={() => message.error('Không thể phát video này. Vui lòng tải tệp xuống để kiểm tra.')}
            >
              Trình duyệt không hỗ trợ phát video.
            </video>
          </div>
        ) : imgPreviewUrl ? (
          <div style={{ minHeight: 280, maxHeight: '75vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 16, background: '#F8FAFC' }}>
            <img
              src={imgPreviewUrl}
              alt={previewFile?.name || 'Ảnh xem trước'}
              style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(75vh - 32px)', objectFit: 'contain', borderRadius: 4 }}
            />
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
            Đang tải dữ liệu xem trước...
          </div>
        )}
      </Modal>

      {/* MODAL: KÝ SỐ TÀI LIỆU / TỆP TIN */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyCertificateOutlined style={{ color: '#009688', fontSize: 18 }} />
            <span>Ký số tài liệu điện tử</span>
          </div>
        }
        open={signOpen}
        onCancel={() => setSignOpen(false)}
        centered
        width={480}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setSignOpen(false)}>Hủy</Button>
            <Button type="primary" onClick={() => setSignOpen(false)}>Đóng</Button>
          </div>
        }
      >
        {signFile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 2 }}>Tệp được ký:</div>
              <div style={{ fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileOutlined style={{ color: '#009688' }} /> {signFile.name} ({signFile.size})
              </div>
            </div>

            <div style={{ border: '1px solid #FDE68A', borderRadius: 6, padding: '10px 14px', background: '#FFFBEB', color: '#92400E', fontSize: 13, lineHeight: 1.5 }}>
              Chưa có kết nối đến nhà cung cấp ký số, chứng thư và khóa riêng được xác thực. Không thể ký hoặc đánh dấu tệp này là đã ký từ trình duyệt.
            </div>
          </div>
        )}
      </Modal>

      {contextMenuState?.visible && (contextMenuState.isContainer || selectedFile) && (
        <Dropdown
          key={`${contextMenuState.x}-${contextMenuState.y}-${contextMenuState.isContainer ? 'container' : 'file'}`}
          open={true}
          overlayStyle={{
            position: 'fixed',
            left: Math.min(contextMenuState.x, typeof window !== 'undefined' ? window.innerWidth - 185 : contextMenuState.x),
            top: Math.min(contextMenuState.y, typeof window !== 'undefined' ? window.innerHeight - 350 : contextMenuState.y),
            zIndex: 100060,
          }}
          menu={{
            items: contextMenuState.isContainer ? [
              { key: 'new-file', icon: <FileAddOutlined style={{ color: '#0078d4' }} />, label: 'Tệp tin', onClick: () => { form.setFieldsValue({ type: 'file', name: '' }); setOpen(true); } },
              { key: 'new-dir', icon: <FolderAddOutlined style={{ color: '#FF9800' }} />, label: 'Thư mục', onClick: () => { form.setFieldsValue({ type: 'dir', name: '' }); setOpen(true); } },
              { key: 'upload-file', icon: <UploadOutlined style={{ color: '#009688' }} />, label: 'Tải lên', onClick: () => nativeFileInputRef.current?.click() },
              { type: 'divider' },
              { key: 'paste', icon: <SnippetsOutlined />, label: t('files.paste'), disabled: !clipboard, onClick: handlePaste },
              { type: 'divider' },
              { key: 'refresh', icon: <ReloadOutlined />, label: t('files.refresh'), onClick: () => message.success(t('files.msgSuccessRefresh')) }
            ] : selectedFile ? [
              { key: 'preview', icon: <EyeOutlined />, label: t('files.preview'), onClick: () => handlePreview(selectedFile) },
              selectedFile.name.match(/\.docx?$/i) ? { key: 'edit-doc', icon: <FileWordOutlined style={{ color: '#2B579A' }} />, label: 'Mở Word (.docx)', onClick: () => handleOpenDocxEditor(selectedFile) } : null,
              { key: 'sign', icon: <SafetyCertificateOutlined style={{ color: '#009688' }} />, label: 'Ký số', onClick: () => { setSignFile(selectedFile); setSignPin(''); setSignOpen(true); }, disabled: selectedFile.type === 'dir' },
              { key: 'rename', icon: <EditOutlined />, label: t('files.rename'), onClick: () => { renameForm.setFieldsValue({ newName: selectedFile.name }); setRenameOpen(true); }, disabled: selectedFile.isProtected },
              { key: 'copy', icon: <CopyOutlined />, label: t('files.copy'), onClick: handleCopy, disabled: selectedFile.isProtected },
              { key: 'cut', icon: <ScissorOutlined />, label: t('files.cut'), onClick: handleCut, disabled: selectedFile.isProtected },
              { key: 'compress', icon: <FileZipOutlined />, label: t('files.compress'), onClick: handleCompress },
              selectedFile.name.endsWith('.zip') ? { key: 'extract', icon: <UnlockOutlined />, label: t('files.extract'), onClick: handleExtract } : null,
              { key: 'permission', icon: <InfoCircleOutlined />, label: t('files.modalPermTitle'), onClick: () => { permForm.setFieldsValue({ permission: selectedFile.permission, owner: selectedFile.owner, group: selectedFile.group }); setPermOpen(true); } },
              { type: 'divider' },
              { key: 'download', icon: <DownloadOutlined />, label: t('files.download'), onClick: () => handleDownload(selectedFile.name, selectedFile.key), disabled: selectedFile.type === 'dir' },
              selectedFile.isProtected ? null : { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('files.delete'), onClick: () => { Modal.confirm({ title: t('files.msgDeleteSingleConfirm').replace('{name}', selectedFile.name), onOk: () => handleDelete(selectedFile.key), okText: t('common.yes'), cancelText: t('common.no') }); } },
            ].filter(Boolean) as any : []
          }}
        >
          <div style={{ display: 'none' }} />
        </Dropdown>
      )}

    </div>
  );
};

export { Files };
export default Files;
