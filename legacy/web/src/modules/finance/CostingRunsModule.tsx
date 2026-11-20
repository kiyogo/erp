import React, { useEffect, useMemo, useState } from 'react';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Alert, Button, Form, Input, Modal, Tag, message } from '../../custom-ui';
import { costingRunApi, type CostingRun, type CostingRunResult } from '../../api/endpoints';

const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
type ProductRow = { name: string; quantity: string; coefficient: string };
const emptyProduct = (): ProductRow => ({ name: '', quantity: '', coefficient: '1' });

/** Tính giá thành kỳ: giản đơn hoặc hệ số, có dở dang cuối kỳ, chi phí chung cố định theo công suất, hao hụt vượt mức. */
export const CostingRunsModule: React.FC<{ method: 'simple' | 'coefficient' }> = ({ method }) => {
  const [runs, setRuns] = useState<CostingRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CostingRun | null>(null);
  const [preview, setPreview] = useState<CostingRunResult | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([emptyProduct(), emptyProduct()]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setRuns((await costingRunApi.list()).data.data.filter((run) => run.method === method));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được các kỳ tính giá thành.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [method]);

  const payload = (values: Record<string, any>) => ({
    method, periodStart: values.periodStart, periodEnd: values.periodEnd, productName: values.productName, unit: values.unit || 'cái',
    openingWipMaterial: values.openingWipMaterial, openingWipConversion: values.openingWipConversion, materialCost: values.materialCost, laborCost: values.laborCost,
    variableOverhead: values.variableOverhead, fixedOverhead: values.fixedOverhead, abnormalMaterialLoss: values.abnormalMaterialLoss || 0,
    normalCapacity: values.normalCapacity, wipQuantity: values.wipQuantity, wipCompletionRate: values.wipCompletionRate,
    ...(method === 'simple' ? { completedQuantity: values.completedQuantity } : { products: products.map((row) => ({ name: row.name, quantity: row.quantity, coefficient: row.coefficient })) }),
    ...(values.code ? { code: values.code } : {}),
  });

  const openCreate = () => {
    form.resetFields();
    const now = new Date();
    const iso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    form.setFieldsValue({ periodStart: iso(new Date(now.getFullYear(), now.getMonth(), 1)), periodEnd: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)), unit: 'cái', openingWipMaterial: 0, openingWipConversion: 0, abnormalMaterialLoss: 0, wipQuantity: 0, wipCompletionRate: 0 });
    setProducts([emptyProduct(), emptyProduct()]);
    setPreview(null);
    setOpen(true);
  };

  const calculate = async () => {
    try {
      setPreview((await costingRunApi.preview(payload(form.getFieldsValue()))).data.result);
    } catch (error: any) {
      setPreview(null);
      message.error(error?.response?.data?.message || 'Không tính được giá thành.');
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await costingRunApi.create(payload(form.getFieldsValue()));
      message.success(`Đã lưu kỳ tính giá thành ${response.data.record.code}.`);
      setOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được kỳ tính giá thành.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => [
    { title: 'Mã', dataIndex: 'code', key: 'code' },
    { title: 'Sản phẩm', dataIndex: 'productName', key: 'productName' },
    { title: 'Kỳ', key: 'period', render: (_: unknown, run: CostingRun) => `${run.periodStart} đến ${run.periodEnd}` },
    { title: 'Sản lượng', key: 'qty', render: (_: unknown, run: CostingRun) => `${run.completedQuantity.toLocaleString('vi-VN')} ${run.unit}` },
    { title: 'Tổng giá thành', dataIndex: 'totalCost', key: 'totalCost', render: (value: number) => <strong>{money(value)}</strong> },
    { title: method === 'simple' ? 'Giá thành đơn vị' : 'Giá thành 1 đơn vị quy đổi', key: 'unit', render: (_: unknown, run: CostingRun) => money(method === 'simple' ? run.unitCost : (run.coefficientUnitCost ?? run.unitCost)) },
    { title: 'Dở dang cuối kỳ', dataIndex: 'closingWip', key: 'wip', render: (value: number) => money(value) },
    { title: 'Chi tiết', key: 'detail', render: (_: unknown, run: CostingRun) => <Button onClick={() => setDetail(run)}>Xem</Button> },
  ], [method]);

  const resultView = (result: CostingRunResult) => (
    <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
      <div>Chi phí chế biến tính giá thành: {money(result.conversionPool)}; nguyên vật liệu: {money(result.materialsPool)}</div>
      <div>Dở dang cuối kỳ: {money(result.closingWip)} (nguyên vật liệu {money(result.closingWipMaterial)}, chế biến {money(result.closingWipConversion)})</div>
      {result.fixedUnallocated > 0 && <div style={{ color: '#D97706' }}>Chi phí sản xuất chung cố định không phân bổ {money(result.fixedUnallocated)} tính vào giá vốn hàng bán (sản lượng thấp hơn công suất bình thường).</div>}
      {result.abnormalMaterialLoss > 0 && <div style={{ color: '#D97706' }}>Hao hụt nguyên vật liệu vượt mức {money(result.abnormalMaterialLoss)} tính vào giá vốn hàng bán.</div>}
      <div><strong>Tổng giá thành {money(result.totalCost)}</strong>, {method === 'simple' ? `giá thành đơn vị ${money(result.unitCost)}` : `giá thành 1 đơn vị quy đổi ${money(result.coefficientUnitCost || 0)}`}</div>
      {result.productResults && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748B' }}><th>Sản phẩm</th><th>Sản lượng</th><th>Hệ số</th><th style={{ textAlign: 'right' }}>Tổng giá thành</th><th style={{ textAlign: 'right' }}>Giá thành đơn vị</th></tr></thead>
          <tbody>{result.productResults.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.quantity}</td><td>{row.coefficient}</td><td style={{ textAlign: 'right' }}>{money(row.totalCost)}</td><td style={{ textAlign: 'right' }}>{money(row.unitCost)}</td></tr>)}</tbody>
        </table>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead><tr style={{ textAlign: 'left', color: '#64748B' }}><th>TK</th><th style={{ textAlign: 'right' }}>Nợ</th><th style={{ textAlign: 'right' }}>Có</th><th style={{ paddingLeft: 12 }}>Bút toán gợi ý</th></tr></thead>
        <tbody>{result.journal.map((line, index) => <tr key={`${line.account}-${index}`}><td>{line.account}</td><td style={{ textAlign: 'right' }}>{line.debit ? line.debit.toLocaleString('vi-VN') : ''}</td><td style={{ textAlign: 'right' }}>{line.credit ? line.credit.toLocaleString('vi-VN') : ''}</td><td style={{ paddingLeft: 12, color: '#64748B' }}>{line.note}</td></tr>)}</tbody>
      </table>
    </div>
  );

  const number = (name: string, label: string, props: Record<string, unknown> = {}) => (
    <Form.Item name={name} label={label} rules={[{ required: props.required === true }]}><Input type="number" min={0} {...props} /></Form.Item>
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: '#64748B' }}>{method === 'simple' ? 'Tính giá thành giản đơn: một loại sản phẩm, chi phí tập hợp theo kỳ.' : 'Tính giá thành theo hệ số: nhiều loại sản phẩm cùng quy trình, quy đổi về một loại chuẩn.'}</div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Tính giá thành mới</Button>
      </div>
      <div className="transparent-table-card"><KTable dataSource={runs} columns={columns} loading={loading} rowKey="key" pagination={{ pageSize: 8 }} locale={{ emptyText: 'Chưa có kỳ tính giá thành.' }} /></div>

      <Modal title={method === 'simple' ? 'Tính giá thành giản đơn' : 'Tính giá thành theo hệ số'} open={open} onCancel={() => setOpen(false)} footer={null} width={760}>
        <Form form={form} layout="vertical" style={{ marginTop: 14, maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 }}>
          <Alert type="info" showIcon message="Chi phí sản xuất chung cố định chỉ phân bổ theo công suất bình thường khi sản lượng thấp hơn; hao hụt nguyên vật liệu vượt mức và phần cố định không phân bổ tính vào giá vốn hàng bán (VAS 02). Nguyên vật liệu giả định bỏ ngay từ đầu quy trình." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Form.Item name="productName" label="Tên sản phẩm hoặc nhóm sản phẩm" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="unit" label="Đơn vị tính"><Input /></Form.Item>
            <Form.Item name="periodStart" label="Từ ngày" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="periodEnd" label="Đến ngày" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            {number('openingWipMaterial', 'Nguyên vật liệu dở dang đầu kỳ (₫)', { required: true })}
            {number('openingWipConversion', 'Chi phí chế biến dở dang đầu kỳ (₫)', { required: true })}
            {number('materialCost', 'Nguyên vật liệu trực tiếp, TK 621 (₫)', { required: true })}
            {number('laborCost', 'Nhân công trực tiếp, TK 622 (₫)', { required: true })}
            {number('variableOverhead', 'Sản xuất chung biến đổi, TK 627 (₫)', { required: true })}
            {number('fixedOverhead', 'Sản xuất chung cố định, TK 627 (₫)', { required: true })}
            {number('abnormalMaterialLoss', 'Hao hụt nguyên vật liệu vượt mức (₫)')}
            {number('normalCapacity', 'Công suất bình thường (sản lượng)')}
            {number('wipQuantity', method === 'simple' ? 'Số lượng dở dang cuối kỳ' : 'Số lượng dở dang cuối kỳ (quy đổi)')}
            {number('wipCompletionRate', 'Mức độ hoàn thành dở dang (%)', { max: 100 })}
          </div>
          {method === 'simple'
            ? number('completedQuantity', 'Sản lượng hoàn thành trong kỳ', { required: true })
            : <div>
              <div style={{ marginBottom: 6 }}>Sản phẩm hoàn thành và hệ số (sản phẩm chuẩn có hệ số 1)</div>
              {products.map((row, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                  <Input placeholder="Tên sản phẩm" value={row.name} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setProducts((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
                  <Input type="number" min={0} placeholder="Sản lượng" value={row.quantity} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setProducts((current) => current.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} />
                  <Input type="number" min={0} step="0.0001" placeholder="Hệ số" value={row.coefficient} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setProducts((current) => current.map((item, i) => i === index ? { ...item, coefficient: event.target.value } : item))} />
                  <Button icon={<DeleteOutlined />} disabled={products.length <= 2} onClick={() => setProducts((current) => current.filter((_, i) => i !== index))} />
                </div>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => setProducts((current) => [...current, emptyProduct()])}>Thêm loại sản phẩm</Button>
            </div>}
          <Form.Item name="code" label="Mã kỳ (hệ thống tự sinh)" style={{ marginTop: 12 }}><Input /></Form.Item>
          {preview && resultView(preview)}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setOpen(false)}>Hủy</Button>
            <Button onClick={() => void calculate()}>Tính thử</Button>
            <Button type="primary" loading={saving} onClick={() => void save()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu kết quả</Button>
          </div>
        </Form>
      </Modal>
      <Modal title={`Giá thành ${detail?.code || ''}`} open={!!detail} onCancel={() => setDetail(null)} footer={null} width={760}>
        {detail && <div><Tag>{detail.productName}</Tag> {detail.periodStart} đến {detail.periodEnd}{resultView(detail)}</div>}
      </Modal>
    </div>
  );
};
