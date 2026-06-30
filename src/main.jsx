import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TelegramWrapper from './TelegramWrapper.jsx'

createRoot(document.getElementById('root')).render(
  <TelegramWrapper>
    <App />
  </TelegramWrapper>
);