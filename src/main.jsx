import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import TelegramWrapper from './TelegramWrapper.jsx'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.confirm('分帳記帳簿有新版本，現在更新嗎？')) updateSW(true);
  },
  onOfflineReady() {
    console.info('分帳記帳簿已可離線開啟。');
  },
})

createRoot(document.getElementById('root')).render(
  <TelegramWrapper>
    <App />
  </TelegramWrapper>
);
