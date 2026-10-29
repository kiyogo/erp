import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftOutlined, CalendarOutlined, EnvironmentOutlined, FileTextOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

interface PublicJob {
  key: string;
  jobCode: string;
  title: string;
  department: string;
  level: string;
  salaryRange: string;
  deadline: string;
  experienceReq: string;
}

interface ApplicantForm {
  name: string;
  email: string;
  phone: string;
  region: string;
  country: string;
  province: string;
  ward: string;
  personalAccount: string;
  message: string;
  website: string;
}

const emptyApplicant: ApplicantForm = {
  name: '', email: '', phone: '', region: '', country: 'Việt Nam', province: '', ward: '', personalAccount: '', message: '', website: '',
};
const apiBase = String((import.meta as any).env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');
const apiJson = async <T,>(route: string): Promise<T> => {
  const response = await fetch(`${apiBase}${route}`, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Không thể tải thông tin tuyển dụng.');
  return body as T;
};
const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};
const dateText = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
};

const PublicRecruitmentPage: React.FC = () => {
  const { jobKey } = useParams<{ jobKey: string }>();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [applicant, setApplicant] = useState<ApplicantForm>(emptyApplicant);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [applicationCode, setApplicationCode] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setJob(null);
    setApplicant(emptyApplicant); setCvFile(null); setApplicationCode(''); setFormError('');
    const request = jobKey
      ? apiJson<{ job: PublicJob }>(`/public/recruitment/jobs/${encodeURIComponent(jobKey)}`).then(result => { if (active) setJob(result.job); })
      : apiJson<{ data: PublicJob[] }>('/public/recruitment/jobs').then(result => { if (active) setJobs(result.data); });
    request.catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Không thể tải thông tin tuyển dụng.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobKey]);

  const updateApplicant = (field: keyof ApplicantForm, value: string) => setApplicant(previous => ({ ...previous, [field]: value }));

  const submitApplication = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!job || sending) return;
    setSending(true); setFormError('');
    try {
      const cv = cvFile ? { name: cvFile.name, contentBase64: encodeBase64(new Uint8Array(await cvFile.arrayBuffer())) } : undefined;
      const response = await fetch(`${apiBase}/public/recruitment/jobs/${encodeURIComponent(job.key)}/applications`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...applicant, ...(cv ? { cv } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể gửi hồ sơ. Vui lòng thử lại.');
      setApplicationCode(body.applicationCode || '');
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Không thể gửi hồ sơ. Vui lòng thử lại.');
    } finally { setSending(false); }
  };

  const panelStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 8px 28px rgba(15, 23, 42, 0.05)' };
  const fieldStyle: React.CSSProperties = { width: '100%', height: 40, padding: '8px 11px', border: '1px solid #CBD5E1', borderRadius: 6, color: '#0F172A', background: '#FFFFFF', boxSizing: 'border-box', font: 'inherit' };
  const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155' };

  return (
    <div style={{ minHeight: '100vh', background: '#F5F7FA', color: '#0F172A', fontFamily: 'var(--font, Inter, Arial, sans-serif)' }}>
      <header style={{ background: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center', color: '#FFFFFF', background: '#009688', fontWeight: 800 }}>K</div>
          <div><strong style={{ display: 'block', fontSize: 15 }}>KIYOVN</strong><span style={{ color: '#64748B', fontSize: 12 }}>Cơ hội nghề nghiệp</span></div>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '30px 22px 60px' }}>
        {jobKey && <button type="button" onClick={() => navigate('/careers')} style={{ border: 0, padding: 0, marginBottom: 16, color: '#00796B', background: 'transparent', cursor: 'pointer', font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 }}><ArrowLeftOutlined /> Tất cả vị trí</button>}
        {!jobKey && <section style={{ ...panelStyle, padding: '30px 32px', marginBottom: 18, background: 'linear-gradient(115deg, #E0F2F1 0%, #FFFFFF 70%)' }}>
          <div style={{ color: '#00796B', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>KIYOVN · TUYỂN DỤNG</div>
          <h1 style={{ margin: '8px 0', fontSize: 'clamp(26px, 4vw, 38px)' }}>Cùng xây dựng những điều có ích</h1>
          <p style={{ maxWidth: 650, margin: 0, color: '#475569', lineHeight: 1.7 }}>Khám phá vị trí đang tuyển và gửi hồ sơ trực tiếp đến đội ngũ tuyển dụng KIYOVN.</p>
        </section>}

        {loading && <div role="status" style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>Đang tải vị trí tuyển dụng...</div>}
        {!!error && !loading && <div role="alert" style={{ ...panelStyle, padding: 20, color: '#B91C1C' }}>{error} <button type="button" onClick={() => window.location.reload()} style={{ marginLeft: 8, color: '#00796B', border: 0, background: 'transparent', cursor: 'pointer' }}>Tải lại</button></div>}

        {!loading && !error && !jobKey && <section aria-label="Vị trí đang tuyển" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}><h2 style={{ margin: '8px 0', fontSize: 21 }}>Vị trí đang tuyển</h2><span style={{ color: '#64748B', fontSize: 13 }}>{jobs.length} vị trí</span></div>
          {jobs.length === 0 ? <div style={{ ...panelStyle, padding: 28, textAlign: 'center', color: '#64748B' }}>Hiện chưa có vị trí nào đang nhận hồ sơ.</div> : jobs.map(item => <article key={item.key} style={{ ...panelStyle, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 240, flex: 1 }}><div style={{ color: '#00796B', fontSize: 12, fontWeight: 700 }}>{item.jobCode} · {item.department}</div><h3 style={{ margin: '5px 0 9px', fontSize: 18 }}>{item.title}</h3><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', color: '#64748B', fontSize: 13 }}><span>{item.level}</span>{item.salaryRange && <span>{item.salaryRange}</span>}<span><CalendarOutlined /> Hạn nhận: {dateText(item.deadline)}</span></div></div>
            <button type="button" onClick={() => navigate(`/careers/${encodeURIComponent(item.key)}`)} style={{ border: 0, borderRadius: 6, padding: '10px 16px', background: '#009688', color: '#FFFFFF', cursor: 'pointer', fontWeight: 700 }}>Xem vị trí</button>
          </article>)}
        </section>}

        {!loading && !error && jobKey && job && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 18, alignItems: 'start' }}>
          <section style={{ ...panelStyle, padding: 24 }}>
            <div style={{ color: '#00796B', fontSize: 12, fontWeight: 700 }}>{job.jobCode} · {job.department}</div>
            <h1 style={{ margin: '8px 0 14px', fontSize: 28, lineHeight: 1.25 }}>{job.title}</h1>
            <div style={{ display: 'grid', gap: 10, color: '#475569', fontSize: 14 }}>
              <div><strong>Cấp bậc:</strong> {job.level}</div>
              {job.salaryRange && <div><strong>Khung lương:</strong> {job.salaryRange}</div>}
              <div><CalendarOutlined style={{ marginRight: 7 }} /><strong>Hạn nhận hồ sơ:</strong> {dateText(job.deadline)}</div>
              <div><EnvironmentOutlined style={{ marginRight: 7 }} />Làm việc tại đơn vị {job.department}</div>
            </div>
            {job.experienceReq && <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 20, paddingTop: 18 }}><h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Yêu cầu kinh nghiệm và kỹ năng</h2><p style={{ margin: 0, color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{job.experienceReq}</p></div>}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 22, padding: 12, borderRadius: 8, background: '#F8FAFC', color: '#64748B', fontSize: 12, lineHeight: 1.6 }}><SafetyCertificateOutlined style={{ marginTop: 2, color: '#009688' }} /><span>Thông tin ứng tuyển được chuyển đến đội ngũ tuyển dụng KIYOVN để xử lý vị trí này.</span></div>
          </section>

          <section style={{ ...panelStyle, padding: 24 }}>
            {applicationCode ? <div role="status" style={{ textAlign: 'center', padding: '28px 10px' }}><h2 style={{ margin: '0 0 8px', fontSize: 21 }}>Đã nhận hồ sơ ứng tuyển</h2><p style={{ color: '#64748B', lineHeight: 1.6 }}>Cảm ơn bạn đã quan tâm đến vị trí {job.title}. Đội ngũ tuyển dụng sẽ xem hồ sơ của bạn.</p><div style={{ color: '#475569', fontSize: 13 }}>Mã tiếp nhận: <strong>{applicationCode}</strong></div><button type="button" onClick={() => navigate('/careers')} style={{ marginTop: 18, border: 0, borderRadius: 6, padding: '10px 16px', background: '#009688', color: '#FFFFFF', cursor: 'pointer', fontWeight: 700 }}>Xem vị trí khác</button></div> : <>
              <h2 style={{ margin: '0 0 5px', fontSize: 20 }}>Gửi hồ sơ ứng tuyển</h2><p style={{ margin: '0 0 18px', color: '#64748B', fontSize: 13 }}>Các trường có dấu * là bắt buộc.</p>
              {formError && <div role="alert" style={{ marginBottom: 14, padding: 10, border: '1px solid #FECACA', borderRadius: 6, color: '#B91C1C', background: '#FEF2F2', fontSize: 13 }}>{formError}</div>}
              <form onSubmit={event => void submitApplication(event)} style={{ display: 'grid', gap: 12 }}>
                <div style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true"><label>Website <input tabIndex={-1} autoComplete="off" value={applicant.website} onChange={event => updateApplicant('website', event.target.value)} /></label></div>
                <label style={labelStyle}>Họ và tên *<input required maxLength={160} autoComplete="name" value={applicant.name} onChange={event => updateApplicant('name', event.target.value)} style={fieldStyle} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
                  <label style={labelStyle}>Email *<input required type="email" maxLength={254} autoComplete="email" value={applicant.email} onChange={event => updateApplicant('email', event.target.value)} style={fieldStyle} /></label>
                  <label style={labelStyle}>Điện thoại<input type="tel" maxLength={40} autoComplete="tel" value={applicant.phone} onChange={event => updateApplicant('phone', event.target.value)} style={fieldStyle} /></label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
                  <label style={labelStyle}>Tỉnh/Thành phố<input maxLength={160} autoComplete="address-level1" value={applicant.province} onChange={event => updateApplicant('province', event.target.value)} style={fieldStyle} /></label>
                  <label style={labelStyle}>Phường/Xã<input maxLength={160} autoComplete="address-level2" value={applicant.ward} onChange={event => updateApplicant('ward', event.target.value)} style={fieldStyle} /></label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
                  <label style={labelStyle}>Khu vực<input maxLength={160} value={applicant.region} onChange={event => updateApplicant('region', event.target.value)} style={fieldStyle} /></label>
                  <label style={labelStyle}>Quốc gia<input maxLength={100} autoComplete="country-name" value={applicant.country} onChange={event => updateApplicant('country', event.target.value)} style={fieldStyle} /></label>
                </div>
                <label style={labelStyle}>Tài khoản cá nhân<input maxLength={500} placeholder="Liên kết hồ sơ cá nhân (nếu có)" value={applicant.personalAccount} onChange={event => updateApplicant('personalAccount', event.target.value)} style={fieldStyle} /></label>
                <label style={labelStyle}>CV đính kèm — PDF, DOC hoặc DOCX, tối đa 10 MB<span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}><FileTextOutlined style={{ color: '#009688' }} /><input type="file" accept=".pdf,.doc,.docx" onChange={event => { const file = event.target.files?.[0] || null; if (file && (!/\.(pdf|doc|docx)$/i.test(file.name) || file.size > 10 * 1024 * 1024)) { setCvFile(null); setFormError('CV phải là tệp PDF, DOC hoặc DOCX tối đa 10 MB.'); event.target.value = ''; return; } setFormError(''); setCvFile(file); }} /></span></label>
                {cvFile && <span style={{ color: '#64748B', fontSize: 12 }}>Đã chọn: {cvFile.name}</span>}
                <label style={labelStyle}>Lời nhắn<textarea maxLength={5000} rows={3} value={applicant.message} onChange={event => updateApplicant('message', event.target.value)} style={{ ...fieldStyle, height: 'auto', resize: 'vertical' }} /></label>
                <button type="submit" disabled={sending} style={{ border: 0, borderRadius: 6, minHeight: 42, marginTop: 3, background: sending ? '#94A3B8' : '#009688', color: '#FFFFFF', cursor: sending ? 'wait' : 'pointer', fontWeight: 700 }}>{sending ? 'Đang gửi hồ sơ...' : 'Gửi hồ sơ ứng tuyển'}</button>
              </form>
            </>}
          </section>
        </div>}
      </main>
    </div>
  );
};

export default PublicRecruitmentPage;
