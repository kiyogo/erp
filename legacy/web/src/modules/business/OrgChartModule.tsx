import React, { useEffect, useMemo, useState } from 'react';
import {
  BankOutlined,
  ApartmentOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ReloadOutlined,
  DownloadOutlined,
  UserOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { Button, message, Tag, Drawer, Progress } from '../../custom-ui';
import { collectionsApi, employeesApi, type EnterpriseEmployee } from '../../api/endpoints';

interface OrgNode {
  id: string;
  title: string;
  code: string;
  leader: string;
  leaderTitle: string;
  leaderEmail: string;
  leaderPhone: string;
  headcount: number;
  location: string;
  functions: string[];
  children?: OrgNode[];
}

type OrgUnitRecord = {
  key?: string;
  code?: string;
  name?: string;
  manager?: string;
  managerTitle?: string;
  managerEmail?: string;
  managerPhone?: string;
  location?: string;
};

const normalizeText = (value?: string) => String(value || '').trim().toLowerCase();

const codeFromName = (name: string) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.slice(0, 3))
    .join('')
    .slice(0, 12) || 'ORG';

const rankEmployee = (employee: EnterpriseEmployee) => {
  const position = normalizeText(employee.position);
  if (position.includes('tổng giám đốc') || position.includes('ceo')) return 1;
  if (position.includes('giám đốc')) return 2;
  if (position.includes('trưởng')) return 3;
  if (position.includes('lead')) return 4;
  return 5;
};

const selectLeader = (employees: EnterpriseEmployee[]) => {
  const leader = [...employees].sort((left, right) => rankEmployee(left) - rankEmployee(right))[0];
  return {
    leader: leader?.name || 'Chưa phân công',
    leaderTitle: leader?.position || 'Chưa cập nhật',
    leaderEmail: leader?.email || 'Chưa cập nhật',
    leaderPhone: leader?.phone || 'Chưa cập nhật',
  };
};

const inferLocation = (name: string, fallback?: string) => {
  if (fallback) return fallback;
  const normalized = normalizeText(name);
  if (normalized.includes('hồ chí minh') || normalized.includes('ho chi minh') || normalized.includes('hcm')) return 'TP. Hồ Chí Minh';
  if (normalized.includes('hà nội') || normalized.includes('ha noi') || normalized.includes('hn')) return 'Hà Nội';
  return 'Chưa cập nhật';
};

