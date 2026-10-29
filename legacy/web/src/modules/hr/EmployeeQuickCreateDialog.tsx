import React, { useEffect, useState } from 'react';
import { Form, Input, Select, Button, Modal, message } from '../../custom-ui';
import { EmployeePayload, employeesApi } from '../../api/endpoints';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  orgUnitOptions: Array<{ label: string; value: string }>;
  positionOptions: Array<{ label: string; value: string }>;
  workStatusOptions: Array<{ label: string; value: string }>;
};

export const EmployeeQuickFormFields: React.FC<Pick<Props, 'orgUnitOptions' | 'positionOptions' | 'workStatusOptions'>> = ({ orgUnitOptions, positionOptions, workStatusOptions }) => (
  <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Form.Item name="code" label="Mã nhân viên" rules={[{ required: true }]}><Input placeholder="Nhập mã nhân viên..." /></Form.Item>
      <Form.Item name="name" label="Họ và tên" rules={[{ required: true }]}><Input placeholder="Nhập họ và tên nhân viên..." /></Form.Item>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Form.Item name="email" label="Email công việc" rules={[{ required: true, type: 'email' }]}><Input placeholder="Nhập email công việc..." /></Form.Item>
      <Form.Item name="phone" label="Số điện thoại"><Input placeholder="Nhập số điện thoại..." /></Form.Item>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Form.Item name="department" label="Đơn vị"><Select mode="multiple" placeholder="Chọn đơn vị..." options={orgUnitOptions} showSearch allowClear /></Form.Item>
      <Form.Item name="position" label="Chức danh"><Select mode="multiple" placeholder="Chọn chức danh..." options={positionOptions} showSearch allowClear /></Form.Item>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
      <Form.Item name="salaryBase" label="Lương cơ bản (VNĐ)"><Input type="number" step={500000} placeholder="Nhập lương cơ bản..." /></Form.Item>
      <Form.Item name="status" label="Trạng thái"><Select options={workStatusOptions} placeholder="Chọn trạng thái..." /></Form.Item>
      <Form.Item name="joinDate" label="Ngày vào làm"><Input type="date" /></Form.Item>
    </div>
  </>
);

export const EmployeeQuickCreateDialog: React.FC<Props> = ({ open, onClose, onCreated, orgUnitOptions, positionOptions, workStatusOptions }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ code: `NV-${String(Date.now()).slice(-5)}`, department: [], position: [], status: workStatusOptions.find(item => item.value === 'Chính thức')?.value || workStatusOptions[0]?.value, joinDate: new Date().toISOString().slice(0, 10) });
  }, [open, form, workStatusOptions]);
  const save = async (values: EmployeePayload) => {
    setSaving(true);
    try {
      await employeesApi.create({ ...values, department: Array.isArray(values.department) ? values.department.filter(Boolean).join(', ') : values.department, position: Array.isArray(values.position) ? values.position.filter(Boolean).join(', ') : values.position, salaryBase: Number(values.salaryBase) || 0 });
      message.success('Đã thêm nhân viên.');
      onClose();
      onCreated();
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể thêm nhân viên.'); }
    finally { setSaving(false); }
  };
  return <Modal title="Thêm mới nhân sự" open={open} onCancel={() => !saving && onClose()} confirmLoading={saving} maskClosable={!saving} footer={null} width="min(760px, calc(100vw - 32px))">
    <Form form={form} layout="vertical" onFinish={save}>
      <EmployeeQuickFormFields orgUnitOptions={orgUnitOptions} positionOptions={positionOptions} workStatusOptions={workStatusOptions} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}><Button disabled={saving} onClick={onClose}>Hủy</Button><Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm nhân viên</Button></div>
    </Form>
  </Modal>;
};
