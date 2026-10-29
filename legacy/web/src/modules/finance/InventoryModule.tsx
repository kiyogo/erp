import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertOutlined, ArrowDownOutlined, ArrowUpOutlined, BarChartOutlined, BarcodeOutlined,
  BuildOutlined, CalculatorOutlined, CheckOutlined, CheckSquareOutlined, DownloadOutlined,
  EnvironmentOutlined, InboxOutlined, PlusOutlined, SearchOutlined, SwapOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { inventoryApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { Button, Card, Modal, Progress, Tag, message } from '../../custom-ui';
import { buildWarehouseLayout, type WarehouseLocation } from './warehouseLayoutRules';

type InventoryLot = {
  lotCode: string;
  warehouse: string;
  quantity: number;
  expiryDate?: string;
  receivedDate?: string;
  unitCost?: number;
};

type InventoryItem = {
  key: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  stockQty: number;
  minQty: number;
  maxQty?: number;
  unitPrice: number;
  warehouse: string;
  storageLocation?: string;
  storageAssignments?: Array<{ warehouse: string; locationCode: string }>;
  categoryType: string;
  barcode?: string;
  barcodeManaged?: boolean;
  lotManaged?: boolean;
  issueMethod?: 'FIFO' | 'LIFO' | 'Bình quân';
  status: string;
  lots?: InventoryLot[];
  stockByWarehouse?: Array<{ warehouse: string; quantity: number }>;
};

type InventoryLine = {
  itemKey: string;
  sku: string;
  name: string;
  unit: string;
  operation: string;
  direction?: string;
  warehouse: string;
  destinationWarehouse?: string;
  lotCode?: string;
  expiryDate?: string;
  quantity?: number;
  unitCost?: number;
  amount?: number;
  actualQty?: number;
  bookQty?: number;
  difference?: number;
  allocatedLots?: InventoryLot[];
};

type InventoryTransaction = {
  key: string;
  transactionCode: string;
  type: string;
  transactionDate: string;
  sourceWarehouse?: string;
  destinationWarehouse?: string;
  reason?: string;
  recipient?: string;
  deliveryAddress?: string;
  carrier?: string;
  trackingNumber?: string;
  shipmentStatus?: string;
  shipmentHistory?: Array<{ from: string; to: string; at: string; actor: string; note?: string }>;
  shipmentReturns?: Array<{ returnCode: string; transactionDate: string; actor: string; totalQuantity?: number; lines: Array<{ lineIndex: number; quantity: number }> }>;
  lines: InventoryLine[];
  totalQuantity: number;
  totalAmount: number;
  status: string;
  createdAt?: string;
  createdBy?: string;
};

type InventorySettings = {
  key: string;
  issueMethodMode: 'Mỗi mặt hàng' | 'Dùng chung';
  issueMethod: 'FIFO' | 'LIFO' | 'Bình quân';
  lotManagedDefault: boolean;
  barcodeManagedDefault: boolean;
  warehouseNames: string[];
  categoryNames: string[];
};

type DraftLine = {
  id: string;
  productKey: string;
  quantity: string;
  actualQty: string;
  unitCost: string;
  lotCode: string;
  expiryDate: string;
  direction: 'Thành phần' | 'Thành phẩm';
  warehouse: string;
};

const DEFAULT_SETTINGS: InventorySettings = {
  key: 'global', issueMethodMode: 'Mỗi mặt hàng', issueMethod: 'FIFO',
  lotManagedDefault: false, barcodeManagedDefault: false,
  warehouseNames: ['Kho chính'], categoryNames: ['Hàng hóa'],
};

const fieldStyle: React.CSSProperties = {
  width: '100%', minHeight: 36, padding: '7px 10px', boxSizing: 'border-box',
  border: '1px solid #CBD5E1', borderRadius: 6, background: '#fff', color: '#0F172A', fontSize: 13,
};
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 5, color: '#475569', fontSize: 12, fontWeight: 600 };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 };
const cardStyle: React.CSSProperties = { borderRadius: 8, border: '1px solid #E2E8F0' };

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const money = (value: number) => `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} ₫`;
const newKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const shipmentLineReturnedQty = (shipment: InventoryTransaction, lineIndex: number) => Math.round(
  (shipment.shipmentReturns || []).reduce((sum, receipt) => sum + (receipt.lines || []).reduce((lineSum, line) => lineSum + (line.lineIndex === lineIndex ? Number(line.quantity) || 0 : 0), 0), 0) * 1000,
) / 1000;
const shipmentLineRemainingQty = (shipment: InventoryTransaction, lineIndex: number) => Math.max(
  0,
  Math.round(((Number(shipment.lines?.[lineIndex]?.quantity) || 0) - shipmentLineReturnedQty(shipment, lineIndex)) * 1000) / 1000,
);
const newLine = (productKey = '', warehouse = 'Kho chính'): DraftLine => ({
  id: newKey(), productKey, quantity: '1', actualQty: '0', unitCost: '', lotCode: '', expiryDate: '',
  direction: 'Thành phần', warehouse,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block', minWidth: 0 }}><span style={labelStyle}>{label}</span>{children}</label>;
}

export const InventoryModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');
  const [data, setData] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [settings, setSettings] = useState<InventorySettings>(DEFAULT_SETTINGS);
  const [searchText, setSearchText] = useState('');
  const [reportFilter, setReportFilter] = useState({ from: '', to: '', type: '', warehouse: '', query: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'product' | 'transaction'>('product');
  const [editingProduct, setEditingProduct] = useState<InventoryItem | null>(null);
  const [productDraft, setProductDraft] = useState<Record<string, any>>({});
  const [transactionDraft, setTransactionDraft] = useState<Record<string, any>>({});
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [returnShipment, setReturnShipment] = useState<InventoryTransaction | null>(null);
  const [returnCode, setReturnCode] = useState('');
  const [returnDate, setReturnDate] = useState(localDate());
  const [returnQuantities, setReturnQuantities] = useState<Record<number, string>>({});
  const [returnNotes, setReturnNotes] = useState('');
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WarehouseLocation | null>(null);
  const [locationDraft, setLocationDraft] = useState<Record<string, any>>({});

  const refresh = async () => {
    setLoadError('');
    try {
      const [items, movements, config, warehouseLocations] = await Promise.all([
        dataService.refreshGenericData('finance_inventory'),
        dataService.refreshGenericData('finance_inventory_transactions'),
        dataService.refreshGenericData('finance_inventory_settings'),
        dataService.refreshGenericData('finance_inventory_locations'),
      ]);
      setData(Array.isArray(items) ? items : []);
      setTransactions(Array.isArray(movements) ? movements : []);
      const saved = Array.isArray(config) ? config.find((row) => row.key === 'global') : undefined;
      setSettings({ ...DEFAULT_SETTINGS, ...(saved || {}) });
      setLocations(Array.isArray(warehouseLocations) ? warehouseLocations : []);
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || error?.message || 'Không tải được dữ liệu kho.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      setData(dataService.getGenericData('finance_inventory'));
      setTransactions(dataService.getGenericData('finance_inventory_transactions'));
      setLocations(dataService.getGenericData('finance_inventory_locations') as WarehouseLocation[]);
      const saved = dataService.getGenericData('finance_inventory_settings').find((row) => row.key === 'global');
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...saved });
    };
    const unsubscribe = dataService.subscribe(sync);
    void refresh();
    return () => { active = false; unsubscribe(); };
  }, []);

  const isCharts = currentPath === '/finance/inventory/charts';
  const isImport = currentPath === '/finance/inventory/import';
  const isExport = currentPath === '/finance/inventory/export';
  const isTransfer = currentPath === '/finance/inventory/transfer';
  const isAssembly = currentPath === '/finance/inventory/assembly' || currentPath === '/finance/inventory/production';
  const isAudit = currentPath === '/finance/inventory/audit';
  const isCosting = currentPath === '/finance/inventory/costing';
  const isDelivery = currentPath === '/finance/inventory/delivery';
  const isCategories = currentPath === '/finance/inventory/categories';
  const isSettings = currentPath === '/finance/inventory/settings';
  const isCatalog = currentPath === '/finance/inventory/catalog';
  const isReports = currentPath === '/finance/inventory/reports';
  const isWarehouseMap = currentPath === '/finance/inventory/map';
  const isOverview = !isCharts && !isImport && !isExport && !isTransfer && !isAssembly && !isAudit && !isCosting && !isDelivery && !isCategories && !isSettings && !isCatalog && !isReports && !isWarehouseMap;

  const today = localDate();
  const warehouseLayout = useMemo(() => buildWarehouseLayout(locations, data, transactions, today), [locations, data, transactions, today]);
  const fiveDaysLater = new Date(`${today}T00:00:00`);
  fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);
  const expiryCutoff = `${fiveDaysLater.getFullYear()}-${String(fiveDaysLater.getMonth() + 1).padStart(2, '0')}-${String(fiveDaysLater.getDate()).padStart(2, '0')}`;
  const expiringLots = data.flatMap((item) => (item.lots || []).filter((lot) => lot.quantity > 0 && lot.expiryDate && lot.expiryDate <= expiryCutoff).map((lot) => ({ ...lot, sku: item.sku, name: item.name })));
  const lowStockCount = data.filter((item) => Number(item.stockQty || 0) < Number(item.minQty || 0)).length;
  const overStockCount = data.filter((item) => Number(item.maxQty || 0) > 0 && Number(item.stockQty || 0) > Number(item.maxQty)).length;
  const totalInventoryValue = data.reduce((sum, item) => sum + Number(item.stockQty || 0) * Number(item.unitPrice || 0), 0);
  const filteredData = useMemo(() => data.filter((item) =>
    [item.sku, item.name, item.barcode, item.category, item.warehouse, item.storageLocation].some((value) => String(value || '').toLocaleLowerCase('vi-VN').includes(searchText.toLocaleLowerCase('vi-VN')))), [data, searchText]);
  const pageTransactions = useMemo(() => {
    if (isImport) return transactions.filter((item) => item.type === 'Nhập kho');
    if (isExport) return transactions.filter((item) => item.type === 'Xuất kho');
    if (isTransfer) return transactions.filter((item) => item.type === 'Điều chuyển');
    if (isAudit) return transactions.filter((item) => item.type === 'Kiểm kê');
    if (isAssembly) return transactions.filter((item) => ['Lắp ráp', 'Tháo dỡ'].includes(item.type));
    if (isDelivery) return transactions.filter((item) => item.type === 'Giao hàng');
    return transactions;
  }, [transactions, isImport, isExport, isTransfer, isAudit, isAssembly, isDelivery]);
  const reportTransactions = useMemo(() => transactions.filter((item) => {
    if (reportFilter.from && item.transactionDate < reportFilter.from) return false;
    if (reportFilter.to && item.transactionDate > reportFilter.to) return false;
    if (reportFilter.type && item.type !== reportFilter.type) return false;
    if (reportFilter.warehouse && ![item.sourceWarehouse, item.destinationWarehouse, ...(item.lines || []).map((line) => line.warehouse)].includes(reportFilter.warehouse)) return false;
    const query = reportFilter.query.trim().toLocaleLowerCase('vi-VN');
    if (query && ![item.transactionCode, item.reason, item.recipient, ...(item.lines || []).map((line) => `${line.sku} ${line.name}`)].some((value) => String(value || '').toLocaleLowerCase('vi-VN').includes(query))) return false;
    return true;
  }), [transactions, reportFilter]);

  const openProduct = (item?: InventoryItem) => {
    const source = item || {
      sku: '', name: '', category: settings.categoryNames[0] || 'Hàng hóa', unit: 'Cái', minQty: 0, maxQty: 0,
      unitPrice: 0, warehouse: settings.warehouseNames[0] || 'Kho chính', categoryType: 'Hàng hóa', barcode: '',
      storageLocation: '',
      lotManaged: settings.lotManagedDefault, barcodeManaged: settings.barcodeManagedDefault,
      issueMethod: settings.issueMethod,
    };
    setEditingProduct(item || null);
    setProductDraft({ ...source });
    setModalMode('product');
    setModalOpen(true);
  };

  const openLocation = (location?: WarehouseLocation) => {
    const warehouse = location?.warehouse || settings.warehouseNames[0] || 'Kho chính';
    setEditingLocation(location || null);
    setLocationDraft({
      key: location?.key || `invloc-${newKey()}`,
      warehouse,
      code: location?.code || '',
      zone: location?.zone || '',
      shelf: location?.shelf || '',
      capacityItems: location?.capacityItems ?? 10,
      pickOrder: location?.pickOrder ?? locations.filter((item) => item.warehouse === warehouse).length + 1,
      status: location?.status || 'Đang hoạt động',
    });
    setLocationModalOpen(true);
  };

  const openTransaction = () => {
    const prefix = isImport ? 'PNK' : isExport ? 'PXK' : isTransfer ? 'DCK' : isAudit ? 'KK' : isDelivery ? 'GH' : 'LSX';
    const type = isImport ? 'Nhập kho' : isExport ? 'Xuất kho' : isTransfer ? 'Điều chuyển' : isAudit ? 'Kiểm kê' : isDelivery ? 'Giao hàng' : 'Lắp ráp';
    const warehouse = settings.warehouseNames[0] || 'Kho chính';
    setTransactionDraft({
      type, transactionCode: `${prefix}-${localDate().split('-').join('')}-${String(Date.now()).slice(-5)}`,
      transactionDate: localDate(), sourceWarehouse: warehouse, destinationWarehouse: settings.warehouseNames[1] || warehouse,
      reason: '', recipient: '', deliveryAddress: '', carrier: '', trackingNumber: '', notes: '',
    });
    setDraftLines([newLine(data[0]?.key || '', warehouse)]);
    setModalMode('transaction');
    setModalOpen(true);
  };

  const updateProduct = (field: string, value: unknown) => setProductDraft((current) => ({ ...current, [field]: value }));
  const updateStorageAssignment = (warehouse: string, locationCode: string) => setProductDraft((current) => {
    const assignments = Array.isArray(current.storageAssignments) ? current.storageAssignments : [];
    const next = assignments.filter((entry: { warehouse: string }) => entry.warehouse !== warehouse);
    if (locationCode) next.push({ warehouse, locationCode });
    return { ...current, storageAssignments: next, ...(warehouse === current.warehouse ? { storageLocation: locationCode } : {}) };
  });
  const changeProductWarehouse = (warehouse: string) => setProductDraft((current) => {
    const assignments = Array.isArray(current.storageAssignments) ? [...current.storageAssignments] : [];
    if (current.storageLocation && current.warehouse && !assignments.some((entry: { warehouse: string }) => entry.warehouse === current.warehouse)) {
      assignments.push({ warehouse: current.warehouse, locationCode: current.storageLocation });
    }
    const savedLocation = assignments.find((entry: { warehouse: string }) => entry.warehouse === warehouse)?.locationCode
      || (editingProduct?.warehouse === warehouse ? editingProduct.storageLocation : '');
    return { ...current, warehouse, storageLocation: savedLocation || '', storageAssignments: assignments };
  });
  const updateTransaction = (field: string, value: unknown) => {
    setTransactionDraft((current) => ({ ...current, [field]: value }));
    if (field === 'type' && isAssembly) setDraftLines((current) => current.map((line) => {
      const producesItem = value === 'Lắp ráp' ? line.direction === 'Thành phẩm' : line.direction === 'Thành phần';
      return { ...line, warehouse: producesItem ? transactionDraft.destinationWarehouse : transactionDraft.sourceWarehouse };
    }));
  };
  const updateLine = (index: number, field: keyof DraftLine, value: string) => setDraftLines((current) => current.map((line, row) => {
    if (row !== index) return line;
    if (field === 'direction' && isAssembly) {
      const producesItem = transactionDraft.type === 'Lắp ráp' ? value === 'Thành phẩm' : value === 'Thành phần';
      return { ...line, direction: value as DraftLine['direction'], warehouse: producesItem ? transactionDraft.destinationWarehouse : transactionDraft.sourceWarehouse };
    }
    return { ...line, [field]: value };
  }));

  const submitProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const values = {
        key: editingProduct?.key || `inv-${newKey()}`,
        sku: String(productDraft.sku || '').trim(), name: String(productDraft.name || '').trim(),
        category: String(productDraft.category || 'Hàng hóa').trim(), unit: String(productDraft.unit || 'Cái').trim(),
        minQty: Number(productDraft.minQty) || 0, maxQty: Number(productDraft.maxQty) || 0,
        unitPrice: Number(productDraft.unitPrice) || 0, warehouse: String(productDraft.warehouse || 'Kho chính').trim(),
        storageLocation: String(productDraft.storageLocation || '').trim(),
        storageAssignments: Array.isArray(productDraft.storageAssignments) ? productDraft.storageAssignments : [],
        categoryType: String(productDraft.categoryType || 'Hàng hóa'), barcode: String(productDraft.barcode || '').trim(),
        lotManaged: Boolean(productDraft.lotManaged), barcodeManaged: Boolean(productDraft.barcodeManaged),
        issueMethod: productDraft.issueMethod || 'FIFO',
      };
      if (editingProduct) await dataService.updateGenericRecord('finance_inventory', values);
      else await dataService.createGenericRecord('finance_inventory', values);
      await refresh();
      message.success(editingProduct ? 'Đã cập nhật mặt hàng.' : 'Đã tạo mặt hàng. Ghi nhận tồn đầu qua phiếu nhập kho.');
      setModalOpen(false);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được mặt hàng.');
    } finally { setSaving(false); }
  };

  const submitLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const values = {
        key: editingLocation?.key || `invloc-${newKey()}`,
        warehouse: String(locationDraft.warehouse || '').trim(),
        code: String(locationDraft.code || '').trim().toLocaleUpperCase('vi-VN'),
        zone: String(locationDraft.zone || '').trim(),
        shelf: String(locationDraft.shelf || '').trim(),
        capacityItems: Number(locationDraft.capacityItems),
        pickOrder: Number(locationDraft.pickOrder),
        status: locationDraft.status === 'Tạm ngưng' ? 'Tạm ngưng' : 'Đang hoạt động',
      };
      if (editingLocation) await dataService.updateGenericRecord('finance_inventory_locations', values);
      else await dataService.createGenericRecord('finance_inventory_locations', values);
      await refresh();
      message.success(editingLocation ? 'Đã cập nhật vị trí kho.' : 'Đã thêm vị trí kho.');
      setLocationModalOpen(false);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được vị trí kho.');
    } finally { setSaving(false); }
  };

  const submitTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const type = String(transactionDraft.type);
      const commonLines = draftLines.map((line) => {
        const product = data.find((item) => item.key === line.productKey);
        if (!product) throw new Error('Chọn mặt hàng có trong danh mục.');
        const base: Record<string, any> = { productKey: product.key, lotCode: line.lotCode.trim() };
        if (isAssembly) {
          const producesItem = transactionDraft.type === 'Lắp ráp' ? line.direction === 'Thành phẩm' : line.direction === 'Thành phần';
          base.direction = line.direction;
          base.quantity = Number(line.quantity);
          base.warehouse = line.warehouse || (producesItem ? transactionDraft.destinationWarehouse : transactionDraft.sourceWarehouse);
          base.expiryDate = line.expiryDate;
          if (transactionDraft.type === 'Lắp ráp' ? line.direction === 'Thành phần' : line.direction === 'Thành phẩm') base.fromWarehouse = base.warehouse;
          return base;
        }
        if (type === 'Kiểm kê') {
          base.warehouse = transactionDraft.sourceWarehouse;
          base.actualQty = Number(line.actualQty);
          base.unitCost = Number(line.unitCost) || Number(product.unitPrice) || 0;
          base.expiryDate = line.expiryDate;
          return base;
        }
        base.quantity = Number(line.quantity);
        if (type === 'Nhập kho') {
          base.warehouse = transactionDraft.destinationWarehouse;
          base.unitCost = Number(line.unitCost) || 0;
          base.expiryDate = line.expiryDate;
        } else if (type === 'Điều chuyển') {
          base.fromWarehouse = transactionDraft.sourceWarehouse;
          base.toWarehouse = transactionDraft.destinationWarehouse;
        } else {
          base.fromWarehouse = transactionDraft.sourceWarehouse;
        }
        return base;
      });
      const payload: Record<string, any> = {
        ...transactionDraft, type, lines: commonLines,
      };
      if (isExport || isDelivery) payload.reason = transactionDraft.reason || transactionDraft.recipient;
      const result = await inventoryApi.createTransaction(payload);
      await refresh();
      message.success(result.data?.replayed ? 'Phiếu đã được ghi nhận trước đó; không tạo trùng tồn kho.' : `Đã ghi nhận ${result.data?.transaction?.transactionCode || 'giao dịch kho'}.`);
      setModalOpen(false);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không ghi nhận được giao dịch kho.');
    } finally { setSaving(false); }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const exists = dataService.getGenericData('finance_inventory_settings').some((item) => item.key === 'global');
      const payload = { ...settings, key: 'global' };
      if (exists) await dataService.updateGenericRecord('finance_inventory_settings', payload);
      else await dataService.createGenericRecord('finance_inventory_settings', payload);
      await refresh();
      message.success('Đã lưu cấu hình kho.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được cấu hình kho.');
    } finally { setSaving(false); }
  };

  const updateShipment = async (transaction: InventoryTransaction, status: string) => {
    const reason = status === 'Giao thất bại' ? window.prompt('Nhập lý do giao thất bại:') : '';
    if (status === 'Giao thất bại' && !reason?.trim()) return;
    setSaving(true);
    try {
      await inventoryApi.updateShipmentStatus(transaction.transactionCode, status, reason || '');
      await refresh();
      message.success(`Đã cập nhật trạng thái giao hàng: ${status}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không cập nhật được trạng thái giao hàng.');
    } finally { setSaving(false); }
  };

  const openShipmentReturn = (transaction: InventoryTransaction) => {
    setReturnShipment(transaction);
    setReturnCode(`TH-${Date.now().toString(36).toUpperCase()}-${newKey().slice(0, 8).toUpperCase()}`);
    setReturnDate(localDate());
    setReturnQuantities(Object.fromEntries((transaction.lines || []).map((_, index) => [index, '0'])));
    setReturnNotes('');
  };

  const submitShipmentReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!returnShipment) return;
    const lines = Object.entries(returnQuantities)
      .map(([lineIndex, quantity]) => ({ lineIndex: Number(lineIndex), quantity: Number(quantity) || 0 }))
      .filter((line) => line.quantity > 0);
    if (!lines.length) {
      message.error('Nhập số lượng hàng thực nhận và còn dùng được.');
      return;
    }
    setSaving(true);
    try {
      const result = await inventoryApi.receiveShipmentReturn(returnShipment.transactionCode, {
        returnCode, receivedDate: returnDate, notes: returnNotes, lines,
      });
      await refresh();
      setReturnShipment(null);
      message.success(result.data?.replayed ? 'Phiếu nhận trả đã được ghi nhận trước đó; không cộng trùng tồn kho.' : `Đã ghi nhận phiếu nhận trả ${result.data?.receipt?.transactionCode || returnCode}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không ghi nhận được hàng nhận trả.');
    } finally { setSaving(false); }
  };

  const removeProduct = async (item: InventoryItem) => {
    if (!window.confirm(`Xóa mặt hàng ${item.sku} khỏi danh mục? Chỉ xóa được khi không còn tồn và chưa có giao dịch.`)) return;
    try {
      await dataService.deleteGenericRecord('finance_inventory', item.key);
      await refresh();
      message.success('Đã xóa mặt hàng.');
    } catch (error: any) { message.error(error?.response?.data?.message || error?.message || 'Không xóa được mặt hàng.'); }
  };

  const exportInventory = () => {
    const rows = [['SKU', 'Tên hàng', 'Barcode', 'Nhóm', 'Đơn vị', 'Kho', 'Tồn', 'Tối thiểu', 'Tối đa', 'Đơn giá vốn', 'Giá trị']];
    for (const item of filteredData) rows.push([item.sku, item.name, item.barcode || '', item.category, item.unit, item.warehouse, String(item.stockQty), String(item.minQty), String(item.maxQty || 0), String(item.unitPrice), String(Number(item.stockQty || 0) * Number(item.unitPrice || 0))]);
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).split('"').join('""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `danh-muc-kho-${today}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const exportReport = (rowsToExport: InventoryTransaction[]) => {
    const rows = [['Mã phiếu', 'Ngày', 'Loại giao dịch', 'SKU', 'Mặt hàng', 'Kho', 'Kho đích', 'Số lượng', 'Chênh lệch kiểm kê', 'Giá trị', 'Người tạo']];
    for (const transaction of rowsToExport) for (const line of transaction.lines || []) rows.push([
      transaction.transactionCode, transaction.transactionDate, transaction.type, line.sku, line.name,
      line.warehouse || transaction.sourceWarehouse || '', line.destinationWarehouse || transaction.destinationWarehouse || '',
      String(line.quantity ?? ''), String(line.difference ?? ''), String(line.amount ?? ''), transaction.createdBy || '',
    ]);
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).split('"').join('""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `bao-cao-giao-dich-kho-${today}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const itemColumns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', render: (value: string) => <strong>{value}</strong> },
    { title: 'Tên mặt hàng', dataIndex: 'name', key: 'name', render: (value: string, item: InventoryItem) => <div><strong>{value}</strong><div style={{ fontSize: 11, color: '#64748B' }}>{item.barcode ? `Barcode: ${item.barcode}` : 'Chưa gán Barcode'}</div></div> },
    { title: 'Danh mục', dataIndex: 'category', key: 'category' },
    { title: 'Vị trí', dataIndex: 'storageLocation', key: 'storageLocation', render: (value: string) => value || '—' },
    { title: 'Tồn hiện tại', dataIndex: 'stockQty', key: 'stockQty', render: (value: number, item: InventoryItem) => <strong>{Number(value || 0).toLocaleString('vi-VN')} {item.unit}</strong> },
    { title: 'Min / Max', key: 'limits', render: (_: unknown, item: InventoryItem) => `${Number(item.minQty || 0)} / ${Number(item.maxQty || 0) || '—'}` },
    { title: 'Kho', dataIndex: 'stockByWarehouse', key: 'warehouses', render: (value: InventoryItem['stockByWarehouse'], item: InventoryItem) => value?.length ? value.map((entry) => <div key={entry.warehouse}>{entry.warehouse}: {entry.quantity}</div>) : item.warehouse },
    { title: 'Lô / hạn dùng', dataIndex: 'lots', key: 'lots', render: (lots: InventoryLot[] = [], item: InventoryItem) => item.lotManaged ? lots.filter((lot) => lot.quantity > 0).map((lot) => <div key={`${lot.warehouse}-${lot.lotCode}`}>{lot.lotCode}: {lot.quantity} · {lot.expiryDate || 'không hạn'}</div>) : 'Không quản lý lô' },
    { title: 'Đơn giá vốn', dataIndex: 'unitPrice', key: 'unitPrice', render: (value: number) => money(value) },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color={status === 'Sắp hết hàng' ? 'error' : status === 'Vượt mức tối đa' ? 'warning' : 'success'}>{status}</Tag> },
    { title: 'Thao tác', key: 'actions', render: (_: unknown, item: InventoryItem) => <div style={{ display: 'flex', gap: 6 }}><Button size="small" onClick={() => openProduct(item)}>Sửa</Button><Button size="small" danger onClick={() => void removeProduct(item)}>Xóa</Button></div> },
  ];

  const transactionColumns = [
    { title: 'Mã phiếu', dataIndex: 'transactionCode', key: 'transactionCode', render: (code: string) => <strong>{code}</strong> },
    { title: 'Ngày', dataIndex: 'transactionDate', key: 'transactionDate' },
    { title: 'Loại phiếu', dataIndex: 'type', key: 'type', render: (type: string) => <Tag color="blue">{type}</Tag> },
    { title: 'Kho đi / kho đến', key: 'warehouses', render: (_: unknown, item: InventoryTransaction) => <span>{item.sourceWarehouse || item.lines?.[0]?.warehouse || '—'}{item.type === 'Điều chuyển' || item.type === 'Nhập kho' ? ` → ${item.destinationWarehouse || item.lines?.[0]?.warehouse || '—'}` : ''}</span> },
    { title: 'Mặt hàng', dataIndex: 'lines', key: 'lines', render: (lines: InventoryLine[] = []) => lines.map((line) => `${line.sku} × ${line.quantity ?? `${line.actualQty} (${line.difference ?? 0})`}`).join(', ') },
    { title: 'Tổng lượng', dataIndex: 'totalQuantity', key: 'totalQuantity', render: (value: number) => Number(value || 0).toLocaleString('vi-VN') },
    { title: 'Giá trị', dataIndex: 'totalAmount', key: 'totalAmount', render: (value: number) => money(value) },
    { title: 'Lý do / người nhận', key: 'reason', render: (_: unknown, item: InventoryTransaction) => item.reason || item.recipient || '—' },
    { title: 'Người tạo', dataIndex: 'createdBy', key: 'createdBy' },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color="success">{status}</Tag> },
  ];

  const warehouseValues = settings.warehouseNames.length ? settings.warehouseNames : ['Kho chính'];
  const activeLocationsFor = (warehouse: string) => locations.filter((location) => location.status === 'Đang hoạt động' && location.warehouse.toLocaleLowerCase('vi-VN') === warehouse.toLocaleLowerCase('vi-VN'));
  const additionalProductWarehouses = [...new Set([
    ...(editingProduct?.stockByWarehouse || []).filter((entry) => Number(entry.quantity) > 0).map((entry) => entry.warehouse),
    ...(Array.isArray(productDraft.storageAssignments) ? productDraft.storageAssignments.map((entry: { warehouse: string }) => entry.warehouse) : []),
  ])].filter((warehouse) => warehouse && warehouse !== productDraft.warehouse);
  const navItems = [
    { label: 'Tổng quan', path: '/admin/finance/inventory', icon: <InboxOutlined /> },
    { label: 'Danh mục', path: '/admin/finance/inventory/catalog', icon: <BarcodeOutlined /> },
    { label: 'Sơ đồ kho', path: '/admin/finance/inventory/map', icon: <EnvironmentOutlined /> },
    { label: 'Nhập kho', path: '/admin/finance/inventory/import', icon: <ArrowDownOutlined /> },
    { label: 'Xuất kho', path: '/admin/finance/inventory/export', icon: <ArrowUpOutlined /> },
    { label: 'Điều chuyển', path: '/admin/finance/inventory/transfer', icon: <SwapOutlined /> },
    { label: 'Giao hàng', path: '/admin/finance/inventory/delivery', icon: <CheckOutlined /> },
    { label: 'Lắp ráp', path: '/admin/finance/inventory/assembly', icon: <BuildOutlined /> },
    { label: 'Kiểm kê', path: '/admin/finance/inventory/audit', icon: <CheckSquareOutlined /> },
    { label: 'Tính giá', path: '/admin/finance/inventory/costing', icon: <CalculatorOutlined /> },
    { label: 'Biểu đồ', path: '/admin/finance/inventory/charts', icon: <BarChartOutlined /> },
    { label: 'Báo cáo', path: '/admin/finance/inventory/reports', icon: <CalculatorOutlined /> },
    { label: 'Danh mục nhóm', path: '/admin/finance/inventory/categories', icon: <BarcodeOutlined /> },
    { label: 'Cấu hình', path: '/admin/finance/inventory/settings', icon: <AlertOutlined /> },
  ];

  const title = isImport ? 'Phiếu nhập kho' : isExport ? 'Phiếu xuất kho' : isTransfer ? 'Điều chuyển kho' : isAssembly ? 'Lắp ráp, tháo dỡ và lệnh sản xuất' : isAudit ? 'Kiểm kê tồn kho' : isCosting ? 'Tính giá xuất kho' : isCharts ? 'Phân tích kho hàng' : isDelivery ? 'Quản lý giao hàng' : isCategories ? 'Danh mục nhóm hàng' : isSettings ? 'Cấu hình kho hàng' : isCatalog ? 'Danh mục hàng hóa' : isReports ? 'Báo cáo giao dịch kho' : isWarehouseMap ? 'Sơ đồ kho' : 'Tổng quan kho hàng';
  const canCreateTransaction = isImport || isExport || isTransfer || isAssembly || isAudit || isDelivery;

  const warehouseValue = new Map<string, number>();
  for (const item of data) for (const stock of item.stockByWarehouse?.length ? item.stockByWarehouse : [{ warehouse: item.warehouse || 'Kho chính', quantity: item.stockQty || 0 }]) {
    warehouseValue.set(stock.warehouse, (warehouseValue.get(stock.warehouse) || 0) + stock.quantity * Number(item.unitPrice || 0));
  }
  const categoryValue = new Map<string, { value: number; quantity: number }>();
  for (const item of data) {
    const current = categoryValue.get(item.category || 'Chưa phân loại') || { value: 0, quantity: 0 };
    current.value += Number(item.stockQty || 0) * Number(item.unitPrice || 0);
    current.quantity += Number(item.stockQty || 0);
    categoryValue.set(item.category || 'Chưa phân loại', current);
  }
  const oneYearAgo = new Date(`${today}T00:00:00`);
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  const outflowByCategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.transactionDate < `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-${String(oneYearAgo.getDate()).padStart(2, '0')}`) continue;
    for (const line of transaction.lines || []) {
      const leavesWarehouse = ['Xuất kho', 'Giao hàng'].includes(transaction.type)
        || transaction.type === 'Lắp ráp' && line.direction === 'Thành phần'
        || transaction.type === 'Tháo dỡ' && line.direction === 'Thành phẩm'
        || transaction.type === 'Kiểm kê' && Number(line.difference || 0) < 0;
      if (!leavesWarehouse) continue;
      const item = data.find((row) => row.key === line.itemKey);
      if (!item) continue;
      const category = item.category || 'Chưa phân loại';
      const quantity = transaction.type === 'Kiểm kê' ? Math.abs(Number(line.difference || 0)) : Number(line.quantity || 0);
      outflowByCategory.set(category, (outflowByCategory.get(category) || 0) + quantity);
    }
  }
  const reportTotals = {
    inbound: reportTransactions.filter((item) => item.type === 'Nhập kho').reduce((sum, item) => sum + Number(item.totalQuantity || 0), 0),
    outbound: reportTransactions.filter((item) => ['Xuất kho', 'Giao hàng'].includes(item.type)).reduce((sum, item) => sum + Number(item.totalQuantity || 0), 0),
    transfers: reportTransactions.filter((item) => item.type === 'Điều chuyển').length,
    counts: reportTransactions.filter((item) => item.type === 'Kiểm kê').length,
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div><h2 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>{title}</h2><div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>Tồn kho và giao dịch được đồng bộ trực tiếp với máy chủ.</div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canCreateTransaction && <Button type="primary" icon={<PlusOutlined />} onClick={openTransaction} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Tạo phiếu</Button>}
          {isWarehouseMap && <Button type="primary" icon={<PlusOutlined />} onClick={() => openLocation()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm vị trí kho</Button>}
          {(isOverview || isCatalog || isCategories) && <Button type="primary" icon={<PlusOutlined />} onClick={() => openProduct()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm mặt hàng</Button>}
          {(isOverview || isCatalog) && <Button icon={<DownloadOutlined />} onClick={exportInventory}>Xuất CSV</Button>}
          {isReports && <Button icon={<DownloadOutlined />} onClick={() => exportReport(reportTransactions)}>Xuất báo cáo CSV</Button>}
          <Button icon={<SearchOutlined />} onClick={() => void refresh()} loading={loading}>Làm mới</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {navItems.map((item) => <Link key={item.path} to={item.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 6, background: currentPath === item.path.replace('/admin', '') ? '#E6FFFB' : '#fff', color: '#334155', textDecoration: 'none', fontSize: 12 }}>{item.icon}{item.label}</Link>)}
      </div>

      {loadError && <div role="alert" style={{ marginBottom: 12, padding: 10, border: '1px solid #FECACA', borderRadius: 6, color: '#B91C1C', background: '#FEF2F2' }}>{loadError}<Button size="small" onClick={() => void refresh()} style={{ marginLeft: 8 }}>Thử lại</Button></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Card style={cardStyle}><div style={{ fontSize: 12, color: '#64748B' }}>Giá trị hàng tồn kho</div><div style={{ fontSize: 21, fontWeight: 800, color: '#009688', marginTop: 4 }}>{money(totalInventoryValue)}</div></Card>
        <Card style={cardStyle}><div style={{ fontSize: 12, color: '#64748B' }}>Mã mặt hàng đang quản lý</div><div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{data.length}</div></Card>
        <Card style={cardStyle}><div style={{ fontSize: 12, color: '#64748B' }}>Cảnh báo tồn thấp / vượt mức</div><div style={{ fontSize: 21, fontWeight: 800, color: lowStockCount || overStockCount ? '#DC2626' : '#16A34A', marginTop: 4 }}>{lowStockCount} / {overStockCount}</div></Card>
        <Card style={cardStyle}><div style={{ fontSize: 12, color: '#64748B' }}>Lô sắp hết hạn hoặc đã hết hạn</div><div style={{ fontSize: 21, fontWeight: 800, color: expiringLots.length ? '#D97706' : '#16A34A', marginTop: 4 }}>{expiringLots.length}</div></Card>
      </div>

      {isWarehouseMap && <div data-testid="warehouse-layout" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <Card style={cardStyle}><div style={{ color: '#64748B', fontSize: 12 }}>Sức chứa vị trí đang hoạt động</div><strong style={{ display: 'block', fontSize: 22, marginTop: 4 }}>{warehouseLayout.totalSlots}</strong></Card>
          <Card style={cardStyle}><div style={{ color: '#64748B', fontSize: 12 }}>Vị trí đang sử dụng</div><strong style={{ display: 'block', fontSize: 22, marginTop: 4 }}>{warehouseLayout.occupiedSlots}</strong></Card>
          <Card style={cardStyle}><div style={{ color: '#64748B', fontSize: 12 }}>Mặt hàng chưa xếp vị trí</div><strong style={{ display: 'block', fontSize: 22, color: warehouseLayout.unlocatedItems.length ? '#D97706' : '#059669', marginTop: 4 }}>{warehouseLayout.unlocatedItems.length}</strong></Card>
          <Card style={cardStyle}><div style={{ color: '#64748B', fontSize: 12 }}>Đề xuất sắp xếp</div><strong style={{ display: 'block', fontSize: 22, color: warehouseLayout.suggestions.length ? '#2563EB' : '#059669', marginTop: 4 }}>{warehouseLayout.suggestions.length}</strong></Card>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <Card title="Thiết lập sơ đồ kho" style={cardStyle}><div style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Khai báo khu vực, kệ, sức chứa và thứ tự lấy hàng theo từng kho.</div><Button type="primary" onClick={() => openLocation()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm vị trí kho</Button></Card>
          <Card title="Tối ưu không gian lưu trữ" style={cardStyle}><div style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Xếp SKU có lượt xuất cao vào vị trí lấy hàng ưu tiên, trong giới hạn sức chứa.</div><Button onClick={() => document.getElementById('warehouse-layout-recommendations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Xem đề xuất</Button></Card>
          <Card title="Nâng cao hiệu suất vận hành" style={cardStyle}><div style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Xem lượng luân chuyển, tốc độ xuất và thời gian tồn theo danh mục.</div><Link to="/admin/finance/inventory/charts"><Button>Phân tích luân chuyển</Button></Link></Card>
        </div>
        <Card title="Vị trí và sức chứa kho" style={cardStyle}>
          <KTable viewKeyPrefix="legacy-inventory-warehouse-locations" dataSource={warehouseLayout.locations} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} columns={[
            { title: 'Kho', dataIndex: 'warehouse', key: 'warehouse' },
            { title: 'Khu vực', dataIndex: 'zone', key: 'zone', render: (value: string) => value || '—' },
            { title: 'Kệ / ngăn', dataIndex: 'shelf', key: 'shelf', render: (value: string) => value || '—' },
            { title: 'Mã vị trí', dataIndex: 'code', key: 'code', render: (value: string) => <strong>{value}</strong> },
            { title: 'Sức chứa SKU', key: 'capacity', render: (_: unknown, location: WarehouseLocation & { occupiedItems: number; quantity: number; occupancyPercent: number }) => <div style={{ minWidth: 130 }}><div>{location.occupiedItems} / {location.capacityItems} mặt hàng</div><Progress percent={Math.min(100, location.occupancyPercent)} strokeColor={location.occupancyPercent > 100 ? '#DC2626' : '#009688'} /></div> },
            { title: 'Tồn thực', dataIndex: 'quantity', key: 'quantity', render: (value: number) => Number(value || 0).toLocaleString('vi-VN') },
            { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'Đang hoạt động' ? 'success' : 'default'}>{value}</Tag> },
            { title: 'Thao tác', key: 'actions', render: (_: unknown, location: WarehouseLocation) => <Button size="small" onClick={() => openLocation(location)}>Sửa</Button> },
          ]} />
          {!locations.length && <div style={{ color: '#64748B', fontSize: 12 }}>Chưa có vị trí kho. Thêm vị trí để bắt đầu lập sơ đồ và tính sức chứa.</div>}
        </Card>
        <Card title="Mặt hàng chưa gán vị trí" style={cardStyle}>
          <KTable viewKeyPrefix="legacy-inventory-warehouse-unlocated" dataSource={warehouseLayout.unlocatedItems} rowKey={(row: { item: InventoryItem; warehouse: string }) => `${row.item.key}-${row.warehouse}`} pagination={{ pageSize: 10 }} columns={[
            { title: 'SKU', key: 'sku', render: (_: unknown, row: { item: InventoryItem }) => <strong>{row.item.sku}</strong> },
            { title: 'Mặt hàng', key: 'name', render: (_: unknown, row: { item: InventoryItem }) => row.item.name },
            { title: 'Kho', dataIndex: 'warehouse', key: 'warehouse' },
            { title: 'Tồn', key: 'quantity', render: (_: unknown, row: { item: InventoryItem; quantity: number }) => `${row.quantity.toLocaleString('vi-VN')} ${row.item.unit}` },
            { title: 'Vị trí hiện tại', key: 'location', render: (_: unknown, row: { locationCode: string }) => row.locationCode || 'Chưa gán' },
            { title: 'Thao tác', key: 'actions', render: (_: unknown, row: { item: InventoryItem }) => <Button size="small" onClick={() => openProduct(row.item)}>Gán vị trí</Button> },
          ]} />
          {!warehouseLayout.unlocatedItems.length && <div style={{ color: '#64748B', fontSize: 12 }}>Tất cả mặt hàng có tồn đã được gán vào vị trí đang khai báo.</div>}
        </Card>
        <div id="warehouse-layout-recommendations"><Card title="Đề xuất tối ưu vị trí" style={cardStyle}>
          <div style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Đề xuất chỉ dựa trên giao dịch xuất kho, giao hàng, tiêu thụ lắp ráp, tháo dỡ và kiểm kê giảm trong 365 ngày gần nhất. Hệ thống không tự chuyển vị trí.</div>
          <KTable viewKeyPrefix="legacy-inventory-warehouse-recommendations" dataSource={warehouseLayout.suggestions} rowKey={(row: { item: InventoryItem; warehouse: string }) => `${row.item.key}-${row.warehouse}`} pagination={{ pageSize: 10 }} columns={[
            { title: 'SKU', key: 'sku', render: (_: unknown, row: { item: InventoryItem }) => <strong>{row.item.sku}</strong> },
            { title: 'Mặt hàng', key: 'name', render: (_: unknown, row: { item: InventoryItem }) => row.item.name },
            { title: 'Kho', dataIndex: 'warehouse', key: 'warehouse' },
            { title: 'Vị trí hiện tại', dataIndex: 'currentLocation', key: 'currentLocation', render: (value: string) => value || 'Chưa gán' },
            { title: 'Vị trí đề xuất', dataIndex: 'recommendedLocation', key: 'recommendedLocation', render: (value: string) => <Tag color="blue">{value}</Tag> },
            { title: 'Lượt lấy 365 ngày', dataIndex: 'pickCount', key: 'pickCount' },
            { title: 'Lượng xuất', dataIndex: 'pickedQuantity', key: 'pickedQuantity', render: (value: number) => Number(value || 0).toLocaleString('vi-VN') },
            { title: 'Thao tác', key: 'actions', render: (_: unknown, row: { item: InventoryItem }) => <Button size="small" onClick={() => openProduct(row.item)}>Cập nhật vị trí</Button> },
          ]} />
          {!warehouseLayout.suggestions.length && <div style={{ color: '#64748B', fontSize: 12 }}>Chưa có thay đổi vị trí cần đề xuất.</div>}
          {!!warehouseLayout.itemsWithoutCapacity.length && <div role="status" style={{ marginTop: 12, color: '#B45309', fontSize: 12 }}>Không đủ vị trí đang hoạt động cho {warehouseLayout.itemsWithoutCapacity.length} mặt hàng có tồn. Hãy thêm sức chứa hoặc kích hoạt vị trí phù hợp.</div>}
        </Card></div>
      </div>}

      {(isOverview || isCatalog) && <Card title="Danh mục hàng hóa" style={cardStyle}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, maxWidth: 540 }}><input aria-label="Tìm mặt hàng" style={fieldStyle} placeholder="Tìm SKU, tên, barcode, nhóm hoặc kho" value={searchText} onChange={(event) => setSearchText(event.target.value)} /><Button icon={<SearchOutlined />} onClick={() => setSearchText(searchText.trim())}>Tìm</Button></div>
        <KTable viewKeyPrefix="legacy-finance-inventory-items" dataSource={filteredData} columns={itemColumns} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>}

      {isOverview && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 12 }}>
        <Card title="Cảnh báo theo ngưỡng tồn" style={cardStyle}>
          {[...data.filter((item) => Number(item.stockQty || 0) < Number(item.minQty || 0)), ...data.filter((item) => Number(item.maxQty || 0) > 0 && Number(item.stockQty || 0) > Number(item.maxQty))].slice(0, 12).map((item) => <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #F1F5F9', padding: '8px 0', fontSize: 12 }}><span><strong>{item.sku}</strong> · {item.name}</span><Tag color={item.status === 'Sắp hết hàng' ? 'error' : 'warning'}>{item.status}: {item.stockQty}</Tag></div>)}
          {!lowStockCount && !overStockCount && <div style={{ color: '#64748B', fontSize: 12 }}>Không có cảnh báo tồn.</div>}
        </Card>
        <Card title="Lô cần chú ý hạn dùng" style={cardStyle}>
          {expiringLots.slice(0, 12).map((lot) => <div key={`${lot.sku}-${lot.warehouse}-${lot.lotCode}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #F1F5F9', padding: '8px 0', fontSize: 12 }}><span><strong>{lot.sku}</strong> · lô {lot.lotCode || 'không mã'} · {lot.warehouse}</span><Tag color={(lot.expiryDate || '') < today ? 'error' : 'warning'}>{lot.quantity} · HSD {lot.expiryDate}</Tag></div>)}
          {!expiringLots.length && <div style={{ color: '#64748B', fontSize: 12 }}>Không có lô hết hạn trong 5 ngày tới.</div>}
        </Card>
        <Card title="Hoạt động kho gần đây" style={cardStyle}>
          {transactions.slice(0, 8).map((entry) => <div key={entry.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #F1F5F9', padding: '8px 0', fontSize: 12 }}><span><strong>{entry.transactionCode}</strong> · {entry.type}</span><span>{entry.transactionDate} · {entry.totalQuantity}</span></div>)}
          {!transactions.length && <div style={{ color: '#64748B', fontSize: 12 }}>Chưa có giao dịch kho.</div>}
        </Card>
      </div>}

      {(isImport || isExport || isTransfer || isAudit || (isAssembly && !currentPath.endsWith('/production'))) && <Card title={`${title} đã ghi nhận`} style={cardStyle}><KTable viewKeyPrefix={`legacy-inventory-${currentPath.split('/').pop()}`} dataSource={pageTransactions} columns={transactionColumns} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} /></Card>}

      {isAssembly && currentPath.endsWith('/production') && <Card title="Lệnh sản xuất và lắp ráp đã ghi nhận" style={cardStyle}><div style={{ marginBottom: 12, color: '#64748B', fontSize: 12 }}>Lệnh sản xuất tiêu thụ vật tư theo tồn thực, tính giá thành từ chi phí các thành phần và nhập thành phẩm vào kho.</div><KTable viewKeyPrefix="legacy-inventory-production" dataSource={pageTransactions.filter((entry) => entry.type === 'Lắp ráp')} columns={transactionColumns} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} /></Card>}

      {isDelivery && <Card title="Phiếu giao hàng và trạng thái vận chuyển" style={cardStyle}><KTable viewKeyPrefix="legacy-inventory-delivery" dataSource={pageTransactions} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} columns={[
        { title: 'Mã phiếu', dataIndex: 'transactionCode', key: 'code', render: (code: string) => <strong>{code}</strong> },
        { title: 'Ngày', dataIndex: 'transactionDate', key: 'date' },
        { title: 'Người nhận', dataIndex: 'recipient', key: 'recipient' },
        { title: 'Địa chỉ', dataIndex: 'deliveryAddress', key: 'address' },
        { title: 'Đơn vị vận chuyển', dataIndex: 'carrier', key: 'carrier' },
        { title: 'Mã vận đơn', dataIndex: 'trackingNumber', key: 'tracking' },
        { title: 'Hàng giao', dataIndex: 'lines', key: 'lines', render: (lines: InventoryLine[] = []) => lines.map((line) => `${line.sku} × ${line.quantity}`).join(', ') },
        { title: 'Đã nhận trả', key: 'returns', render: (_: unknown, item: InventoryTransaction) => (item.shipmentReturns || []).length ? `${(item.shipmentReturns || []).reduce((sum, receipt) => sum + Number(receipt.totalQuantity || receipt.lines?.reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0) || 0), 0)} · ${(item.shipmentReturns || []).length} phiếu` : '—' },
        { title: 'Trạng thái', dataIndex: 'shipmentStatus', key: 'shipmentStatus', render: (status: string) => <Tag color={status === 'Đã giao' ? 'success' : status === 'Giao thất bại' ? 'error' : 'processing'}>{status}</Tag> },
        { title: 'Cập nhật', key: 'actions', render: (_: unknown, item: InventoryTransaction) => item.shipmentStatus === 'Chờ giao' ? <Button size="small" loading={saving} onClick={() => void updateShipment(item, 'Đang giao')}>Bắt đầu giao</Button> : item.shipmentStatus === 'Đang giao' ? <div style={{ display: 'flex', gap: 6 }}><Button size="small" type="primary" onClick={() => void updateShipment(item, 'Đã giao')}>Đã giao</Button><Button size="small" danger onClick={() => void updateShipment(item, 'Giao thất bại')}>Thất bại</Button></div> : item.shipmentStatus === 'Giao thất bại' && item.lines.some((_, index) => shipmentLineRemainingQty(item, index) > 0) ? <Button size="small" type="primary" loading={saving} onClick={() => openShipmentReturn(item)}>Nhận hàng về</Button> : item.shipmentStatus === 'Giao thất bại' ? 'Đã nhận đủ' : '—' },
      ]} /></Card>}

      {isCosting && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <Card title="Giá trị và phương pháp tính giá tồn" style={cardStyle}><KTable viewKeyPrefix="legacy-inventory-costing" dataSource={data} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} columns={[
          { title: 'SKU', dataIndex: 'sku', key: 'sku' }, { title: 'Tên hàng', dataIndex: 'name', key: 'name' },
          { title: 'Phương pháp xuất', dataIndex: 'issueMethod', key: 'method', render: (value: string) => settings.issueMethodMode === 'Dùng chung' ? `${settings.issueMethod} (dùng chung)` : value || 'FIFO' },
          { title: 'Số lượng tồn', dataIndex: 'stockQty', key: 'qty' }, { title: 'Đơn giá bình quân', dataIndex: 'unitPrice', key: 'unitPrice', render: (value: number) => money(value) },
          { title: 'Giá trị tồn', key: 'value', render: (_: unknown, item: InventoryItem) => money(Number(item.stockQty || 0) * Number(item.unitPrice || 0)) },
        ]} /></Card>
        <Card title="Giá vốn giao dịch xuất" style={cardStyle}><KTable viewKeyPrefix="legacy-inventory-issued-cost" dataSource={transactions.filter((entry) => ['Xuất kho', 'Giao hàng'].includes(entry.type))} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} columns={[
          { title: 'Mã phiếu', dataIndex: 'transactionCode', key: 'code' }, { title: 'Ngày', dataIndex: 'transactionDate', key: 'date' },
          { title: 'Mặt hàng', dataIndex: 'lines', key: 'lines', render: (lines: InventoryLine[] = []) => lines.map((line) => `${line.sku} × ${line.quantity}`).join(', ') },
          { title: 'Giá vốn', dataIndex: 'totalAmount', key: 'amount', render: (value: number) => money(value) },
        ]} /></Card>
      </div>}

      {isCharts && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <Card title="Phân bổ giá trị tồn theo kho" style={cardStyle}>{[...warehouseValue.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => { const percent = totalInventoryValue ? Math.round(value / totalInventoryValue * 1000) / 10 : 0; return <div key={name} style={{ margin: '10px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><strong>{name}</strong><span>{money(value)} ({percent}%)</span></div><Progress percent={percent} strokeColor="#009688" /></div>; })}{!warehouseValue.size && <div>Chưa có tồn kho để phân tích.</div>}</Card>
        <Card title="Cơ cấu tồn theo danh mục" style={cardStyle}>{[...categoryValue.entries()].sort((a, b) => b[1].value - a[1].value).map(([name, value]) => { const percent = totalInventoryValue ? Math.round(value.value / totalInventoryValue * 1000) / 10 : 0; return <div key={name} style={{ margin: '10px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><strong>{name}</strong><span>{value.quantity.toLocaleString('vi-VN')} chiếc · {money(value.value)}</span></div><Progress percent={percent} strokeColor="#2563EB" /></div>; })}{!categoryValue.size && <div>Chưa có danh mục để phân tích.</div>}</Card>
        <Card title="Luân chuyển hàng 12 tháng" style={cardStyle}><div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>Lượng xuất kho thực ghi nhận; số ngày tồn là ước tính theo tồn hiện tại và tốc độ xuất kỳ này.</div>{[...categoryValue.entries()].map(([name, value]) => { const annualOutflow = outflowByCategory.get(name) || 0; const days = annualOutflow > 0 ? Math.round(value.quantity * 365 / annualOutflow) : null; const turnover = value.quantity > 0 ? annualOutflow / value.quantity : 0; return <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #F1F5F9', padding: '8px 0', fontSize: 12 }}><span><strong>{name}</strong><div style={{ color: '#64748B' }}>Xuất 12 tháng: {annualOutflow.toLocaleString('vi-VN')} · {turnover.toFixed(1)} vòng tương đương</div></span><Tag color={days !== null && days <= 30 ? 'success' : 'blue'}>{days === null ? 'Chưa có lịch sử xuất' : `~${days} ngày tồn`}</Tag></div>; })}{!categoryValue.size && <div>Chưa có dữ liệu để tính luân chuyển.</div>}</Card>
      </div>}

      {isReports && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <Card style={cardStyle}><div style={{ color: '#64748B', fontSize: 12 }}>Phiếu trong bộ lọc</div><strong style={{ fontSize: 20 }}>{reportTransactions.length}</strong></Card>
          <Card style={cardStyle}><div style={{ color: '#64748B', fontSize: 12 }}>Lượng nhập</div><strong style={{ fontSize: 20, color: '#059669' }}>{reportTotals.inbound.toLocaleString('vi-VN')}</strong></Card>
          <Card style={cardStyle}><div style={{ color: '#64748B', fontSize: 12 }}>Lượng xuất / giao</div><strong style={{ fontSize: 20, color: '#2563EB' }}>{reportTotals.outbound.toLocaleString('vi-VN')}</strong></Card>
          <Card style={cardStyle}><div style={{ color: '#64748B', fontSize: 12 }}>Điều chuyển / kiểm kê</div><strong style={{ fontSize: 20 }}>{reportTotals.transfers} / {reportTotals.counts}</strong></Card>
        </div>
        <Card title="Bộ lọc và sổ giao dịch" style={cardStyle}>
          <div style={{ ...gridStyle, marginBottom: 12 }}>
            <Field label="Từ ngày"><input type="date" style={fieldStyle} value={reportFilter.from} onChange={(event) => setReportFilter((value) => ({ ...value, from: event.target.value }))} /></Field>
            <Field label="Đến ngày"><input type="date" style={fieldStyle} value={reportFilter.to} onChange={(event) => setReportFilter((value) => ({ ...value, to: event.target.value }))} /></Field>
            <Field label="Loại phiếu"><select style={fieldStyle} value={reportFilter.type} onChange={(event) => setReportFilter((value) => ({ ...value, type: event.target.value }))}><option value="">Tất cả giao dịch</option>{['Nhập kho', 'Xuất kho', 'Điều chuyển', 'Kiểm kê', 'Giao hàng', 'Lắp ráp', 'Tháo dỡ'].map((type) => <option key={type}>{type}</option>)}</select></Field>
            <Field label="Kho"><select style={fieldStyle} value={reportFilter.warehouse} onChange={(event) => setReportFilter((value) => ({ ...value, warehouse: event.target.value }))}><option value="">Tất cả kho</option>{warehouseValues.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></Field>
            <Field label="Tìm mã phiếu / SKU / mặt hàng"><input style={fieldStyle} value={reportFilter.query} onChange={(event) => setReportFilter((value) => ({ ...value, query: event.target.value }))} /></Field>
          </div>
          <KTable viewKeyPrefix="legacy-inventory-reports" dataSource={reportTransactions} columns={transactionColumns} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} />
        </Card>
      </div>}

      {isCategories && <Card title="Nhóm danh mục đang sử dụng" style={cardStyle}><div style={{ marginBottom: 10, fontSize: 12, color: '#64748B' }}>Nhóm hàng được chỉnh sửa tại thông tin từng mặt hàng; các tên dưới đây lấy từ mặt hàng thật và cấu hình kho.</div><KTable viewKeyPrefix="legacy-inventory-categories" dataSource={[...new Set([...settings.categoryNames, ...data.map((item) => item.category).filter(Boolean)])].map((category) => ({ key: category, category, count: data.filter((item) => item.category === category).length, quantity: data.filter((item) => item.category === category).reduce((sum, item) => sum + Number(item.stockQty || 0), 0), value: data.filter((item) => item.category === category).reduce((sum, item) => sum + Number(item.stockQty || 0) * Number(item.unitPrice || 0), 0) }))} rowKey="key" columns={[{ title: 'Tên nhóm hàng', dataIndex: 'category', key: 'category', render: (value: string) => <strong>{value}</strong> }, { title: 'Mặt hàng', dataIndex: 'count', key: 'count' }, { title: 'Tồn', dataIndex: 'quantity', key: 'quantity' }, { title: 'Giá trị tồn', dataIndex: 'value', key: 'value', render: (value: number) => money(value) }]} /></Card>}

      {isSettings && <Card title="Thiết lập vận hành kho" style={cardStyle}><form onSubmit={saveSettings}>
        <div style={gridStyle}>
          <Field label="Phương pháp xuất kho áp dụng"><select style={fieldStyle} value={settings.issueMethodMode} onChange={(event) => setSettings((current) => ({ ...current, issueMethodMode: event.target.value as InventorySettings['issueMethodMode'] }))}><option>Mỗi mặt hàng</option><option>Dùng chung</option></select></Field>
          <Field label="Phương pháp chung"><select style={fieldStyle} value={settings.issueMethod} onChange={(event) => setSettings((current) => ({ ...current, issueMethod: event.target.value as InventorySettings['issueMethod'] }))}><option>FIFO</option><option>LIFO</option><option>Bình quân</option></select></Field>
          <Field label="Tên kho (mỗi dòng một kho)"><textarea style={{ ...fieldStyle, minHeight: 96 }} value={settings.warehouseNames.join('\n')} onChange={(event) => setSettings((current) => ({ ...current, warehouseNames: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) }))} /></Field>
          <Field label="Nhóm hàng (mỗi dòng một nhóm)"><textarea style={{ ...fieldStyle, minHeight: 96 }} value={settings.categoryNames.join('\n')} onChange={(event) => setSettings((current) => ({ ...current, categoryNames: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) }))} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0' }}>
          <label><input type="checkbox" checked={settings.lotManagedDefault} onChange={(event) => setSettings((current) => ({ ...current, lotManagedDefault: event.target.checked }))} /> Mặc định bật quản lý lô / hạn dùng</label>
          <label><input type="checkbox" checked={settings.barcodeManagedDefault} onChange={(event) => setSettings((current) => ({ ...current, barcodeManagedDefault: event.target.checked }))} /> Mặc định bật Barcode / QR</label>
        </div>
        <Button htmlType="submit" type="primary" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu cấu hình</Button>
      </form></Card>}

      <Modal open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={760} title={modalMode === 'product' ? editingProduct ? 'Chỉnh sửa mặt hàng' : 'Thêm mặt hàng vào danh mục' : `Tạo ${title.toLocaleLowerCase('vi-VN')}`}>
        {modalMode === 'product' ? <form onSubmit={submitProduct} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
          <div style={gridStyle}>
            <Field label="Mã SKU"><input required maxLength={80} style={fieldStyle} value={productDraft.sku || ''} onChange={(event) => updateProduct('sku', event.target.value)} /></Field>
            <Field label="Tên mặt hàng"><input required maxLength={255} style={fieldStyle} value={productDraft.name || ''} onChange={(event) => updateProduct('name', event.target.value)} /></Field>
            <Field label="Nhóm danh mục"><input required list="inventory-categories" style={fieldStyle} value={productDraft.category || ''} onChange={(event) => updateProduct('category', event.target.value)} /><datalist id="inventory-categories">{settings.categoryNames.map((category) => <option key={category} value={category} />)}</datalist></Field>
            <Field label="Đơn vị tính"><input required style={fieldStyle} value={productDraft.unit || ''} onChange={(event) => updateProduct('unit', event.target.value)} /></Field>
            <Field label="Tồn tối thiểu"><input type="number" min={0} step={1} style={fieldStyle} value={productDraft.minQty ?? 0} onChange={(event) => updateProduct('minQty', event.target.value)} /></Field>
            <Field label="Tồn tối đa (0 = không giới hạn)"><input type="number" min={0} step={1} style={fieldStyle} value={productDraft.maxQty ?? 0} onChange={(event) => updateProduct('maxQty', event.target.value)} /></Field>
            <Field label="Đơn giá vốn"><input type="number" min={0} step={1} style={fieldStyle} value={productDraft.unitPrice ?? 0} onChange={(event) => updateProduct('unitPrice', event.target.value)} /></Field>
            <Field label="Kho mặc định"><select style={fieldStyle} value={productDraft.warehouse || warehouseValues[0]} onChange={(event) => changeProductWarehouse(event.target.value)}>{warehouseValues.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></Field>
            <Field label="Vị trí lưu trữ">
              {activeLocationsFor(productDraft.warehouse || warehouseValues[0]).length ? <select style={fieldStyle} value={productDraft.storageLocation || ''} onChange={(event) => updateStorageAssignment(productDraft.warehouse || warehouseValues[0], event.target.value)}>
                <option value="">Chưa gán vị trí</option>
                {productDraft.storageLocation && !activeLocationsFor(productDraft.warehouse || warehouseValues[0]).some((location) => location.code === productDraft.storageLocation) && <option value={productDraft.storageLocation}>Vị trí đang lưu: {productDraft.storageLocation}</option>}
                {activeLocationsFor(productDraft.warehouse || warehouseValues[0]).map((location) => <option key={location.key} value={location.code}>{location.code}{location.zone ? ` · ${location.zone}` : ''}{location.shelf ? ` · ${location.shelf}` : ''}</option>)}
              </select> : <input maxLength={160} style={fieldStyle} value={productDraft.storageLocation || ''} onChange={(event) => updateProduct('storageLocation', event.target.value)} />}
            </Field>
            <Field label="Barcode / QR"><input style={fieldStyle} value={productDraft.barcode || ''} onChange={(event) => updateProduct('barcode', event.target.value)} /></Field>
            <Field label="Phương pháp xuất kho"><select style={fieldStyle} value={productDraft.issueMethod || 'FIFO'} onChange={(event) => updateProduct('issueMethod', event.target.value)}><option>FIFO</option><option>LIFO</option><option>Bình quân</option></select></Field>
          </div>
          {!!additionalProductWarehouses.length && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {additionalProductWarehouses.map((warehouse) => {
              const choices = activeLocationsFor(warehouse);
              const assigned = productDraft.storageAssignments?.find((entry: { warehouse: string }) => entry.warehouse === warehouse)?.locationCode || '';
              if (!choices.length) return null;
              return <Field key={warehouse} label={`Vị trí tại ${warehouse}`}><select style={fieldStyle} value={assigned} onChange={(event) => updateStorageAssignment(warehouse, event.target.value)}>
                <option value="">Chưa gán vị trí</option>
                {assigned && !choices.some((location) => location.code === assigned) && <option value={assigned}>Vị trí đang lưu: {assigned}</option>}
                {choices.map((location) => <option key={location.key} value={location.code}>{location.code}{location.zone ? ` · ${location.zone}` : ''}{location.shelf ? ` · ${location.shelf}` : ''}</option>)}
              </select></Field>;
            })}
          </div>}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}><label><input type="checkbox" checked={Boolean(productDraft.lotManaged)} onChange={(event) => updateProduct('lotManaged', event.target.checked)} /> Quản lý số lô và hạn dùng</label><label><input type="checkbox" checked={Boolean(productDraft.barcodeManaged)} onChange={(event) => updateProduct('barcodeManaged', event.target.checked)} /> Bắt buộc Barcode / QR</label></div>
          {!editingProduct && <div style={{ color: '#64748B', fontSize: 12 }}>Số lượng tồn chỉ thay đổi qua phiếu nhập, xuất, điều chuyển, lắp ráp hoặc kiểm kê.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={() => setModalOpen(false)}>Hủy</Button><Button htmlType="submit" type="primary" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu mặt hàng</Button></div>
        </form> : <form onSubmit={submitTransaction} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
          <div style={gridStyle}>
            <Field label="Mã phiếu"><input required maxLength={100} style={fieldStyle} value={transactionDraft.transactionCode || ''} onChange={(event) => updateTransaction('transactionCode', event.target.value)} /></Field>
            <Field label="Ngày giao dịch"><input required type="date" style={fieldStyle} value={transactionDraft.transactionDate || today} onChange={(event) => updateTransaction('transactionDate', event.target.value)} /></Field>
            {isAssembly && <Field label="Loại lệnh"><select style={fieldStyle} value={transactionDraft.type} onChange={(event) => updateTransaction('type', event.target.value)}><option>Lắp ráp</option><option>Tháo dỡ</option></select></Field>}
            {!isImport && !isAssembly && <Field label="Kho xuất / kho kiểm kê"><select style={fieldStyle} value={transactionDraft.sourceWarehouse} onChange={(event) => updateTransaction('sourceWarehouse', event.target.value)}>{warehouseValues.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></Field>}
            {(isImport || isTransfer) && <Field label="Kho nhận"><select style={fieldStyle} value={transactionDraft.destinationWarehouse} onChange={(event) => updateTransaction('destinationWarehouse', event.target.value)}>{warehouseValues.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></Field>}
            {(isExport || isAssembly) && <Field label="Kho sản xuất / nhận thành phẩm"><select style={fieldStyle} value={transactionDraft.destinationWarehouse} onChange={(event) => updateTransaction('destinationWarehouse', event.target.value)}>{warehouseValues.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></Field>}
            {(isExport || isAssembly) && <Field label="Lý do / lệnh liên quan"><input required maxLength={255} style={fieldStyle} value={transactionDraft.reason} onChange={(event) => updateTransaction('reason', event.target.value)} /></Field>}
            {isDelivery && <><Field label="Người nhận"><input required maxLength={255} style={fieldStyle} value={transactionDraft.recipient} onChange={(event) => updateTransaction('recipient', event.target.value)} /></Field><Field label="Địa chỉ giao hàng"><input required maxLength={500} style={fieldStyle} value={transactionDraft.deliveryAddress} onChange={(event) => updateTransaction('deliveryAddress', event.target.value)} /></Field><Field label="Đơn vị vận chuyển"><input style={fieldStyle} value={transactionDraft.carrier} onChange={(event) => updateTransaction('carrier', event.target.value)} /></Field><Field label="Mã vận đơn"><input style={fieldStyle} value={transactionDraft.trackingNumber} onChange={(event) => updateTransaction('trackingNumber', event.target.value)} /></Field></>}
            {isAudit && <Field label="Ghi chú kiểm kê"><input style={fieldStyle} value={transactionDraft.notes} onChange={(event) => updateTransaction('notes', event.target.value)} /></Field>}
            {isImport && <Field label="Nhà cung cấp / tham chiếu"><input style={fieldStyle} value={transactionDraft.reason} onChange={(event) => updateTransaction('reason', event.target.value)} /></Field>}
            {isTransfer && <Field label="Lý do điều chuyển"><input style={fieldStyle} value={transactionDraft.reason} onChange={(event) => updateTransaction('reason', event.target.value)} /></Field>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Dòng hàng</strong><Button size="small" icon={<PlusOutlined />} onClick={() => setDraftLines((current) => [...current, newLine(data[0]?.key || '', settings.warehouseNames[0] || 'Kho chính')])}>Thêm dòng</Button></div>
          {draftLines.map((line, index) => {
            const product = data.find((item) => item.key === line.productKey);
            const assemblyOutput = isAssembly && (transactionDraft.type === 'Lắp ráp' ? line.direction === 'Thành phẩm' : line.direction === 'Thành phần');
            const auditLotQty = product?.lots?.filter((lot) => lot.warehouse === transactionDraft.sourceWarehouse && lot.lotCode === line.lotCode).reduce((sum, lot) => sum + lot.quantity, 0) || 0;
            const requiresExpiry = isImport || assemblyOutput || isAudit && Number(line.actualQty) > auditLotQty;
            return <div key={line.id} style={{ padding: 10, border: '1px solid #E2E8F0', borderRadius: 8 }}><div style={{ ...gridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))' }}>
              <Field label="Mặt hàng"><select required style={fieldStyle} value={line.productKey} onChange={(event) => updateLine(index, 'productKey', event.target.value)}><option value="">Chọn mặt hàng</option>{data.map((item) => <option key={item.key} value={item.key}>{item.sku} · {item.name}</option>)}</select></Field>
              {isAssembly && <Field label={transactionDraft.type === 'Lắp ráp' ? 'Vai trò (thành phần xuất / thành phẩm nhập)' : 'Vai trò (thành phẩm xuất / thành phần nhập)'}><select style={fieldStyle} value={line.direction} onChange={(event) => updateLine(index, 'direction', event.target.value as DraftLine['direction'])}><option>Thành phần</option><option>Thành phẩm</option></select></Field>}
              {isAudit ? <Field label="Số lượng thực tế"><input required type="number" min={0} step="0.001" style={fieldStyle} value={line.actualQty} onChange={(event) => updateLine(index, 'actualQty', event.target.value)} /></Field> : <Field label="Số lượng"><input required type="number" min="0.001" step="0.001" style={fieldStyle} value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} /></Field>}
              {isImport && <Field label="Đơn giá nhập"><input required type="number" min={0} style={fieldStyle} value={line.unitCost} onChange={(event) => updateLine(index, 'unitCost', event.target.value)} /></Field>}
              {isAudit && <Field label="Đơn giá điều chỉnh"><input type="number" min={0} style={fieldStyle} value={line.unitCost} onChange={(event) => updateLine(index, 'unitCost', event.target.value)} /></Field>}
              {product?.lotManaged && <Field label="Số lô"><input required={isImport || isAudit || assemblyOutput} style={fieldStyle} value={line.lotCode} onChange={(event) => updateLine(index, 'lotCode', event.target.value)} /></Field>}
              {product?.lotManaged && requiresExpiry && <Field label="Hạn sử dụng khi tăng tồn"><input required type="date" style={fieldStyle} value={line.expiryDate} onChange={(event) => updateLine(index, 'expiryDate', event.target.value)} /></Field>}
              {isAssembly && <Field label="Kho"><select style={fieldStyle} value={line.warehouse} onChange={(event) => updateLine(index, 'warehouse', event.target.value)}>{warehouseValues.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></Field>}
            </div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#64748B', fontSize: 11 }}><span>{product ? `Tồn hiện tại: ${product.stockQty} ${product.unit} · ${product.warehouse}` : 'Chọn mặt hàng để xem tồn'}</span>{draftLines.length > 1 && <Button size="small" danger onClick={() => setDraftLines((current) => current.filter((_, row) => row !== index))}>Bỏ dòng</Button>}</div></div>;
          })}
          {isDelivery && <Field label="Ghi chú giao hàng"><textarea style={{ ...fieldStyle, minHeight: 60 }} value={transactionDraft.notes} onChange={(event) => updateTransaction('notes', event.target.value)} /></Field>}
          {isAssembly && <div style={{ color: '#64748B', fontSize: 12 }}>Chi phí thành phẩm được tính từ giá vốn thực tế của các dòng thành phần đã xuất.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={() => setModalOpen(false)}>Hủy</Button><Button htmlType="submit" type="primary" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Ghi nhận phiếu</Button></div>
        </form>}
      </Modal>
      <Modal open={locationModalOpen} onCancel={() => { if (!saving) setLocationModalOpen(false); }} footer={null} width={720} title={editingLocation ? 'Cập nhật vị trí kho' : 'Thêm vị trí kho'}>
        <form onSubmit={submitLocation} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
          <div style={gridStyle}>
            <Field label="Kho"><select required style={fieldStyle} value={locationDraft.warehouse || warehouseValues[0]} onChange={(event) => setLocationDraft((current) => ({ ...current, warehouse: event.target.value }))}>{warehouseValues.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></Field>
            <Field label="Mã vị trí"><input required maxLength={80} style={fieldStyle} value={locationDraft.code || ''} onChange={(event) => setLocationDraft((current) => ({ ...current, code: event.target.value }))} /></Field>
            <Field label="Khu vực"><input maxLength={80} style={fieldStyle} value={locationDraft.zone || ''} onChange={(event) => setLocationDraft((current) => ({ ...current, zone: event.target.value }))} /></Field>
            <Field label="Kệ / ngăn"><input maxLength={80} style={fieldStyle} value={locationDraft.shelf || ''} onChange={(event) => setLocationDraft((current) => ({ ...current, shelf: event.target.value }))} /></Field>
            <Field label="Sức chứa mặt hàng"><input required type="number" min={1} max={1000000} step={1} style={fieldStyle} value={locationDraft.capacityItems ?? 10} onChange={(event) => setLocationDraft((current) => ({ ...current, capacityItems: event.target.value }))} /></Field>
            <Field label="Thứ tự lấy hàng"><input required type="number" min={1} max={100000} step={1} style={fieldStyle} value={locationDraft.pickOrder ?? 1} onChange={(event) => setLocationDraft((current) => ({ ...current, pickOrder: event.target.value }))} /></Field>
            <Field label="Trạng thái"><select style={fieldStyle} value={locationDraft.status || 'Đang hoạt động'} onChange={(event) => setLocationDraft((current) => ({ ...current, status: event.target.value }))}><option>Đang hoạt động</option><option>Tạm ngưng</option></select></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button disabled={saving} onClick={() => setLocationModalOpen(false)}>Hủy</Button><Button htmlType="submit" type="primary" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu vị trí</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(returnShipment)} onCancel={() => { if (!saving) setReturnShipment(null); }} footer={null} width={720} title="Nhận hàng giao thất bại về kho">
        {returnShipment && <form onSubmit={submitShipmentReturn} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
          <div style={{ padding: 10, borderRadius: 8, background: '#FFF7ED', color: '#9A3412', fontSize: 12 }}>
            Chỉ nhập số lượng đã nhận thực tế và còn dùng được. Hệ thống trả hàng về kho xuất ban đầu, giữ lô và giá vốn đã giao; hàng hỏng hoặc thiếu không được cộng vào tồn.
          </div>
          <div style={gridStyle}>
            <Field label="Mã phiếu nhận trả"><input disabled style={fieldStyle} value={returnCode} /></Field>
            <Field label="Ngày thực nhận"><input required type="date" style={fieldStyle} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(returnShipment.lines || []).map((line, index) => {
              const returned = shipmentLineReturnedQty(returnShipment, index);
              const remaining = shipmentLineRemainingQty(returnShipment, index);
              return <div key={`${line.itemKey}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 260px)', gap: 12, alignItems: 'center', padding: 10, border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <div><strong>{line.sku} · {line.name}</strong><div style={{ marginTop: 4, color: '#64748B', fontSize: 12 }}>Đã giao {line.quantity} {line.unit} · Đã nhận {returned} · Còn có thể nhận {remaining} · Kho {line.warehouse || returnShipment.sourceWarehouse}</div></div>
                <Field label={`SL nhận lại dùng được (tối đa ${remaining})`}><input type="number" min={0} max={remaining} step="0.001" disabled={remaining <= 0} style={fieldStyle} value={returnQuantities[index] ?? '0'} onChange={(event) => setReturnQuantities((current) => ({ ...current, [index]: event.target.value }))} /></Field>
              </div>;
            })}
          </div>
          <Field label="Ghi chú hàng hỏng / thiếu hoặc đối chiếu"><textarea maxLength={2000} style={{ ...fieldStyle, minHeight: 64 }} value={returnNotes} onChange={(event) => setReturnNotes(event.target.value)} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button disabled={saving} onClick={() => setReturnShipment(null)}>Hủy</Button><Button htmlType="submit" type="primary" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Ghi nhận hàng về kho</Button></div>
        </form>}
      </Modal>
    </div>
  );
};