export const OrgChartModule: React.FC = () => {
  const [zoom, setZoom] = useState(100);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [units, setUnits] = useState<OrgUnitRecord[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [employeeRes, unitRes] = await Promise.all([
          employeesApi.getAll(),
          collectionsApi.get<OrgUnitRecord>('business_org_units'),
        ]);
        setEmployees(employeeRes.data.data || []);
        setUnits(unitRes.data.data || []);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể tải sơ đồ tổ chức.');
      }
    })();
  }, []);

  const activeEmployees = useMemo(() => employees.filter((item) => item.status !== 'Đã nghỉ việc'), [employees]);

  const orgTree = useMemo<OrgNode>(() => {
    const grouped = new Map<string, EnterpriseEmployee[]>();
    activeEmployees.forEach((employee) => {
      const department = String(employee.department || '').trim() || 'Chưa phân bổ';
      const list = grouped.get(department) || [];
      list.push(employee);
      grouped.set(department, list);
    });

    const unitsByName = new Map(units.map((item) => [normalizeText(item.name), item]));
    const children = Array.from(grouped.entries())
      .map(([name, members]) => {
        const stored = unitsByName.get(normalizeText(name));
        const leader = selectLeader(members);
        const sortedMembers = [...members].sort((left, right) => rankEmployee(left) - rankEmployee(right));
        return {
          id: String(stored?.key || name),
          title: name,
          code: String(stored?.code || codeFromName(name)),
          leader: String(stored?.manager || leader.leader),
          leaderTitle: String(stored?.managerTitle || leader.leaderTitle),
          leaderEmail: String(stored?.managerEmail || leader.leaderEmail),
          leaderPhone: String(stored?.managerPhone || leader.leaderPhone),
          headcount: members.length,
          location: inferLocation(name, stored?.location),
          functions: [
            `Phụ trách nhân sự thuộc đơn vị ${name}`,
            `Quản lý ${members.length} nhân sự đang hoạt động`,
          ],
          children: sortedMembers.slice(0, 3).map((employee) => ({
            id: String(employee.id || employee.key),
            title: employee.position || employee.name,
            code: employee.employeeCode || employee.code,
            leader: employee.name,
            leaderTitle: employee.position || 'Nhân viên',
            leaderEmail: employee.email || 'Chưa cập nhật',
            leaderPhone: employee.phone || 'Chưa cập nhật',
            headcount: 1,
            location: inferLocation(name, stored?.location),
            functions: [`Nhân sự thuộc đơn vị ${name}`],
          })),
        } satisfies OrgNode;
      })
      .sort((left, right) => right.headcount - left.headcount);

    const executive = selectLeader(activeEmployees);
    return {
      id: 'root',
      title: 'Cơ cấu tổ chức doanh nghiệp',
      code: 'ORG-ROOT',
      leader: executive.leader,
      leaderTitle: executive.leaderTitle,
      leaderEmail: executive.leaderEmail,
      leaderPhone: executive.leaderPhone,
      headcount: activeEmployees.length,
      location: 'Toàn doanh nghiệp',
      functions: ['Điều phối cơ cấu tổ chức hiện hành', 'Tổng hợp dữ liệu từ hồ sơ nhân sự đang hoạt động'],
      children,
    };
  }, [activeEmployees, units]);

  const managerCount = useMemo(
    () => activeEmployees.filter((employee) => rankEmployee(employee) <= 3).length,
    [activeEmployees],
  );

  const handleNodeClick = (node: OrgNode) => {
    setSelectedNode(node);
    setDrawerOpen(true);
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quy mô nhân sự toàn công ty</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>{activeEmployees.length} nhân sự</div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Đồng bộ từ danh sách nhân sự đang hoạt động</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Khối / đơn vị có nhân sự</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{orgTree.children?.length || 0}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Gom theo phòng ban hiện có trong hồ sơ nhân sự</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự phụ trách / quản lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>{managerCount}</div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Suy ra từ chức danh có vai trò điều phối</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ quản lý / nhân sự</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {managerCount > 0 ? `1 : ${(activeEmployees.length / managerCount).toFixed(1)}` : 'Chưa xác định'}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tính từ dữ liệu nhân sự hiện có</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#64748B' }}>
          Nhấp vào từng đơn vị để xem người phụ trách, thông tin và quy mô nhân sự.
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <Button icon={<ZoomInOutlined />} onClick={() => setZoom(Math.min(140, zoom + 10))}>Phóng to ({zoom}%)</Button>
          <Button icon={<ZoomOutOutlined />} onClick={() => setZoom(Math.max(60, zoom - 10))}>Thu nhỏ</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setZoom(100); message.info('Đã đặt lại kích thước'); }}>Mặc định</Button>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã chuẩn bị sơ đồ tổ chức từ dữ liệu hiện có.')} disabled={!orgTree.children?.length}>
            Xuất sơ đồ
          </Button>
        </div>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          padding: '30px 20px',
          minHeight: 520,
          overflowX: 'auto',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            onClick={() => handleNodeClick(orgTree)}
            style={{
              background: '#009688',
              color: '#FFFFFF',
              borderRadius: 8,
              padding: '16px 28px',
              textAlign: 'center',
              boxShadow: '0 4px 14px rgba(0, 150, 136, 0.3)',
              minWidth: 320,
              cursor: 'pointer',
            }}
          >
            <BankOutlined style={{ fontSize: 26, marginBottom: 4 }} />
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>{orgTree.title}</div>
            <div style={{ fontSize: 13, opacity: 0.95, marginTop: 3 }}>{orgTree.leader} ({orgTree.leaderTitle})</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 4 }}>Quy mô: {orgTree.headcount} nhân sự toàn công ty</div>
          </div>

          <div style={{ width: 2, height: 32, background: '#009688' }} />
          <div style={{ width: '88%', height: 2, background: '#CBD5E1', position: 'relative' }} />

          <div style={{ display: 'flex', gap: 24, marginTop: 0, position: 'relative', width: '100%', justifyContent: 'space-around', alignItems: 'flex-start' }}>
            {orgTree.children?.map((division) => (
              <div key={division.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 2, height: 24, background: '#CBD5E1' }} />
                <div
                  onClick={() => handleNodeClick(division)}
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid #009688',
                    borderRadius: 8,
                    padding: '12px 18px',
                    textAlign: 'center',
                    minWidth: 260,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                  }}
                >
                  <ApartmentOutlined style={{ fontSize: 20, color: '#009688', marginBottom: 4 }} />
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{division.title}</div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 600, marginTop: 2 }}>{division.leader}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{division.headcount} nhân sự trực thuộc</div>
                </div>

                <div style={{ width: 2, height: 20, background: '#CBD5E1' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                  {division.children?.map((member) => (
                    <div
                      key={member.id}
                      onClick={() => handleNodeClick(member)}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: 6,
                        padding: '10px 14px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 12.5 }}>{member.title}</div>
                      <div style={{ color: '#64748B', display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                        <span>Phụ trách: <strong>{member.leader}</strong></span>
                        <span style={{ fontWeight: 700, color: '#2563EB' }}>{member.code}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Drawer title="Thông tin cơ cấu đơn vị & lãnh đạo phụ trách" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={560}>
        {selectedNode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedNode.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{selectedNode.title}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                <EnvironmentOutlined style={{ color: '#E11D48', marginRight: 4 }} />
                {selectedNode.location}
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserOutlined style={{ color: '#009688' }} /> Cán bộ phụ trách đơn vị
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div><span style={{ color: '#64748B' }}>Họ và tên:</span><div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedNode.leader}</div></div>
                <div><span style={{ color: '#64748B' }}>Chức danh:</span><div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedNode.leaderTitle}</div></div>
                <div><span style={{ color: '#64748B' }}>Email:</span><div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedNode.leaderEmail}</div></div>
                <div><span style={{ color: '#64748B' }}>Số điện thoại:</span><div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedNode.leaderPhone}</div></div>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>Quy mô nhân sự:</span>
                <strong style={{ color: '#009688' }}>{selectedNode.headcount} nhân sự</strong>
              </div>
              <Progress percent={orgTree.headcount > 0 ? Math.round((selectedNode.headcount / orgTree.headcount) * 100) : 0} strokeColor="#009688" />
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Chức năng &amp; nhiệm vụ trọng tâm</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: 1.7 }}>
                {selectedNode.functions.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
