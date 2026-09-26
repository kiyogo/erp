import ReactDOM from 'react-dom/client';
import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import App from './App';
import './custom-ui/theme.css';
import './index.css';

const ApplicationRoot: React.FC = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ApplicationRoot />
);
