import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  PieChartOutlined,
  EyeOutlined,
  PrinterOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ThunderboltOutlined,
  AuditOutlined,
  AccountBookOutlined,
  DollarOutlined,
  CalendarOutlined,
  SettingOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Tooltip } from '../../custom-ui';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { buildDepreciationSchedule, type DepreciationMethod, type DepreciationScheduleRow } from './depreciationCalculations';
import { getEligibleDepreciationAssets } from './assetDepreciationRules';

export interface DepreciationItem {
  key: string;
  assetKey?: string;
  assetCode: string;
  assetName: string;
  category: string;
  department: string;
  costAccount: string; // TK Nợ: 642, 641, 627
  assetAccount: string; // TK Có: 2141, 2143
  depreciationMethod: DepreciationMethod;
  productionCapacity?: number;
  productionByPeriod?: Record<string, number>;
  openingDepreciatedMonths?: number;
  openingProductionByPeriod?: Record<string, number>;
  originalCost: number;
  residualValue: number; // Giá trị thanh lý ước tính
  lifeMonths: number;
  depreciatedMonths: number;
  openingBalanceImport?: {
    accumulatedDepreciation: number;
    depreciatedMonths: number;
    throughPeriod: string;
    importedAt: string;
    importedBy: string;
    importedById: string;
  };
  monthlyDeprec: number;
  yearlyDeprec: number;
  accumulatedDeprec: number;
  netBookValue: number;
  startDate: string;
  endDate: string;
  lastRunDate: string;
  status: 'Đang trích khấu hao' | 'Tạm dừng trích KH' | 'Đã trích hết 100%' | 'Đã thanh lý giảm tài sản';
  notes: string;
  scheduleList: DepreciationScheduleRow[];
}

const localDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const localPeriod = (date = new Date()) => localDate(date).slice(0, 7);
const previousPeriod = (period: string) => {
  const date = new Date(`${period}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
};
const periodEndDate = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};
const normalizeMethod = (value: unknown): DepreciationMethod => {
  if (value === 'Số dư giảm dần có điều chỉnh' || value === 'Theo sản lượng / Công suất') return value;
  return 'Đường thẳng';
};
const normalizeAsset = (item: any): DepreciationItem => {
  const depreciationMethod = normalizeMethod(item.depreciationMethod);
  let scheduleList = Array.isArray(item.scheduleList) ? item.scheduleList : [];
  try {
    scheduleList = buildDepreciationSchedule({
      originalCost: Number(item.originalCost),
      residualValue: Number(item.residualValue || 0),
      lifeMonths: Number(item.lifeMonths),
      startDate: String(item.startDate || ''),
      depreciatedMonths: Number(item.depreciatedMonths || 0),
      method: depreciationMethod,
      productionCapacity: Number(item.productionCapacity),
      productionByPeriod: item.productionByPeriod || {},
    });
  } catch { /* Preserve a legacy schedule for records that still need accounting data corrected. */ }
  const importedMonths = Number(item.openingBalanceImport?.depreciatedMonths || 0);
  if (importedMonths > 0) scheduleList = scheduleList.map((row, index) => ({ ...row, imported: index < importedMonths }));
  return { ...item, key: item.key || item.id, depreciationMethod, scheduleList } as DepreciationItem;
};

function parseOpeningProductionHistory(value: unknown): Record<string, number> {
  const history: Record<string, number> = {};
  const lines = String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 120) throw new Error('Lịch sản lượng đầu kỳ không được quá 120 kỳ.');
  for (const line of lines) {
    const match = /^(\d{4}-(?:0[1-9]|1[0-2]))\s*:\s*(\d+)$/.exec(line);
    if (!match) throw new Error(`Dòng sản lượng đầu kỳ không hợp lệ: ${line}. Dùng định dạng YYYY-MM: số lượng.`);
    if (Object.prototype.hasOwnProperty.call(history, match[1])) throw new Error(`Kỳ ${match[1]} bị lặp trong lịch sản lượng đầu kỳ.`);
    const units = Number(match[2]);
    if (!Number.isSafeInteger(units)) throw new Error(`Sản lượng kỳ ${match[1]} phải là số nguyên hợp lệ.`);
    history[match[1]] = units;
  }
  return history;
}

import { useEffect } from 'react';
import { assetsApi, collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export const AssetDepreciationModule: React.FC = () => {
  const [data, setData] = useState<DepreciationItem[]>([]);
  const [inventoryAssets, setInventoryAssets] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<DepreciationItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runProductionUnits, setRunProductionUnits] = useState<Record<string, string>>({});
  const [runInProgress, setRunInProgress] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<DepreciationMethod>('Đường thẳng');
  const [selectedAssetForSetup, setSelectedAssetForSetup] = useState<any | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, assetsResponse] = await Promise.all([
        collectionsApi.get<DepreciationItem>('asset_depreciations', { limit: 500 }),
        collectionsApi.get<any>('asset_items', { limit: 500 }),
      ]);
      const list = res.data?.data || [];
      setData(list.map(normalizeAsset));
      setInventoryAssets(assetsResponse.data?.data || []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách khấu hao.');
    }
  };

  const eligibleAssets = getEligibleDepreciationAssets(inventoryAssets, data);

  useEffect(() => {
    void loadData();
  }, []);

  // Metrics
  const currentPeriod = localPeriod();
  const totalOriginal = data.reduce((sum, item) => sum + (Number(item.originalCost) || 0), 0);
  const totalAccumulated = data.reduce((sum, item) => sum + (Number(item.accumulatedDeprec) || 0), 0);
  const totalNetBook = data.reduce((sum, item) => sum + (Number(item.netBookValue) || 0), 0);
  const currentRunPlan = data.filter((item) => item.status === 'Đang trích khấu hao' && item.scheduleList?.[item.depreciatedMonths]?.period === currentPeriod);
  const totalMonthly = currentRunPlan.reduce((sum, item) => sum + (item.depreciationMethod === 'Theo sản lượng / Công suất' ? 0 : Number(item.scheduleList[item.depreciatedMonths]?.monthlyAmount || 0)), 0);
  const departmentPlan = currentRunPlan.reduce<Record<string, number>>((groups, item) => {
    if (item.depreciationMethod !== 'Theo sản lượng / Công suất') groups[item.department] = (groups[item.department] || 0) + Number(item.scheduleList[item.depreciatedMonths]?.monthlyAmount || 0);
    return groups;
  }, {});
  const productionItemsToRun = currentRunPlan.filter((item) => item.depreciationMethod === 'Theo sản lượng / Công suất');
  const selectedOpeningBalance = Number(selectedAssetForSetup?.accumulatedDepreciation || 0);

  const handleOpenCreate = () => {
    form.resetFields();
    setSelectedMethod('Đường thẳng');
    setSelectedAssetForSetup(null);
    form.setFieldsValue({
      costAccount: 'Nợ 6421 (CP Quản lý CNTT)',
      assetAccount: 'Có 2141 (Hao mòn TSCĐ hữu hình)',
      depreciationMethod: 'Đường thẳng',
      residualValue: 0,
    });
    setModalOpen(true);
  };

  const handleSelectAsset = (assetKey: string) => {
    const asset = eligibleAssets.find((item) => String(item.key || item.id) === String(assetKey));
    if (!asset) return;
    setSelectedAssetForSetup(asset);
    form.setFieldsValue({
      assetKey: String(asset.key || asset.id),
      assetCode: String(asset.code || asset.assetCode),
      assetName: String(asset.name || asset.assetName || ''),
      category: String(asset.category || ''),
      department: String(asset.department || ''),
      originalCost: Number(asset.originalPrice),
      lifeMonths: Number(asset.depreciationMonths),
      startDate: String(asset.purchaseDate || localDate()),
      residualValue: 0,
      openingAccumulatedDeprec: Number(asset.accumulatedDepreciation || 0),
      openingDepreciatedMonths: Number(asset.accumulatedDepreciation || 0) > 0 ? undefined : 0,
      openingProductionHistory: '',
    });
  };

  const handleCreate = async (values: any) => {
    if (!values.assetKey) {
      message.error('Chọn tài sản đang có trong danh mục trước khi thiết lập khấu hao.');
      return;
    }
    const orig = Number(values.originalCost);
    const residual = Number(values.residualValue || 0);
    const months = Number(values.lifeMonths);
    const start = String(values.startDate || '');
    const method = normalizeMethod(values.depreciationMethod);
    const sourceAsset = eligibleAssets.find((asset) => String(asset.key || asset.id) === String(values.assetKey));
    if (!sourceAsset) {
      message.error('Tài sản đã thay đổi hoặc không còn đủ điều kiện; hãy tải lại danh sách.');
      return;
    }
    const openingAccumulated = Number(sourceAsset.accumulatedDepreciation || 0);
    const openingMonths = Number(values.openingDepreciatedMonths || 0);
    let productionByPeriod: Record<string, number> = {};
    let scheduleList: DepreciationScheduleRow[];
    try {
      if (method === 'Theo sản lượng / Công suất' && openingMonths > 0) {
        productionByPeriod = parseOpeningProductionHistory(values.openingProductionHistory);
        if (Object.values(productionByPeriod).reduce((sum, units) => sum + units, 0) > Number(values.productionCapacity)) {
          throw new Error('Tổng sản lượng đầu kỳ vượt công suất dự kiến trong vòng đời tài sản.');
        }
      }
      scheduleList = buildDepreciationSchedule({
        originalCost: orig,
        residualValue: residual,
        lifeMonths: months,
        startDate: start,
        depreciatedMonths: openingMonths,
        method,
        productionCapacity: Number(values.productionCapacity),
        productionByPeriod,
      });
      if (method === 'Theo sản lượng / Công suất' && openingMonths > 0) {
        const expectedPeriods = scheduleList.slice(0, openingMonths).map((row) => row.period).sort();
        if (JSON.stringify(Object.keys(productionByPeriod).sort()) !== JSON.stringify(expectedPeriods)) {
          throw new Error('Nhập sản lượng cho đúng từng tháng đã khấu hao đến hết kỳ trước.');
        }
      }
      const calculatedOpening = openingMonths ? Number(scheduleList[openingMonths - 1]?.accumulatedAmount || 0) : 0;
      if (calculatedOpening !== openingAccumulated) {
        throw new Error(`Khấu hao theo lịch là ${calculatedOpening.toLocaleString('vi-VN')} ₫, còn danh mục ghi ${openingAccumulated.toLocaleString('vi-VN')} ₫. Kiểm tra thời gian, phương pháp và giá trị thu hồi.`);
      }
      if (openingMonths > 0 && scheduleList[openingMonths - 1]?.period !== previousPeriod(currentPeriod)) {
        throw new Error(`Số dư đầu kỳ cần khớp lịch đến hết kỳ ${previousPeriod(currentPeriod)}.`);
      }
    } catch (error: any) {
      message.error(error?.message || 'Thông tin thiết lập khấu hao không hợp lệ.');
      return;
    }
    const id = `deprec-${crypto.randomUUID()}`;
    const endPeriod = scheduleList[scheduleList.length - 1]?.period;
    const openingPeriod = openingMonths ? scheduleList[openingMonths - 1]?.period : '';
    const formValues = { ...values };
    delete formValues.openingDepreciatedMonths;
    delete formValues.openingAccumulatedDeprec;
    delete formValues.openingProductionHistory;
    const preparedSchedule = scheduleList.map((row, index) => ({ ...row, imported: index < openingMonths }));
    const newItem: DepreciationItem = {
      ...formValues,
      key: id,
      assetKey: String(values.assetKey),
      depreciationMethod: method,
      originalCost: orig,
      residualValue: residual,
      lifeMonths: months,
      productionCapacity: method === 'Theo sản lượng / Công suất' ? Number(values.productionCapacity) : undefined,
      productionByPeriod,
      openingDepreciatedMonths: openingMonths,
      openingProductionByPeriod: productionByPeriod,
      depreciatedMonths: openingMonths,
      monthlyDeprec: scheduleList[openingMonths]?.monthlyAmount || 0,
      yearlyDeprec: scheduleList.filter((row) => row.period.startsWith(`${currentPeriod.slice(0, 4)}-`)).reduce((sum, row) => sum + row.monthlyAmount, 0),
      accumulatedDeprec: openingAccumulated,
      netBookValue: orig - openingAccumulated,
      startDate: start,
      endDate: endPeriod ? `${endPeriod}-01` : start,
      lastRunDate: openingPeriod ? periodEndDate(openingPeriod) : 'Chưa trích',
      status: openingMonths >= months || orig - openingAccumulated <= residual ? 'Đã trích hết 100%' : 'Đang trích khấu hao',
      notes: String(values.notes || ''),
      scheduleList: preparedSchedule,
    };
    try {
      await collectionsApi.create('asset_depreciations', newItem, id);
      message.success(`Đã thiết lập trích khấu hao: ${values.assetCode} (${values.assetName})`);
      setModalOpen(false);
      form.resetFields();
      setSelectedAssetForSetup(null);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể thiết lập trích khấu hao.');
    }
  };

  const handleToggleStatus = async (record: DepreciationItem) => {
    if (record.status === 'Đã trích hết 100%' || record.status === 'Đã thanh lý giảm tài sản') return;
    const nextStatus = record.status === 'Đang trích khấu hao' ? 'Tạm dừng trích KH' : 'Đang trích khấu hao';
    try {
      await collectionsApi.update('asset_depreciations', record.key, { status: nextStatus });
      message.info(`Đã chuyển trạng thái ${record.assetCode} sang "${nextStatus}"`);
      await loadData();
    } catch {
      message.error('Không thể đổi trạng thái khấu hao.');
    }
  };

  const handleRunMonthlyDepreciation = async () => {
    if (runInProgress) return;
    setRunInProgress(true);
    const today = localDate();
    const period = today.slice(0, 7);
    try {
      const assetResponse = await collectionsApi.get<DepreciationItem>('asset_depreciations', { limit: 500 });
      const savedItems = assetResponse.data?.data || [];
      const currentItems = savedItems.map((item: any) => ({ ...item, key: item.key || item.id, depreciationMethod: normalizeMethod(item.depreciationMethod) } as DepreciationItem));
      const candidates: Array<{ item: DepreciationItem; amount: number; productionUnits?: number }> = [];
      const skippedProduction: string[] = [];

      for (const item of currentItems) {
        if (item.status !== 'Đang trích khấu hao' || Number(item.depreciatedMonths) >= Number(item.lifeMonths) || String(item.lastRunDate || '').slice(0, 7) === period) continue;
        const periodIndex = Number(item.depreciatedMonths) || 0;
        const storedProduction = item.productionByPeriod || {};
        const productionByPeriod = { ...storedProduction };
        if (item.depreciationMethod === 'Theo sản lượng / Công suất') {
          const entered = Number(runProductionUnits[item.key]);
          const previouslyUsed = Object.values(storedProduction).reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
          const capacityLeft = Number(item.productionCapacity) - previouslyUsed;
          if (!Number.isFinite(entered) || entered <= 0 || entered > capacityLeft) {
            skippedProduction.push(item.assetCode);
            continue;
          }
          productionByPeriod[period] = entered;
        }

        let schedule: DepreciationScheduleRow[];
        try {
          schedule = buildDepreciationSchedule({
            originalCost: Number(item.originalCost),
            residualValue: Number(item.residualValue || 0),
            lifeMonths: Number(item.lifeMonths),
            startDate: item.startDate,
            depreciatedMonths: periodIndex,
            method: item.depreciationMethod,
            productionCapacity: Number(item.productionCapacity),
            productionByPeriod,
          });
        } catch (error: any) {
          skippedProduction.push(`${item.assetCode}: ${error?.message || 'dữ liệu chưa hợp lệ'}`);
          continue;
        }
        const openingAccumulated = periodIndex > 0 ? Number(schedule[periodIndex - 1]?.accumulatedAmount || 0) : 0;
        if (Math.abs(openingAccumulated - Number(item.accumulatedDeprec || 0)) > 1) {
          skippedProduction.push(`${item.assetCode}: số lũy kế đã lưu không khớp lịch khấu hao`);
          continue;
        }
        const currentRow = schedule[periodIndex];
        if (!currentRow || currentRow.period !== period || currentRow.monthlyAmount <= 0) continue;
        candidates.push({
          item,
          amount: currentRow.monthlyAmount,
          ...(item.depreciationMethod === 'Theo sản lượng / Công suất' ? { productionUnits: Number(runProductionUnits[item.key]) } : {}),
        });
      }

      if (candidates.length === 0) {
        message.info(skippedProduction.length
          ? `Chưa ghi sổ. Nhập sản lượng hoặc sửa dữ liệu khấu hao cho: ${skippedProduction.join(', ')}.`
          : `Không có tài sản đang khấu hao đến kỳ ${period} cần ghi sổ.`);
        return;
      }

      const posted = await assetsApi.runDepreciation(period, candidates.map(({ item, amount, productionUnits }) => ({
        depreciationKey: item.key,
        amount,
        ...(productionUnits === undefined ? {} : { productionUnits }),
      })));
      message.success(`Đã ghi ${posted.data.count} bút toán kỳ ${period}, tổng ${posted.data.totalAmount.toLocaleString('vi-VN')} ₫.`);
      if (skippedProduction.length) message.warning(`Cần nhập sản lượng hoặc kiểm tra dữ liệu cho: ${skippedProduction.join(', ')}.`);
      setRunProductionUnits({});
      setRunModalOpen(false);
      await Promise.allSettled([dataService.refreshGenericData('finance_general_ledger'), loadData()]);
    } catch (error: any) {
      await Promise.all([
        dataService.refreshGenericData('finance_general_ledger').catch(() => []),
        loadData(),
      ]);
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu bút toán khấu hao.');
    } finally {
      setRunInProgress(false);
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.assetCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.costAccount || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchMethod = methodFilter === 'all' || item.depreciationMethod === methodFilter;

    return matchSearch && matchStatus && matchMethod;
  });

  const exportSchedule = (item: DepreciationItem) => {
    const rows = [
      ['Mã tài sản', item.assetCode], ['Tên tài sản', item.assetName], ['Kỳ bắt đầu', item.startDate],
      ['Nguyên giá', item.originalCost], ['Giá trị thu hồi', item.residualValue], ['Phương pháp', item.depreciationMethod],
      [], ['Kỳ', 'Tháng thứ', 'Mức khấu hao', 'Lũy kế', 'Giá trị còn lại', 'Trạng thái', 'Sản lượng'],
      ...item.scheduleList.map((row) => [row.period, row.monthNumber, row.monthlyAmount, row.accumulatedAmount, row.remainingAmount, row.imported ? 'Số dư đầu kỳ' : row.posted ? 'Đã ghi sổ' : 'Dự kiến', row.productionUnits ?? '']),
    ];
    downloadFile(`khau_hao_${String(item.assetCode).replace(/[^a-z0-9_-]/gi, '_')}.xlsx`, generateValidXlsxBlob(rows));
    message.success(`Đã xuất lịch khấu hao ${item.assetCode}.`);
  };

  const printSchedule = (item: DepreciationItem) => {
    const lines = [
      `Ma tai san: ${item.assetCode} | ${item.assetName}`,
      `Nguyen gia: ${Number(item.originalCost).toLocaleString('vi-VN')} VND | Gia tri thu hoi: ${Number(item.residualValue).toLocaleString('vi-VN')} VND`,
      `Phuong phap: ${item.depreciationMethod} | Thoi gian: ${item.lifeMonths} thang | Don vi: ${item.department}`,
      ...item.scheduleList.map((row) => `${row.period} | ${row.monthlyAmount.toLocaleString('vi-VN')} | Luy ke ${row.accumulatedAmount.toLocaleString('vi-VN')} | Con lai ${row.remainingAmount.toLocaleString('vi-VN')} | ${row.imported ? 'So du dau ky' : row.posted ? 'Da ghi so' : 'Du kien'}`),
    ];
    downloadFile(`khau_hao_${String(item.assetCode).replace(/[^a-z0-9_-]/gi, '_')}.pdf`, generateValidPdfBlob(`Lich khau hao ${item.assetCode}`, item.assetName, lines));
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nguyên giá TSCĐ theo dõi</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalOriginal.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{data.length} hồ sơ tài sản theo dõi khấu hao</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí khấu hao trích mỗi tháng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#B45309', marginTop: 4 }}>
            {totalMonthly.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 2 }}>Theo lịch kỳ hiện tại của tài sản đang chạy</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Khấu hao lũy kế gồm số dư đầu kỳ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalAccumulated.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            Đã trích {Math.round((totalAccumulated / Math.max(1, data.reduce((sum, item) => sum + Math.max(0, Number(item.originalCost) - Number(item.residualValue || 0)), 0))) * 100)}% giá trị được khấu hao
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giá trị còn lại</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalNetBook.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Ghi nhận trên Bảng Cân Đối Kế Toán</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã TS, tên tài sản, nhóm, phòng ban, TK..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 190 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Đang trích khấu hao', value: 'Đang trích khấu hao' },
              { label: 'Tạm dừng trích KH', value: 'Tạm dừng trích KH' },
              { label: 'Đã trích hết 100%', value: 'Đã trích hết 100%' },
            ]}
          />
          <Select
            value={methodFilter}
            onChange={setMethodFilter}
            style={{ width: 220 }}
            options={[
              { label: 'Tất cả phương pháp trích', value: 'all' },
              { label: 'Đường thẳng', value: 'Đường thẳng' },
              { label: 'Số dư giảm dần', value: 'Số dư giảm dần có điều chỉnh' },
              { label: 'Theo sản lượng', value: 'Theo sản lượng / Công suất' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => {
            const rows = [
              ['Mã tài sản', 'Tên tài sản', 'Nhóm', 'Phòng ban', 'Phương pháp', 'Nguyên giá', 'Giá trị thu hồi', 'Số tháng', 'Đã trích', 'Khấu hao lũy kế', 'Giá trị còn lại', 'Trạng thái'],
              ...filteredData.map((item) => [item.assetCode, item.assetName, item.category, item.department, item.depreciationMethod, item.originalCost, item.residualValue, item.lifeMonths, item.depreciatedMonths, item.accumulatedDeprec, item.netBookValue, item.status]),
            ];
            downloadFile('bang_phan_bo_khau_hao.xlsx', generateValidXlsxBlob(rows));
            message.success(`Đã xuất ${filteredData.length} tài sản theo bộ lọc hiện tại.`);
          }}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => { setRunProductionUnits({}); setRunModalOpen(true); }}
            style={{ backgroundColor: '#B45309', borderColor: '#B45309' }}
          >
            Chạy trích khấu hao tháng này
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thiết lập trích khấu hao
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã tài sản & Định khoản',
              key: 'code',
              width: 170,
              render: (_: any, r: DepreciationItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CalculatorOutlined /> {r.assetCode}
                  </span>
                  <Tag color="cyan" style={{ marginTop: 3, fontSize: 11 }}>
                    {r.costAccount}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Tên tài sản & Phòng ban',
              key: 'asset',
              render: (_: any, r: DepreciationItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.assetName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Nhóm: <strong>{r.category}</strong> · Đơn vị: <strong style={{ color: '#2563EB' }}>{r.department}</strong>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 2 }}>
                    Phương pháp: {r.depreciationMethod} ({r.lifeMonths} tháng)
                  </div>
                </div>
              ),
            },
            {
              title: 'Nguyên giá & Trích tháng',
              key: 'values',
              width: 200,
              render: (_: any, r: DepreciationItem) => (
                <div style={{ fontSize: 12 }}>
                  <div>Nguyên giá: <strong>{r.originalCost.toLocaleString('vi-VN')} ₫</strong></div>
                  <div style={{ color: '#B45309', fontWeight: 700, marginTop: 2 }}>
                    Trích/tháng: {r.monthlyDeprec.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
              ),
            },
            {
              title: 'Tiến độ trích',
              key: 'progress',
              width: 210,
              render: (_: any, r: DepreciationItem) => {
                const basis = Math.max(0, Number(r.originalCost) - Number(r.residualValue || 0));
                const pct = basis > 0 ? Math.min(100, Math.round((Number(r.accumulatedDeprec || 0) / basis) * 100)) : 0;
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: '#64748B' }}>Đã trích ({pct}%): <strong>{r.depreciatedMonths}/{r.lifeMonths}T</strong></span>
                      <strong style={{ color: '#16A34A' }}>{r.netBookValue.toLocaleString('vi-VN')} ₫</strong>
                    </div>
                    <Progress
                      percent={pct}
                      size="small"
                      strokeColor={pct >= 100 ? '#64748B' : '#009688'}
                      showInfo={false}
                    />
                  </div>
                );
              },
            },
            {
              title: 'Kỳ trích gần nhất',
              dataIndex: 'lastRunDate',
              key: 'lastRunDate',
              width: 120,
              render: (d: string) => <span style={{ fontSize: 12 }}>{d}</span>,
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => {
                let col = 'success';
                if (s.includes('Tạm dừng')) col = 'warning';
                if (s.includes('100%')) col = 'default';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 170,
              render: (_: any, r: DepreciationItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem lịch trình trích khấu hao chi tiết từng tháng"
                  >
                    Kế hoạch
                  </Button>
                  {r.status !== 'Đã trích hết 100%' && (
                    <Tooltip title={r.status === 'Đang trích khấu hao' ? 'Tạm dừng trích khấu hao' : 'Tiếp tục trích khấu hao'}>
                      <Button
                        size="small"
                        icon={r.status === 'Đang trích khấu hao' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                        onClick={() => handleToggleStatus(r)}
                      />
                    </Tooltip>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Thiết lập trích khấu hao mới 100% trường nhập */}
      <Modal
        title="Thiết Lập Khấu Hao Tài Sản Cố Định"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          {!eligibleAssets.length && <Alert type="info" showIcon message="Không có tài sản đủ điều kiện để lập hồ sơ khấu hao." description="Danh sách gồm tài sản đang sử dụng hoặc trong kho, chưa có hồ sơ khấu hao, có nguyên giá, số dư sổ và thời gian khấu hao hợp lệ." style={{ marginBottom: 14 }} />}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="assetKey" label="Tài sản trong danh mục" rules={[{ required: true }]}>
              <Select
                showSearch
                placeholder={eligibleAssets.length ? 'Chọn tài sản...' : 'Không có tài sản đủ điều kiện'}
                options={eligibleAssets.map((asset) => ({
                  value: String(asset.key || asset.id),
                  label: `${asset.code || asset.assetCode} — ${asset.name || asset.assetName}${Number(asset.accumulatedDepreciation || 0) > 0 ? ` · Lũy kế ${Number(asset.accumulatedDepreciation).toLocaleString('vi-VN')} ₫` : ''}`,
                }))}
                onChange={handleSelectAsset}
              />
            </Form.Item>
            <Form.Item name="assetCode" label="Mã tài sản">
              <Input disabled />
            </Form.Item>
            <Form.Item name="assetName" label="Tên tài sản">
              <Input disabled />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="category" label="Nhóm tài sản">
              <Input disabled />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban sử dụng">
              <Input disabled />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="depreciationMethod" label="Phương pháp trích khấu hao" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Đường thẳng', value: 'Đường thẳng' },
                  { label: 'Số dư giảm dần có điều chỉnh', value: 'Số dư giảm dần có điều chỉnh' },
                  { label: 'Theo sản lượng / Công suất', value: 'Theo sản lượng / Công suất' },
                ]}
                onChange={(value) => setSelectedMethod(normalizeMethod(value))}
              />
            </Form.Item>
            <Form.Item name="costAccount" label="Tài khoản Nợ" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Nợ 6421', value: 'Nợ 6421 (CP Quản lý CNTT)' },
                  { label: 'Nợ 6422', value: 'Nợ 6422 (CP Vật liệu & CCDC Văn phòng)' },
                  { label: 'Nợ 641', value: 'Nợ 641 (CP Bán Hàng)' },
                  { label: 'Nợ 627', value: 'Nợ 627 (CP Sản xuất chung)' },
                ]}
              />
            </Form.Item>
            <Form.Item name="assetAccount" label="Tài khoản Có" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Có 2141', value: 'Có 2141 (Hao mòn TSCĐ hữu hình)' },
                  { label: 'Có 2143', value: 'Có 2143 (Hao mòn TSCĐ vô hình)' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="originalCost" label="Nguyên giá tài sản (VNĐ)" rules={[{ required: true }]}>
              <Input disabled type="number" />
            </Form.Item>
            <Form.Item name="residualValue" label="Giá trị thanh lý ước tính (VNĐ)">
              <Input type="number" min={0} step={1} placeholder="Ví dụ: 10000000" />
            </Form.Item>
            <Form.Item name="lifeMonths" label="Thời gian trích" rules={[{ required: true }]}>
              <Input disabled type="number" />
            </Form.Item>
          </div>

          {selectedAssetForSetup && selectedOpeningBalance > 0 && (
            <>
              <Alert
                type="warning"
                showIcon
                message="Tài sản có số dư khấu hao từ kỳ trước"
                description={`Danh mục đang ghi lũy kế ${selectedOpeningBalance.toLocaleString('vi-VN')} ₫. Nhập số tháng đã trích đến hết ${previousPeriod(currentPeriod)}; hệ thống chỉ nhận khi phương pháp và lịch khớp chính xác. Số dư đầu kỳ được chuyển vào hồ sơ, không tạo lại bút toán các kỳ cũ.`}
                style={{ marginBottom: 14 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="openingDepreciatedMonths" label="Số tháng đã khấu hao đầu kỳ" rules={[{ required: true, message: 'Nhập số tháng đã khấu hao.' }]}>
                  <Input type="number" min={1} max={selectedAssetForSetup.depreciationMonths} step={1} placeholder="Ví dụ: 12" />
                </Form.Item>
                <Form.Item name="openingAccumulatedDeprec" label="Khấu hao lũy kế trong danh mục">
                  <Input type="number" disabled />
                </Form.Item>
              </div>
              {selectedMethod === 'Theo sản lượng / Công suất' && (
                <Form.Item name="openingProductionHistory" label="Sản lượng từng kỳ đã chốt đầu kỳ" rules={[{ required: true, message: 'Nhập sản lượng cho từng kỳ đã khấu hao.' }]}>
                  <Input.TextArea rows={3} placeholder={'YYYY-MM: số lượng\nVí dụ: 2025-10: 120'} />
                </Form.Item>
              )}
            </>
          )}

          {selectedMethod === 'Theo sản lượng / Công suất' && (
            <Form.Item name="productionCapacity" label="Tổng sản lượng dự kiến trong vòng đời tài sản" rules={[{ required: true }]}>
              <Input type="number" min={1} step={1} placeholder="Nhập công suất sản lượng theo hồ sơ tài sản" />
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12 }}>
            <Form.Item name="startDate" label="Ngày bắt đầu trích khấu hao" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="notes" label="Ghi chú hạch toán kế toán">
              <Input placeholder="Ví dụ: Phê duyệt theo Quyết định đầu tư số 88/QĐ-HĐQT..." />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu cấu hình khấu hao
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Kế Hoạch & Lịch Trình Khấu Hao Chi Tiết Từng Tháng */}
      <Drawer
        title="Bảng Kế Hoạch Phân Bổ Khấu Hao Chi Tiết Từng Tháng"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={650}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Passport */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.assetCode}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.assetName}</div>
                </div>
                <Tag color={detailItem.status === 'Đang trích khấu hao' ? 'success' : 'warning'}>{detailItem.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Đơn vị: <strong>{detailItem.department}</strong> · Phương pháp: <strong>{detailItem.depreciationMethod}</strong>
              </div>
            </div>

            {/* Financial Stats Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F8FAFC' }}>
                <div style={{ fontSize: 11, color: '#64748B' }}>NGUYÊN GIÁ</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                  {detailItem.originalCost.toLocaleString('vi-VN')} ₫
                </div>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#FEF3C7' }}>
                <div style={{ fontSize: 11, color: '#92400E' }}>TRÍCH / THÁNG</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#B45309', marginTop: 2 }}>
                  {detailItem.monthlyDeprec.toLocaleString('vi-VN')} ₫
                </div>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F0FDF4' }}>
                <div style={{ fontSize: 11, color: '#166534' }}>GIÁ TRỊ CÒN LẠI</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {detailItem.netBookValue.toLocaleString('vi-VN')} ₫
                </div>
              </div>
            </div>

            {/* Accounting Rule Info */}
            <div style={{ background: '#EFF6FF', padding: 10, borderRadius: 6, border: '1px solid #BFDBFE', fontSize: 12 }}>
              <strong style={{ color: '#1E40AF' }}>Bút toán hạch toán định kỳ:</strong>
              <div style={{ color: '#1E3A8A', marginTop: 2 }}>
                - Định khoản: <strong>{detailItem.costAccount}</strong> / <strong>{detailItem.assetAccount}</strong>
              </div>
              <div style={{ color: '#64748B', marginTop: 1 }}>
                - Thời gian phân bổ: Từ <strong>{detailItem.startDate}</strong> đến <strong>{detailItem.endDate}</strong> ({detailItem.lifeMonths} tháng)
              </div>
            </div>
            {detailItem.openingBalanceImport && (
              <Alert
                type="info"
                showIcon
                message={`Đã nhập số dư đầu kỳ đến ${detailItem.openingBalanceImport.throughPeriod}`}
                description={`${detailItem.openingBalanceImport.accumulatedDepreciation.toLocaleString('vi-VN')} ₫ · ${detailItem.openingBalanceImport.depreciatedMonths} tháng · Người nhập ${detailItem.openingBalanceImport.importedBy}. Bút toán các kỳ trước không được tạo lại.`}
              />
            )}

            {/* Monthly Schedule Table */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Lịch trình phân bổ {detailItem.lifeMonths} tháng ({detailItem.scheduleList?.filter((s) => s.posted).length || 0} tháng đã ghi hoặc nhập đầu kỳ):
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#F1F5F9', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #CBD5E1' }}>Kỳ</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #CBD5E1' }}>Mức trích kỳ này</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #CBD5E1' }}>Lũy kế đã trích</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #CBD5E1' }}>Giá trị còn lại</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #CBD5E1' }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItem.scheduleList?.map((row, idx) => (
                      <tr key={idx} style={{ background: row.posted ? '#F0FDF4' : '#FFFFFF', borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{row.period} (T{row.monthNumber})</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#B45309' }}>{row.monthlyAmount.toLocaleString('vi-VN')} ₫</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{row.accumulatedAmount.toLocaleString('vi-VN')} ₫</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#16A34A' }}>{row.remainingAmount.toLocaleString('vi-VN')} ₫</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          {row.imported ? <Tag color="blue">Số dư đầu kỳ</Tag> : row.posted ? <Tag color="success">Đã ghi sổ</Tag> : <Tag color="default">Dự kiến</Tag>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printSchedule(detailItem)}
                style={{ flex: 1 }}
              >
                In bảng khấu hao (PDF)
              </Button>
              <Button icon={<DownloadOutlined />} onClick={() => exportSchedule(detailItem)} style={{ flex: 1 }}>
                Tải Excel
              </Button>
              <Button
                type="primary"
                icon={detailItem.status === 'Đang trích khấu hao' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => handleToggleStatus(detailItem)}
                style={{ backgroundColor: detailItem.status === 'Đang trích khấu hao' ? '#D97706' : '#009688', borderColor: detailItem.status === 'Đang trích khấu hao' ? '#D97706' : '#009688', flex: 1 }}
              >
                {detailItem.status === 'Đang trích khấu hao' ? 'Tạm dừng trích KH' : 'Kích hoạt trích KH'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Chạy trích khấu hao tự động tháng này */}
      <Modal
        title="Chạy Trích Khấu Hao & Tự Động Định Khoản Kế Toán"
        open={runModalOpen}
        onCancel={() => setRunModalOpen(false)}
        footer={null}
        width={500}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
          <Alert
            message={`Kỳ khấu hao ${currentPeriod}`}
            description={`Lịch hiện có ghi nhận ${totalMonthly.toLocaleString('vi-VN')} ₫, chưa gồm tài sản tính theo sản lượng. Khi xác nhận, hệ thống lưu số liệu tài sản và bút toán theo tài khoản của từng hồ sơ.`}
            type="info"
            showIcon
          />

          <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
            <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Phân bổ theo phòng ban từ lịch đã lưu:</div>
            {Object.entries(departmentPlan).filter(([, amount]) => amount > 0).map(([department, amount]) => (
              <div key={department} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>{department}:</span>
                <strong style={{ color: '#B45309' }}>{amount.toLocaleString('vi-VN')} ₫</strong>
              </div>
            ))}
            {Object.keys(departmentPlan).length === 0 && <div style={{ color: '#64748B' }}>Chưa có khoản khấu hao theo lịch cho kỳ này.</div>}
            {productionItemsToRun.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
                <strong>Nhập sản lượng thực tế kỳ {currentPeriod}:</strong>
                {productionItemsToRun.map((item) => (
                  <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 8, alignItems: 'center', padding: '5px 0' }}>
                    <span>{item.assetCode} · {item.assetName} (còn công suất {Math.max(0, Number(item.productionCapacity || 0) - Object.values(item.productionByPeriod || {}).reduce((sum, quantity) => sum + Number(quantity || 0), 0)).toLocaleString('vi-VN')})</span>
                    <Input type="number" min={0} step={1} value={runProductionUnits[item.key] || ''} placeholder="Sản lượng kỳ này" onChange={(event) => setRunProductionUnits((current) => ({ ...current, [item.key]: event.target.value }))} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid #E2E8F0', marginTop: 4, paddingTop: 4 }}>
              <strong>TỔNG THEO LỊCH:</strong>
              <strong style={{ color: '#16A34A', fontSize: 14 }}>{totalMonthly.toLocaleString('vi-VN')} ₫</strong>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button onClick={() => setRunModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleRunMonthlyDepreciation}
              disabled={runInProgress}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              {runInProgress ? 'Đang ghi sổ...' : 'Chấp nhận trích & Ghi sổ kế toán'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

