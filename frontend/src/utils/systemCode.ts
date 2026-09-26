import type { ReactNode } from 'react';

let serial = 0;

const REFERENCE_OR_EXTERNAL_CODES = new Set([
  'taxcode',
  'buyertaxcode',
  'invoicecode',
  'originalcode',
  'trackingcode',
  'costcentercode',
]);

const PREFIX_BY_FIELD: Record<string, string> = {
  taskcode: 'TASK',
  rolecode: 'ROLE',
  channelcode: 'CHN',
  travelcode: 'TRV',
  auditcode: 'AUD',
  maintcode: 'MNT',
  disposalcode: 'DSP',
  materialcode: 'MAT',
  ticketcode: 'TKT',
  repaircode: 'RPR',
  licensecode: 'LIC',
  itemcode: 'SKU',
  transfercode: 'TRF',
  alertcode: 'ALT',
  shiftcode: 'SFT',
  plancode: 'PLN',
  coursecode: 'CRS',
  rewardcode: 'RWD',
  jobcode: 'JOB',
  positioncode: 'POS',
  certcode: 'CERT',
  feedbackcode: 'FDB',
  evalcode: 'EVL',
  notecode: 'NOTE',
  doccode: 'DOC',
  slacode: 'SLA',
  d02code: 'D02',
  claimcode: 'CLM',
  contractcode: 'CTR',
  shareholdercode: 'SHR',
  vouchercode: 'VCH',
  workflowcode: 'WF',
  okrcode: 'OKR',
  barcode: 'BAR',
};

const prefixFromLabel = (label?: ReactNode) => {
  const value = typeof label === 'string' ? label.toLocaleLowerCase('vi-VN') : '';
  if (value.includes('nhân viên')) return 'EMP';
  if (value.includes('nhiệm vụ') || value.includes('công việc')) return 'TASK';
  if (value.includes('tài sản')) return 'AST';
  if (value.includes('hợp đồng')) return 'CTR';
  if (value.includes('kế hoạch')) return 'PLN';
  if (value.includes('văn bản') || value.includes('tài liệu')) return 'DOC';
  if (value.includes('phiếu') || value.includes('chứng từ')) return 'VCH';
  if (value.includes('đề xuất') || value.includes('đơn')) return 'REQ';
  return 'SYS';
};

export const isSystemGeneratedCodeField = (name?: string, force?: boolean) => {
  if (force) return true;
  if (!name) return false;
  const normalized = name.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (REFERENCE_OR_EXTERNAL_CODES.has(normalized)) return false;
  return normalized === 'code' || normalized.endsWith('code') || normalized === 'barcode';
};

export const createSystemCode = (name: string, label?: ReactNode) => {
  const normalized = name.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const labelStr = typeof label === 'string' ? label.toLowerCase() : '';
  if (
    normalized === 'employeecode' ||
    normalized === 'empcode' ||
    normalized === 'nvcode' ||
    labelStr.includes('nhân viên') ||
    labelStr.includes('nhân sự')
  ) {
    const random5Digits = Math.floor(10000 + Math.random() * 90000);
    return `NV-${random5Digits}`;
  }

  const prefix = PREFIX_BY_FIELD[normalized] || prefixFromLabel(label);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  serial = (serial + 1) % 10_000;
  return `${prefix}-${date}-${String(Date.now()).slice(-6)}${String(serial).padStart(4, '0')}`;
};
