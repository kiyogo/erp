import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DeleteOutlined, ReloadOutlined, RollbackOutlined, SearchOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Input, message, Modal, Pagination, Select, Tag } from '../../custom-ui';
import { adminTrashApi, type AdminTrashItem } from '../../api/endpoints';

const DEFAULT_PAGE_SIZE = 25;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

export const AdminTrashModule: React.FC = () => {
  const [items, setItems] = useState<AdminTrashItem[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [scope, setScope] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminTrashApi.getAll(page, pageSize, searchText.trim(), scope);
      setItems(response.data.data || []);
      setScopes(response.data.scopes || []);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải thùng rác.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, scope, searchText]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadItems(), 200);
    return () => window.clearTimeout(timer);
  }, [loadItems]);

  const restore = async (item: AdminTrashItem) => {
    if (busyItemId) return;
    setBusyItemId(item.id);
    try {
      await adminTrashApi.restore(item.id);
      message.success(`Đã khôi phục “${item.label}”.`);
      await loadItems();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể khôi phục bản ghi.');
    } finally {
      setBusyItemId('');
    }
  };

  const permanentlyDelete = (item: AdminTrashItem) => {
    Modal.confirm({
      title: 'Xóa vĩnh viễn bản ghi?',
      content: `“${item.label}” sẽ bị xóa khỏi thùng rác và không thể khôi phục.`,
      okText: 'Xóa vĩnh viễn',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (busyItemId) return;
        setBusyItemId(item.id);
        try {
          await adminTrashApi.permanentlyDelete(item.id);
          message.success(`Đã xóa vĩnh viễn “${item.label}”.`);
          await loadItems();
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể xóa vĩnh viễn bản ghi.');
          throw error;
        } finally {
          setBusyItemId('');
        }
      },
    });
  };

  const columns = useMemo(() => [
    {
      title: 'Bản ghi',
      dataIndex: 'label',
      key: 'label',
      render: (label: string, item: AdminTrashItem) => (
        <div>
          <div style={{ fontWeight: 650, color: '#0F172A' }}>{label}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>{item.recordKey}</div>
        </div>
      ),
    },
    { title: 'Phân hệ dữ liệu', dataIndex: 'scope', key: 'scope', width: 190, render: (value: string) => <Tag color="blue">{value}</Tag> },
    { title: 'Thời điểm xóa', dataIndex: 'deletedAt', key: 'deletedAt', width: 190, render: (value: string) => formatDate(value) },
    { title: 'Người xóa', dataIndex: 'deletedBy', key: 'deletedBy', width: 210 },
    {
      title: 'Thao tác', key: 'actions', width: 205,
      render: (_: unknown, item: AdminTrashItem) => (
        <div style={{ display: 'flex', gap: 7 }}>
          <Button size="small" icon={<RollbackOutlined />} disabled={Boolean(busyItemId)} loading={busyItemId === item.id} onClick={() => void restore(item)}>Khôi phục</Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={Boolean(busyItemId)} onClick={() => permanentlyDelete(item)}>Xóa vĩnh viễn</Button>
        </div>
      ),
    },
  ], [busyItemId]);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <DeleteOutlined style={{ fontSize: 21, color: '#009688' }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Thùng rác</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Bản ghi bị xóa qua collections API có thể được khôi phục hoặc xóa vĩnh viễn.</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Input prefix={<SearchOutlined style={{ color: '#94A3B8' }} />} placeholder="Tìm tên, mã bản ghi hoặc phân hệ..." value={searchText} onChange={event => { setSearchText(event.target.value); setPage(1); }} style={{ width: 320, maxWidth: '100%' }} allowClear />
          <Select value={scope} onChange={value => { setScope(value); setPage(1); }} style={{ width: 230 }} options={[{ value: '', label: 'Tất cả phân hệ' }, ...scopes.map(value => ({ value, label: value }))]} />
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadItems()} loading={loading}>Làm mới</Button>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
        <KTable dataSource={items} columns={columns} rowKey="id" pagination={false} locale={{ emptyText: loading ? 'Đang tải thùng rác...' : 'Thùng rác đang trống.' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px' }}>
          <span style={{ fontSize: 12.5, color: '#64748B' }}>{total ? `Hiển thị ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} trên ${total.toLocaleString('vi-VN')} bản ghi` : 'Không có bản ghi'}</span>
          <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger disabled={loading || Boolean(busyItemId)} onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); }} />
        </div>
      </div>
    </div>
  );
};
