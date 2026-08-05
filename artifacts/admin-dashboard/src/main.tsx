import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Dùng VITE_API_BASE_URL khi deploy trên VPS (API chạy port khác)
// Để trống khi chạy trên Replit (API cùng host, dùng relative path)
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) {
  setBaseUrl(apiBase);
}

createRoot(document.getElementById('root')!).render(<App />);
