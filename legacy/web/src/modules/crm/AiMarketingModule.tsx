import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightOutlined, CheckCircleFilled, EditOutlined, MailOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, message } from '../../custom-ui';
import { marketingApi, MarketingGoal, MarketingOnboarding, MarketingProduct } from '../../api/endpoints';

const productOptions: Array<{
  id: MarketingProduct;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  goals: Array<{ id: MarketingGoal; label: string }>;
}> = [
  {
    id: 'email_marketing',
    title: 'Email Marketing',
    description: 'Tiếp cận và nuôi dưỡng khách hàng qua email.',
    icon: <MailOutlined />,
    accent: '#2563EB',
    goals: [
      { id: 'attract_customers', label: 'Thu hút khách hàng' },
      { id: 'nurture_leads', label: 'Nuôi dưỡng khách hàng tiềm năng' },
      { id: 'send_email_marketing', label: 'Gửi email marketing' },
    ],
  },
  {
    id: 'marketing_automation',
    title: 'Marketing Automation',
    description: 'Tự động hóa hành trình và chăm sóc khách hàng.',
    icon: <ThunderboltOutlined />,
    accent: '#7C3AED',
    goals: [
      { id: 'collect_leads', label: 'Thu thập khách hàng và khách hàng tiềm năng' },
      { id: 'track_behavior', label: 'Theo dõi hành vi' },
      { id: 'automate_customer_care', label: 'Tự động chăm sóc khách hàng' },
      { id: 'automate_marketing', label: 'Tự động hóa marketing' },
    ],
  },
];

const goalLabels = new Map(productOptions.flatMap(product => product.goals.map(goal => [goal.id, goal.label] as const)));

