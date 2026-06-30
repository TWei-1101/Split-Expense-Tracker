import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TelegramWrapper from './TelegramWrapper.jsx'
import TgLinkPanel from './TgLinkPanel.jsx'

createRoot(document.getElementById('root')).render(
  <TelegramWrapper>
    <App />
    <TgLinkPanel />
  </TelegramWrapper>
);
