# 分帳記帳簿 (Split-Expense-Tracker)

輕鬆記錄團體支出、公平分配費用的分帳小工具。

- Vite production：<https://expense.771101.xyz/>
- CDN fallback：<https://expense.twei-ha.com/>

## 技術棧

- **前端框架**：React 19
- **建置工具**：Vite 7
- **後端 / 資料庫**：Firebase Firestore + Firebase Auth
- **樣式**：Tailwind CSS + PostCSS
- **圖示**：lucide-react

## 開發

```bash
npm install        # 安裝依賴
npm run dev        # 啟動開發伺服器（http://localhost:5173）
npm run build      # 產出 production build（dist/）
npm run preview    # 本機預覽 build 結果
npm run lint       # 跑 ESLint
```

## 專案結構

```
.
├── index.html          # Vite HTML entry
├── src/
│   ├── App.jsx         # thin re-export
│   ├── App.real.jsx    # 完整分帳 App
│   ├── main.jsx        # React 入口
│   └── index.css
├── public/             # 靜態資源
├── package.json
├── vite.config.js
└── eslint.config.js
```

## 部署

- Cloudflare Pages project：`split-expense-tracker`
- Production branch：`docs/readme-rewrite`
- Vite 線上網址：<https://expense.771101.xyz/>
- CDN fallback：<https://expense.twei-ha.com/>
- Firebase 專案：`splite-expense-tracker`

## 狀態

| 版本 | 狀態 | 部署 |
|---|---|---|
| Vite 版（`src/`） | 線上正式版 | ✅ 已部署 |
| CDN 版 | fallback | ✅ 已保留 |

Vite 版已移植 CDN 版完整邏輯，Firestore path 與 Firebase Auth model 沿用同一份資料模型。

## 授權

私人專案，未公開授權。
# 結清防重複

結清需在線且本機支出已同步。確認後會重新讀取伺服器帳目，以 Firestore transaction 同時寫入結清支出、操作識別紀錄與帳本結清版本號。重複操作識別只回傳已完成；不同裝置基於相同版本同時結清時，只有一筆能提交，其餘需重新確認最新結餘。

防重複資料位於帳本 `settings/settlement-state` 及 `settings/settlement-op-*`，刪除帳本時隨設定一起清除。不要單獨刪除操作識別紀錄。所有成員須重新載入新版本；舊版客戶端不會遵循這個協定。此機制不是對惡意直接寫入的權限限制。

交易會核對已讀取支出的金額、付款人及分攤資料；一般支出新增並未共用結清版本號，因此不提供整本帳目所有編輯的全域鎖定。測試使用模擬交易，涵蓋並行結清、失去回應後重試、過期金額與後續同額欠款。