export const AiMarketingModule: React.FC = () => {
  const [onboarding, setOnboarding] = useState<MarketingOnboarding | null>(null);
  const [primaryProduct, setPrimaryProduct] = useState<MarketingProduct | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<MarketingGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const activeProduct = useMemo(
    () => productOptions.find(product => product.id === primaryProduct) || null,
    [primaryProduct],
  );

  const loadOnboarding = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await marketingApi.getOnboarding();
      const saved = response.data.onboarding;
      setOnboarding(saved);
      setPrimaryProduct(saved?.primaryProduct || null);
      setSelectedGoals(saved?.selectedGoals || []);
    } catch (error: any) {
      setLoadError(true);
      message.error(error?.response?.data?.message || 'Không tải được thiết lập aiMarketing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadOnboarding(); }, []);

  const chooseProduct = (product: MarketingProduct) => {
    if (product === primaryProduct) return;
    setPrimaryProduct(product);
    setSelectedGoals([]);
  };

  const toggleGoal = (goal: MarketingGoal) => {
    setSelectedGoals(current => current.includes(goal)
      ? current.filter(item => item !== goal)
      : [...current, goal]);
  };

  const startExploring = async () => {
    if (!primaryProduct || selectedGoals.length === 0 || saving) return;
    setSaving(true);
    try {
      const response = await marketingApi.saveOnboarding({ primaryProduct, selectedGoals });
      setOnboarding(response.data.onboarding);
      setEditing(false);
      message.success('Đã lưu mục tiêu aiMarketing.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu mục tiêu aiMarketing.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: '#64748B' }}>Đang tải thiết lập aiMarketing…</div>;
  }

  if (loadError) {
    return (
      <div style={{ maxWidth: 720, margin: '36px auto', padding: 24, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12 }}>
        <h2 style={{ margin: '0 0 8px', color: '#0F172A' }}>Không tải được aiMarketing</h2>
        <p style={{ margin: '0 0 16px', color: '#64748B' }}>Hãy kiểm tra kết nối rồi thử tải lại thiết lập.</p>
        <Button onClick={() => void loadOnboarding()}>Tải lại</Button>
      </div>
    );
  }

  if (onboarding && !editing) {
    const product = productOptions.find(item => item.id === onboarding.primaryProduct)!;
    return (
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ color: '#009688', fontSize: 13, fontWeight: 700, letterSpacing: '.04em' }}>KIYOVN · aiMarketing</div>
            <h1 style={{ margin: '6px 0', fontSize: 24, color: '#0F172A' }}>Mục tiêu marketing của bạn</h1>
            <p style={{ margin: 0, color: '#64748B' }}>Thiết lập đã lưu trên hệ thống và sẵn sàng để bạn tiếp tục khám phá.</p>
          </div>
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>Thay đổi mục tiêu</Button>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: product.accent, fontSize: 18, fontWeight: 700 }}>
            {product.icon}<span>{product.title}</span>
          </div>
          <p style={{ margin: '8px 0 18px', color: '#64748B' }}>{product.description}</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {onboarding.selectedGoals.map(goal => (
              <div key={goal} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#334155' }}>
                <CheckCircleFilled style={{ color: '#009688' }} />
                <span>{goalLabels.get(goal) || goal}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 20, paddingTop: 14, color: '#64748B', fontSize: 12 }}>
            Cập nhật lần cuối: {new Date(onboarding.updatedAt).toLocaleString('vi-VN')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 36px' }}>
      <div style={{ textAlign: 'center', margin: '8px auto 24px', maxWidth: 700 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 13, color: '#FFFFFF', background: 'linear-gradient(135deg, #009688, #2563EB)', fontSize: 22, fontWeight: 800 }}>K</div>
        <div style={{ marginTop: 12, color: '#009688', fontSize: 13, fontWeight: 700, letterSpacing: '.04em' }}>KIYOVN · aiMarketing</div>
        <h1 style={{ margin: '8px 0', fontSize: 26, color: '#0F172A' }}>Bạn muốn đạt được điều gì?</h1>
        <p style={{ margin: 0, color: '#64748B', lineHeight: 1.6 }}>Chọn mục tiêu chính để bắt đầu khám phá các công cụ marketing phù hợp.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>
        {productOptions.map(product => {
          const selected = primaryProduct === product.id;
          return (
            <button
              type="button"
              key={product.id}
              aria-pressed={selected}
              onClick={() => chooseProduct(product.id)}
              style={{ textAlign: 'left', padding: 18, background: selected ? '#F0FDFA' : '#FFFFFF', border: `1px solid ${selected ? '#009688' : '#E2E8F0'}`, borderRadius: 12, cursor: 'pointer', boxShadow: selected ? '0 0 0 2px rgba(0,150,136,.10)' : 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: product.accent, fontWeight: 700, fontSize: 17 }}>
                {product.icon}<span>{product.title}</span>
                {selected && <CheckCircleFilled style={{ marginLeft: 'auto', color: '#009688' }} />}
              </div>
              <div style={{ marginTop: 8, color: '#64748B', lineHeight: 1.5 }}>{product.description}</div>
            </button>
          );
        })}
      </div>

      {activeProduct && (
        <section aria-label="Mục tiêu marketing" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, color: '#0F172A' }}>Chọn mục tiêu của bạn</h2>
          <p style={{ margin: '0 0 14px', color: '#64748B', fontSize: 13 }}>Có thể chọn nhiều mục tiêu trong {activeProduct.title}.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {activeProduct.goals.map(goal => {
              const checked = selectedGoals.includes(goal.id);
              return (
                <button
                  type="button"
                  key={goal.id}
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleGoal(goal.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '11px 12px', border: `1px solid ${checked ? '#99F6E4' : '#E2E8F0'}`, background: checked ? '#F0FDFA' : '#FFFFFF', borderRadius: 8, color: '#334155', cursor: 'pointer' }}
                >
                  <span aria-hidden="true" style={{ width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${checked ? '#009688' : '#CBD5E1'}`, borderRadius: 5, background: checked ? '#009688' : '#FFFFFF', color: '#FFFFFF', fontSize: 12 }}>
                    {checked ? '✓' : ''}
                  </span>
                  {goal.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        {onboarding && <Button onClick={() => { setEditing(false); setPrimaryProduct(onboarding.primaryProduct); setSelectedGoals(onboarding.selectedGoals); }}>Hủy thay đổi</Button>}
        <Button type="primary" icon={<ArrowRightOutlined />} disabled={!primaryProduct || selectedGoals.length === 0 || saving} loading={saving} onClick={() => void startExploring()}>
          Khám phá ngay
        </Button>
      </div>
    </div>
  );
};
