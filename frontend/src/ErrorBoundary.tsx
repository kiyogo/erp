import React from 'react';

interface State { hasError: boolean; error: string; }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message + '\n' + error.stack };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Minepanel Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
          <div style={{
            padding: '20px 24px', fontFamily: 'monospace', background: '#fff1f0',
            borderRadius: 8, color: '#c0392b', border: '1px solid #ffccc7',
            width: '100%', boxSizing: 'border-box',
          }}>
            <h2 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 }}>
              <svg viewBox="64 64 896 896" width="20" height="20" fill="currentColor"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm-32 232c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v328c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V296zm32 440a48.01 48.01 0 010-96 48.01 48.01 0 010 96z"></path></svg>
              Minepanel gặp lỗi runtime
            </h2>
            <pre style={{
              background: '#fff', padding: 14, borderRadius: 6,
              border: '1px solid #ffccc7', whiteSpace: 'pre-wrap',
              wordBreak: 'break-all', fontSize: 13, color: '#333',
            }}>
              {this.state.error}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 12,
                padding: '6px 14px',
                borderRadius: 6,
                background: '#c0392b',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
