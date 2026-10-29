import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

let pendingWorkflowOtp: Promise<string> | null = null;

export function requestWorkflowOtp(initialError = ''): Promise<string> {
  if (pendingWorkflowOtp) return pendingWorkflowOtp;

  const prompt = new Promise<string>((resolve, reject) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let closing = false;
    const cleanup = () => window.setTimeout(() => {
      root.unmount();
      container.remove();
    }, 220);

    const WorkflowOtpDialog = () => {
      const [code, setCode] = useState('');
      const [error, setError] = useState(initialError);

      const cancel = () => {
        if (closing) return;
        closing = true;
        cleanup();
        reject(new Error('Đã hủy xác minh OTP.'));
      };

      const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (closing) return;
        const validTotp = /^\d{6}$/.test(code);
        const validRecoveryCode = /^[A-F0-9]{5}-?[A-F0-9]{5}$/i.test(code);
        if (!validTotp && !validRecoveryCode) {
          setError('Nhập mã Authenticator 6 chữ số hoặc mã dự phòng 10 ký tự.');
          return;
        }
        closing = true;
        cleanup();
        resolve(code);
      };

      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <button aria-label="Đóng hộp thoại" onClick={cancel} style={{ position: 'absolute', inset: 0, border: 0, background: 'rgba(15, 23, 42, 0.48)' }} />
          <section
            aria-labelledby="workflow-otp-title"
            aria-modal="true"
            role="dialog"
            style={{ position: 'relative', width: 420, maxWidth: '100%', padding: 14, borderRadius: 10, background: '#fff', boxShadow: '0 16px 48px rgba(15, 23, 42, 0.2)', color: '#0f172a' }}
          >
            <form onSubmit={submit}>
              <h2 id="workflow-otp-title" style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 650 }}>Xác thực khoản chi lớn</h2>
              <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>Nhập mã Google Authenticator hoặc mã dự phòng một lần để tiếp tục phê duyệt.</p>
              <input
                autoComplete="one-time-code"
                autoFocus
                autoCapitalize="characters"
                onChange={(event) => { setCode(event.target.value.replace(/[^A-F0-9-]/gi, '').toUpperCase().slice(0, 11)); setError(''); }}
                value={code}
                aria-label="Mã xác thực OTP"
                placeholder="123456 hoặc XXXXX-XXXXX"
                style={{ boxSizing: 'border-box', width: '100%', height: 40, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 16, letterSpacing: 2, outlineColor: '#009688' }}
              />
              {error && <div role="alert" style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={cancel} style={{ height: 36, padding: '0 14px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#334155', cursor: 'pointer' }}>Hủy</button>
                <button type="submit" style={{ height: 36, padding: '0 14px', border: 0, borderRadius: 6, background: '#009688', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Xác nhận</button>
              </div>
            </form>
          </section>
        </div>
      );
    };

    root.render(<WorkflowOtpDialog />);
  });
  pendingWorkflowOtp = prompt;
  void prompt.then(
    () => { if (pendingWorkflowOtp === prompt) pendingWorkflowOtp = null; },
    () => { if (pendingWorkflowOtp === prompt) pendingWorkflowOtp = null; },
  );
  return prompt;
}
