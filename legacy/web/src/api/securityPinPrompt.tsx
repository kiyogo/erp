import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

let pendingSecurityPin: Promise<string> | null = null;

export function requestSecurityPin(initialError = ''): Promise<string> {
  if (pendingSecurityPin) return pendingSecurityPin;

  const prompt = new Promise<string>((resolve, reject) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let closing = false;
    const cleanup = () => window.setTimeout(() => {
      root.unmount();
      container.remove();
    }, 220);

    const SecurityPinDialog = () => {
      const [pin, setPin] = useState('');
      const [error, setError] = useState(initialError);

      const cancel = () => {
        if (closing) return;
        closing = true;
        cleanup();
        reject(new Error('Đã hủy xác minh PIN.'));
      };

      const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (closing) return;
        if (!/^\d{6}$/.test(pin)) {
          setError('Mã PIN phải gồm đúng 6 chữ số.');
          return;
        }
        closing = true;
        cleanup();
        resolve(pin);
      };

      return (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <button aria-label="Đóng hộp thoại" onClick={cancel} style={{ position: 'absolute', inset: 0, border: 0, background: 'rgba(15, 23, 42, 0.48)' }} />
          <section
            aria-labelledby="security-pin-title"
            aria-modal="true"
            role="dialog"
            style={{ position: 'relative', width: 420, maxWidth: '100%', padding: 20, borderRadius: 10, background: '#fff', boxShadow: '0 16px 48px rgba(15, 23, 42, 0.2)', color: '#0f172a' }}
          >
            <form onSubmit={submit}>
              <h2 id="security-pin-title" style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 650 }}>Xác minh PIN bảo mật</h2>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>Nhập mã PIN 6 chữ số để tiếp tục thao tác này.</p>
              <input
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => { setPin(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                pattern="[0-9]{6}"
                type="password"
                value={pin}
                aria-label="Mã PIN bảo mật"
                style={{ boxSizing: 'border-box', width: '100%', height: 40, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 16, letterSpacing: 5, outlineColor: '#009688' }}
              />
              {error && <div role="alert" style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" onClick={cancel} style={{ height: 36, padding: '0 14px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#334155', cursor: 'pointer' }}>Hủy</button>
                <button type="submit" style={{ height: 36, padding: '0 14px', border: 0, borderRadius: 6, background: '#009688', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Xác nhận</button>
              </div>
            </form>
          </section>
        </div>
      );
    };

    root.render(<SecurityPinDialog />);
  });
  pendingSecurityPin = prompt;
  void prompt.then(
    () => { if (pendingSecurityPin === prompt) pendingSecurityPin = null; },
    () => { if (pendingSecurityPin === prompt) pendingSecurityPin = null; },
  );
  return prompt;
}
