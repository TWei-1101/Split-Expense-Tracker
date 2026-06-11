import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
// 注意：icon 元件（CircleDollarSign / Trash2 / Plus / ...）由下方 CDN 程式碼內聯 SVG 定義，
// 避免 lucide-react 跟內聯 SVG 撞名。

// --- Firebase 設定（從 CDN 版 hardcode，沿用同一份，避免 query 跑到 default-app-id）---
const appId = 'YOUR_APP_ID';
const firebaseConfig = {
  apiKey: "AIzaSyB8l7Od781kGHyI9pXMLBXvzt7NuuIyq8c",
  authDomain: "splite-expense-tracker.firebaseapp.com",
  projectId: "splite-expense-tracker",
  storageBucket: "splite-expense-tracker.firebasestorage.app",
  messagingSenderId: "425612895494",
  appId: "1:425612895494:web:b5889f1d83cafb41d7ea87",
  measurementId: "G-FVS0WSGZD9",
};

// alias for serverTimestamp（CDN 程式碼裡大量使用）
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

        
        
        // 注意：GEMINI_API_KEY 已在頂層的純 JS 區塊中定義，可以直接訪問
        // serverTimestamp 已在外層 import / alias 過，這裡不重複宣告
        
		const getGroupExpensesPath = (groupId) =>
		  `artifacts/${appId}/groups/${groupId}/expenses`;

		const getGroupMembersDocPath = (groupId) =>
		  `artifacts/${appId}/groups/${groupId}/settings/members`;

		const getExpenseImagePath = (groupId, expenseId, fileName) => {
		  const safeName = (fileName || 'receipt').replace(/[^\w.\-]+/g, '_').slice(-80);
		  return `artifacts/${appId}/groups/${groupId}/expense-images/${expenseId}-${Date.now()}-${safeName}`;
		};
		
        // --- 匯率設定 (預設值作為備用) ---
        const PERMANENT_RATES_CACHE_KEY = "permanentExchangeRates";
        // ✨ NEW: 定義記憶最後一次使用幣別的 Key
        const LAST_EXPENSE_CURRENCY_KEY = "lastExpenseCurrency";

        const HARDCODED_DEFAULT_RATES = {
            'TWD': 1.0,   // 基準貨幣：臺幣
			'CNY': 4.5,   // 人民幣
			'HKD': 3.9,
            'USD': 30.5,  // 美金
            'THB': 0.85,  // 泰銖
            'EUR': 33.0,  // 歐元
            'CAD': 22.5,  // 加幣
            'VND': 0.0013, // 越南盾 (1000 VND ~ 1.3 TWD)
            'IDR': 0.002, // 印尼盾 (1000 IDR ~ 2 TWD)
            'JPY': 0.25,  // 日圓
            'KRW': 0.023, // 韓元 (1000 KRW ~ 23 TWD)
            'AUD': 20.0,  // 澳幣
            'NOK': 2.9,   // 挪威克朗
        };

        // ✨ MODIFIED: 嘗試從持久化快取讀取預設值
        let DEFAULT_EXCHANGE_RATES = (function() {
            try {
                const cachedRates = localStorage.getItem(PERMANENT_RATES_CACHE_KEY);
                if (cachedRates) {
                    return JSON.parse(cachedRates);
                }
            } catch (e) {
                console.warn("⚠ 讀取持久化匯率快取失敗，使用硬編碼預設值。", e);
            }
            return HARDCODED_DEFAULT_RATES;
        })();
		
		// --- 國家 -> 貨幣 對照表（給 GPS 用） ---
		const COUNTRY_CURRENCY_MAP = {
			TW: 'TWD',
			CN: 'CNY',
			HK: 'HKD',
			US: 'USD',
			CA: 'CAD',
			AU: 'AUD',
			JP: 'JPY',
			KR: 'KRW',
			TH: 'THB',
			VN: 'VND',
			ID: 'IDR',
			NO: 'NOK',
			// 歐洲常見國家 -> 歐元
			FR: 'EUR',
			DE: 'EUR',
			ES: 'EUR',
			IT: 'EUR',
			NL: 'EUR',
			BE: 'EUR',
			PT: 'EUR',
		};
		
        const CURRENCIES = Object.keys(HARDCODED_DEFAULT_RATES); // 幣別列表仍使用硬編碼的 Key
        const DEFAULT_CURRENCY = 'TWD';

        // --- 匯率獲取函式：每 4 小時更新一次 + 可顯示更新時間 ---
		const fetchExchangeRates = async () => {
			const CACHE_KEY = "exchangeRatesCache";
			const CACHE_TIME_KEY = "exchangeRatesCacheTime";
			const FOUR_HOURS = 4 * 60 * 60 * 1000;

			// 1. 從 localStorage 讀取臨時快取
			try {
				const cachedRates = localStorage.getItem(CACHE_KEY);
				const cachedTime = localStorage.getItem(CACHE_TIME_KEY);

				if (cachedRates && cachedTime) {
					const lastUpdate = parseInt(cachedTime, 10);
					const now = Date.now();

					// 少於 4 小時 → 使用臨時快取
					if (now - lastUpdate < FOUR_HOURS) {
						console.log("📦 使用臨時快取匯率（4 小時內）");

						return {
							rates: JSON.parse(cachedRates),
							lastUpdate
						};
					}
				}
			} catch (err) {
				console.warn("⚠ 讀取臨時匯率快取失敗，將重新抓取。", err);
			}

			// 2. 超過 4 小時 → 抓取新資料
			const API_URL = "https://open.er-api.com/v6/latest/TWD";

			try {
				const res = await fetch(API_URL);
				if (!res.ok) throw new Error("API 回應錯誤");

				const data = await res.json();
				if (!data || data.result !== "success") throw new Error("無效匯率資料");

				const processedRates = { [DEFAULT_CURRENCY]: 1.0 };

				CURRENCIES.forEach(code => {
					if (code === DEFAULT_CURRENCY) return;

					const rateTWDToCode = data.rates[code]; // 1 TWD = x {code}
					if (typeof rateTWDToCode === "number" && rateTWDToCode > 0) {
						processedRates[code] = 1 / rateTWDToCode; // 1 {code} = ? TWD
					} else {
                        // 如果 API 沒給，使用硬編碼預設值
						processedRates[code] = HARDCODED_DEFAULT_RATES[code];
					}
				});

				const now = Date.now();

				// 3. 寫入 Cache
				try {
					localStorage.setItem(CACHE_KEY, JSON.stringify(processedRates));
					localStorage.setItem(CACHE_TIME_KEY, now.toString());
                    // ✨ NEW: 寫入永久備用快取
                    localStorage.setItem(PERMANENT_RATES_CACHE_KEY, JSON.stringify(processedRates));
                    // 更新全域 DEFAULT_EXCHANGE_RATES 變數
                    DEFAULT_EXCHANGE_RATES = processedRates;
				} catch (err) {
					console.warn("⚠️ 無法寫入快取（可能是無痕模式）", err);
				}

				console.log("🌐 已抓取最新匯率", processedRates);

				return {
					rates: processedRates,
					lastUpdate: now
				};

			} catch (err) {
				console.error("❌ 抓取匯率失敗，使用預設匯率", err);
				const fallbackTime = Date.now();

				return {
					// 使用持久化或硬編碼的 DEFAULT_EXCHANGE_RATES
					rates: DEFAULT_EXCHANGE_RATES, 
					lastUpdate: fallbackTime
				};
			}
		};

        // --- 分享連結用的短代碼產生器 ---
        const generateShortCode = (length = 6) => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 避免 O/0、I/1 等混淆
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        };


        // --- 內聯 SVG 圖標元件 (Lucide 樣式) ---
        const IconProps = {
            stroke: "currentColor",
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            fill: "none",
        };
        
        const CircleDollarSign = (props) =>
		  <svg {...props} {...IconProps} viewBox="0 0 24 24">
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
			<polyline points="14 2 14 8 20 8"/>
			<line x1="16" x2="8" y1="13" y2="13"/>
			<line x1="16" x2="8" y1="17" y2="17"/>
			<line x1="10" x2="8" y1="9" y2="9"/>
		  </svg>;
        const Trash2 = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
        const Plus = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>;
        const Minus = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M5 12h14"></path></svg>;
        const Users = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
        const X = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>;
        const CircleCheck = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14 9 11"></polyline></svg>;
        const Pencil = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>;
        const UserPlus = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" x2="19" y1="8" y2="14"></line><line x1="16" x2="22" y1="11" y2="11"></line></svg>;
        const UserMinus = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="22" x2="16" y1="11" y2="11"></line></svg>;
        const LogOut = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" x2="9" y1="12" y2="12"></line></svg>;
        const RefreshCw = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.76 2.91L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.76-2.91L21 16"></path><path d="M21 21v-5h-5"></path></svg>;
        const Share2 = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"></line><line x1="15.42" x2="8.59" y1="6.51" y2="10.49"></line></svg>;
        // ✨ NEW: 放大鏡圖標 (Search)
        const Search = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" x2="16.65" y1="21" y2="16.65"></line></svg>;
        // --- 圖標元件結束 ---

        /**
         * 創建或更新 Firestore 公共 Profile
         */
        const createOrUpdatePublicProfile = async (db, uid, displayName, email) => {
            if (!db || !uid || !displayName) return;
            const profileDocPath = `artifacts/${appId}/public_profiles/${uid}`;
            try {
                await db.doc(profileDocPath).set({ 
                    displayName: displayName,
                    email: email,
                    uid: uid,
                }, { merge: true });
            } catch (e) {
                console.error("Error creating/updating public profile:", e);
            }
        };
        
        /**
         * 通用確認提示 Modal
         */
        const ConfirmationModal = memo(({ isOpen, onClose, onConfirm, title, message, confirmText, confirmColor = 'red' }) => {
            if (!isOpen) return null;

            const colorClass =
                confirmColor === 'green'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700';

            return (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-[9999] transition-opacity force-gpu">
                    <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl transform transition-transform duration-300 scale-100 force-gpu">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-800 mb-4">{title}</h3>
                            <p className="text-gray-600 mb-6">{message}</p>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-full text-gray-700 bg-gray-200 hover:bg-gray-300 transition font-semibold"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={onConfirm}
                                    className={`px-4 py-2 rounded-full text-white font-semibold transition duration-150 shadow-md ${colorClass}`}
                                >
                                    {confirmText}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        });

        /**
         * 認證模態視窗
         */
        const AuthModal = memo(({ auth, db, setToastMessage, isOpen, onClose }) => { // MODIFIED: 接受控制屬性
            if (!isOpen) return null; // NEW: 檢查是否開啟
            
            const [email, setEmail] = useState('');
            const [password, setPassword] = useState('');
            const [nickname, setNickname] = useState('');
            const [isLogin, setIsLogin] = useState(true);
            const [isLoading, setIsLoading] = useState(false);

            const handleSubmit = async (e) => {
                e.preventDefault();
                setIsLoading(true);

                if (!email || !password || (!isLogin && !nickname)) {
                    setToastMessage('❌ 請輸入所有必填欄位。'); 
                    setIsLoading(false);
                    return;
                }

                try {
                    let userCredential;
                    let finalDisplayName = nickname.trim();

                    if (isLogin) {
                        userCredential = await auth.signInWithEmailAndPassword(email, password);
                        finalDisplayName = userCredential.user.displayName || email;
                    } else {
                        userCredential = await auth.createUserWithEmailAndPassword(email, password);
                        await userCredential.user.updateProfile({
                            displayName: finalDisplayName
                        });
                    }
                    
                    if (db) {
                        await createOrUpdatePublicProfile(db, userCredential.user.uid, finalDisplayName, email);
                    }
                    
                    setToastMessage(`✅ 登入成功！歡迎 ${finalDisplayName}。`);
                    onClose(); // MODIFIED: 成功後關閉 Modal

                } catch (e) {
                    console.error("Auth error:", e.code, e.message);
                    let displayError = e.message;
                    if (e.code === 'auth/email-already-in-use') {
                        displayError = '該電子郵件已被註冊，請直接登入或使用不同郵件。';
                    } else if (e.code === 'auth/invalid-email') {
                        displayError = '無效的電子郵件格式。';
                    } else if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
                        displayError = '電子郵件或密碼錯誤。';
                    } else if (e.code === 'auth/weak-password') {
                        displayError = '密碼強度不足，請使用至少 6 個字元。';
                    }
                    setToastMessage(`❌ 登入/註冊失敗: ${displayError}`); 

                } finally {
                    setIsLoading(false);
                }
            };

            return (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center p-4 z-50 force-gpu">
                    <div className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6 sm:p-8 force-gpu relative">
                        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 text-gray-600 transition hover:scale-110 transform">
                            <X className="w-6 h-6" />
                        </button>
                        <h3 className="text-3xl font-bold text-primaryColor-600 text-center mb-6">
                            {isLogin ? '登入紀錄簿' : '註冊新帳號'}
                        </h3>
                        {/* 移除原本的錯誤訊息顯示區塊 */}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {!isLogin && (
                                <div>
                                    <label htmlFor="nickname" className="block text-sm font-medium text-gray-700">暱稱 (顯示名稱)</label>
                                    <input
                                        type="text"
                                        id="nickname"
                                        value={nickname}
                                        onChange={(e) => setNickname(e.target.value)}
                                        placeholder="請輸入您的暱稱"
                                        className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500"
                                        disabled={isLoading}
                                        required={!isLogin}
                                    />
                                </div>
                            )}

                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">電子郵件</label>
                                <input
                                    type="email"
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your.email@example.com"
                                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500"
                                    disabled={isLoading}
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">密碼 (至少 6 位)</label>
                                <input
                                    type="password"
                                    id="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="******"
                                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500"
                                    disabled={isLoading}
                                    minLength="6"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={
                                    "w-full flex items-center justify-center px-4 py-3 rounded-full text-white font-semibold transition duration-300 shadow-lg " +
                                    (isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-primaryColor-600 hover:bg-primaryColor-700")
                                }
                            >
                                {isLoading ? '處理中...' : (isLogin ? '登入' : '註冊')}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <button
                                onClick={() => { setIsLogin(prev => !prev); setToastMessage(null); setNickname(''); }}
                                className="text-primaryColor-600 hover:text-primaryColor-800 font-medium text-sm"
                            >
                                {isLogin ? '還沒有帳號？點此註冊' : '已經有帳號了？點此登入'}
                            </button>
                        </div>
                    </div>
                </div>
            );
        });
        
		/**
         * 支出 Modal (核心邏輯獨立)
         */
        const ExpenseModal = memo(({ db, currentUserId, members, getInitialShares, state, onClose, getDisplayName, isReadOnly, collectionId, liveExchangeRates, defaultCurrency, currentUserLabel}) => {
            const [newExpense, setNewExpense] = useState({
                description: '',
                originalAmount: '',
                currency: defaultCurrency || DEFAULT_CURRENCY,
                payerName: currentUserId || '',
                shares: {}, 
                imageUrl: '',
                imagePath: '',
                imageName: '',
            });
            const [imageFile, setImageFile] = useState(null);
            const [imagePreviewUrl, setImagePreviewUrl] = useState('');
            const [removeExistingImage, setRemoveExistingImage] = useState(false);
            const [isLoadingModal, setIsLoadingModal] = useState(false);
            const [modalError, setModalError] = useState(null);
            const [uploadStatus, setUploadStatus] = useState('');

            const isEditing = state.isEditing;
            const expenseToEdit = state.editingExpense;
            const modalTitle = isEditing ? '編輯支出記錄' : '新增支出記錄';
            const submitText = isEditing ? '儲存修改' : '確認新增支出';
            
            const currentExchangeRate = liveExchangeRates[newExpense.currency] || DEFAULT_EXCHANGE_RATES[newExpense.currency] || 1.0;
            const amountInTWD = useMemo(() => {
                const amount = parseFloat(newExpense.originalAmount) || 0;
                return amount * currentExchangeRate;
            }, [newExpense.originalAmount, currentExchangeRate]);


            useEffect(() => {
                if (state.isOpen) {
                    if (isEditing && expenseToEdit) {
                        const initialShares = members.reduce((acc, name) => ({ 
                            ...acc, 
                            [name]: expenseToEdit.shares[name] !== undefined ? expenseToEdit.shares[name] : 0 
                        }), {});
                        setNewExpense({
                            description: expenseToEdit.description,
                            originalAmount: expenseToEdit.originalAmount,
                            currency: expenseToEdit.currency || DEFAULT_CURRENCY,
                            payerName: expenseToEdit.payerName,
                            shares: initialShares,
                            imageUrl: expenseToEdit.imageUrl || '',
                            imagePath: expenseToEdit.imagePath || '',
                            imageName: expenseToEdit.imageName || '',
                        });
                        setImagePreviewUrl(expenseToEdit.imageUrl || '');
					} else {
					  // 決定預設的付款人：
					  // 1. 如果 members 裡包含 currentUserId，優先用 currentUserId
					  // 2. 否則，如果有成員顯示名稱 == currentUserLabel，就用那個成員
					  // 3. 都沒有就 fallback 回原本的邏輯
					  let defaultPayerId = null;

					  if (currentUserId && members.includes(currentUserId)) {
						defaultPayerId = currentUserId;
					  }

					  if (!defaultPayerId && currentUserLabel) {
						for (const memberId of members) {
						  try {
							const label = getDisplayName(memberId);
							if (label === currentUserLabel) {
							  defaultPayerId = memberId;
							  break;
							}
						  } catch (e) {
							// getDisplayName 出錯就忽略
						  }
						}
					  }

					  if (!defaultPayerId) {
						defaultPayerId = currentUserId || members[0] || '';
					  }

                      // ✨ NEW: 幣別記憶讀取邏輯
                      const savedCurrency = localStorage.getItem(LAST_EXPENSE_CURRENCY_KEY);
                      const initialCurrency = savedCurrency || defaultCurrency || DEFAULT_CURRENCY;

					  setNewExpense({
						description: '',
						originalAmount: '',
						currency: initialCurrency, // ✨ 改用記憶或預設幣別
						payerName: defaultPayerId,
						shares: getInitialShares(),
                        imageUrl: '',
                        imagePath: '',
                        imageName: '',
					  });
                      setImagePreviewUrl('');
					}

                    setImageFile(null);
                    setRemoveExistingImage(false);
                    setModalError(null);
                    setUploadStatus('');
                }
            }, [state.isOpen, isEditing, expenseToEdit, members, currentUserId, getInitialShares, currentUserLabel, getDisplayName, defaultCurrency]);

            useEffect(() => {
                return () => {
                    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(imagePreviewUrl);
                    }
                };
            }, [imagePreviewUrl]);

            const handleInputChange = (e) => {
                const { name, value } = e.target;
                setNewExpense(prev => ({
                    ...prev,
                    [name]: name === 'originalAmount' ? (value === '' ? '' : parseFloat(value) || '') : value,
                }));
            };

            const handleCurrencyChange = (e) => {
                 const selectedCurrency = e.target.value;
                 setNewExpense(prev => ({
                    ...prev,
                    currency: selectedCurrency,
                 }));
                 // ✨ NEW: 幣別記憶儲存邏輯
                 localStorage.setItem(LAST_EXPENSE_CURRENCY_KEY, selectedCurrency);
            };

            const handleImageChange = (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    setModalError('請選擇圖片檔。');
                    return;
                }
                if (file.size > 20 * 1024 * 1024) {
                    setModalError('圖片檔案請小於 20MB。');
                    return;
                }
                if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(imagePreviewUrl);
                }
                setImageFile(file);
                setImagePreviewUrl(URL.createObjectURL(file));
                setRemoveExistingImage(false);
                setModalError(null);
            };

            const compressImageFile = (file) => new Promise((resolve, reject) => {
                const imageUrl = URL.createObjectURL(file);
                const image = new Image();
                image.onload = () => {
                    try {
                        const maxSide = 1600;
                        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                        const width = Math.max(1, Math.round(image.width * scale));
                        const height = Math.max(1, Math.round(image.height * scale));
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(image, 0, 0, width, height);

                        canvas.toBlob((blob) => {
                            URL.revokeObjectURL(imageUrl);
                            if (!blob) {
                                reject(new Error('圖片壓縮失敗，請換一張圖片。'));
                                return;
                            }
                            const baseName = (file.name || 'receipt').replace(/\.[^.]+$/, '');
                            const compressedName = `${baseName}.jpg`;
                            resolve(new File([blob], compressedName, { type: 'image/jpeg' }));
                        }, 'image/jpeg', 0.82);
                    } catch (err) {
                        URL.revokeObjectURL(imageUrl);
                        reject(err);
                    }
                };
                image.onerror = () => {
                    URL.revokeObjectURL(imageUrl);
                    reject(new Error('圖片讀取失敗，請換一張圖片。'));
                };
                image.src = imageUrl;
            });

            const uploadWithTimeout = (uploadTask, timeoutMs = 45000) => Promise.race([
                uploadTask,
                new Promise((_, reject) => {
                    setTimeout(() => {
                        if (typeof uploadTask.cancel === 'function') {
                            uploadTask.cancel();
                        }
                        reject(new Error('圖片上傳逾時，請確認網路或稍後再試。'));
                    }, timeoutMs);
                }),
            ]);

            const clearSelectedImage = () => {
                if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(imagePreviewUrl);
                }
                setImageFile(null);
                setImagePreviewUrl('');
                setRemoveExistingImage(Boolean(newExpense.imageUrl));
            };

            const handleShareChange = (name, delta) => {
                setNewExpense(prev => {
                    const currentShares = prev.shares[name] || 0;
                    const newShares = Math.max(0, currentShares + delta);
                    return {
                        ...prev,
                        shares: {
                            ...prev.shares,
                            [name]: newShares,
                        },
                    };
                });
            };

            const setToAverageSplit = () => {
                const averageShares = members.reduce((acc, name) => ({ ...acc, [name]: 1 }), {});
                setNewExpense(prev => ({
                    ...prev,
                    shares: averageShares,
                }));
            };

            const saveExpense = async () => {
                if (isReadOnly) {
                    setModalError('您正在瀏覽共享紀錄簿，無法進行修改。請切換回您的私有紀錄簿。');
                    return;
                }
                if (!db || !currentUserId) return;

                if (!newExpense.description.trim() || newExpense.originalAmount <= 0 || !newExpense.payerName) {
                    setModalError('請輸入有效的品項、金額和付款人！');
                    return;
                }

                setIsLoadingModal(true);
                setModalError(null);
                try {
                    const collectionPath = getGroupExpensesPath(collectionId);
                    const docRef = isEditing
                        ? db.doc(`${collectionPath}/${expenseToEdit.id}`)
                        : db.collection(collectionPath).doc();

                    let imageFields = {
                        imageUrl: newExpense.imageUrl || '',
                        imagePath: newExpense.imagePath || '',
                        imageName: newExpense.imageName || '',
                    };

                    if (removeExistingImage && newExpense.imagePath) {
                        try {
                            await firebase.storage().ref(newExpense.imagePath).delete();
                        } catch (imageDeleteError) {
                            console.warn('Delete old expense image failed:', imageDeleteError);
                        }
                        imageFields = { imageUrl: '', imagePath: '', imageName: '' };
                    }

                    if (imageFile) {
                        if (newExpense.imagePath) {
                            try {
                                await firebase.storage().ref(newExpense.imagePath).delete();
                            } catch (imageDeleteError) {
                                console.warn('Delete replaced expense image failed:', imageDeleteError);
                            }
                        }
                        setUploadStatus('正在壓縮圖片...');
                        const uploadFile = await compressImageFile(imageFile);
                        setUploadStatus('正在上傳圖片...');
                        const imagePath = getExpenseImagePath(collectionId, docRef.id, uploadFile.name);
                        const imageRef = firebase.storage().ref(imagePath);
                        const uploadTask = imageRef.put(uploadFile, {
                            contentType: uploadFile.type,
                            customMetadata: {
                                expenseId: docRef.id,
                                groupId: collectionId,
                                uploadedBy: currentUserId,
                            },
                        });
                        await uploadWithTimeout(uploadTask);
                        imageFields = {
                            imageUrl: await imageRef.getDownloadURL(),
                            imagePath,
                            imageName: imageFile.name,
                        };
                        setUploadStatus('');
                    }

                    const expenseToSave = {
                        description: newExpense.description,
                        originalAmount: newExpense.originalAmount,
                        currency: newExpense.currency,
                        exchangeRate: currentExchangeRate,
                        amountInTWD: amountInTWD,
                        payerName: newExpense.payerName,
                        shares: Object.entries(newExpense.shares).reduce((acc, [name, share]) => {
                            if (share > 0) acc[name] = share;
                            return acc;
                        }, {}),
                        ...(isEditing ? {} : { timestamp: serverTimestamp(), creatorId: currentUserId }),
                        appId: appId,
                        ...imageFields,
                    };

                    if (isEditing) {
                        await docRef.update(expenseToSave);
                    } else {
                        await docRef.set(expenseToSave);
                    }

                    onClose();
                } catch (e) {
                    console.error("Error saving document: ", e);
                    setModalError(`儲存支出失敗: ${e.message}`);
                    setUploadStatus('');
                } finally {
                    setIsLoadingModal(false);
                }
            };
            
            if (!state.isOpen) return null;

            return (
              // 應用 force-gpu 到背景層
              <div 
                key={isEditing && expenseToEdit ? expenseToEdit.id : 'add-new'} 
                className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-start justify-center p-4 z-50 transition-opacity overflow-y-auto force-gpu"
              >
                {/* 修正：新增 h-full 和 flex flex-col 讓內容可以獨立滾動 */}
                <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl transform transition-transform duration-300 scale-100 my-4 h-full sm:h-auto sm:max-h-[95vh] flex flex-col force-gpu">
                  
                  {/* 頂部：固定標題 (flex-shrink-0) */}
                  <div className="p-6 border-b flex justify-between items-center flex-shrink-0">
                    <h3 className="text-xl font-bold text-gray-800">
                        {modalTitle} {isReadOnly && <span className="text-red-500 ml-2">(唯讀)</span>}
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 text-gray-600 transition hover:scale-110 transform">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {/* 中間內容：可滾動 (flex-1 overflow-y-auto) */}
                  <div className="p-6 space-y-5 flex-1 overflow-y-auto">
                    {modalError && <p className="text-red-600 bg-red-100 p-3 rounded-lg text-sm">{modalError}</p>}
                    {uploadStatus && <p className="text-primaryColor-700 bg-primaryColor-50 p-3 rounded-lg text-sm">{uploadStatus}</p>}
                    
                    {/* 1. 品項與金額 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">品項/描述</label>
                        <input
                          key="expense-description" 
                          type="text"
                          id="description"
                          name="description"
                          value={newExpense.description}
                          onChange={handleInputChange}
                          placeholder="例如: 晚餐，電影票"
                          className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500"
                          disabled={isReadOnly}
                        />
                      </div>
                      
                      {/* 幣別選擇與金額輸入 */}
                      <div>
                        <label htmlFor="originalAmount" className="block text-sm font-medium text-gray-700">幣值/金額</label>
                        <div className="flex space-x-2 mt-1">
                          <select
                              id="currency"
                              name="currency"
                              value={newExpense.currency}
                              onChange={handleCurrencyChange}
                              className="block flex-shrink-0 w-auto border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500 bg-white disabled:bg-gray-100"
                              disabled={isReadOnly}
                          >
                            {CURRENCIES.map(code => (
                                <option key={code} value={code}>{code}</option>
                            ))}
                          </select>
                          <input
                            key="expense-amount" 
                            type="number"
                            id="originalAmount"
                            name="originalAmount"
                            value={newExpense.originalAmount}
                            onChange={handleInputChange}
                            placeholder="100.00"
                            className="block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500"
                            disabled={isReadOnly}
                          />
                        </div>
                        
                        {/* 顯示換算後的台幣金額 */}
                        {newExpense.originalAmount > 0 && newExpense.currency !== DEFAULT_CURRENCY && (
                           <p className="mt-1 text-xs text-gray-500 italic">
                               換算台幣 (TWD) 約: 
                               <span className="font-semibold text-primaryColor-600 ml-1">TWD {amountInTWD.toFixed(2)}</span>
                               (匯率: {currentExchangeRate})
                           </p>
                        )}
                        {newExpense.originalAmount > 0 && newExpense.currency === DEFAULT_CURRENCY && (
                           <p className="mt-1 text-xs text-gray-500 italic">
                               分帳計算使用此金額 (TWD)
                           </p>
                        )}
                      </div>
                    </div>

                    {/* 2. 收據 / 圖片 */}
                    <div className="pt-4 border-t border-gray-100">
                      <label htmlFor="expenseImage" className="block text-sm font-medium text-gray-700">收據 / 圖片</label>
                      <div className="mt-2 flex flex-col sm:flex-row gap-3 sm:items-center">
                        <input
                          type="file"
                          id="expenseImage"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-full file:border-0 file:bg-primaryColor-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primaryColor-700 hover:file:bg-primaryColor-100 disabled:opacity-50"
                          disabled={isReadOnly}
                        />
                        {imagePreviewUrl && (
                          <button
                            type="button"
                            onClick={clearSelectedImage}
                            className="px-3 py-2 text-sm rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 disabled:opacity-50"
                            disabled={isReadOnly}
                          >
                            移除圖片
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">支援圖片檔，原圖上限 20MB；儲存前會自動壓縮。</p>
                      {imagePreviewUrl && (
                        <div className="mt-3">
                          <img
                            src={imagePreviewUrl}
                            alt="支出圖片預覽"
                            className="h-32 w-32 rounded-lg object-cover border border-gray-200 shadow-sm"
                          />
                        </div>
                      )}
                    </div>

                    {/* 2. 付款人 */}
                    <div>
                      <label htmlFor="payerName" className="block text-sm font-medium text-gray-700">付款人</label>
                      <select
                        id="payerName"
                        name="payerName"
                        value={newExpense.payerName}
                        onChange={handleInputChange}
                        className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500 bg-white"
                        disabled={isReadOnly}
                      >
                        {members.map(member => (
                          <option key={member} value={member}>
                            {getDisplayName(member)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 3. 分帳份數設定 */}
                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-lg font-bold text-gray-700">分帳份數</label>
                        <button
                          onClick={setToAverageSplit}
                          type="button"
                          className="text-sm text-primaryColor-600 hover:text-primaryColor-800 font-medium disabled:opacity-50"
                          disabled={isReadOnly}
                        >
                          [設為平均分配]
                        </button>
                      </div>
                      {/* 移除 max-h-48，讓 flex-1 負責滾動 */}
                      <div className="space-y-3 pr-2">
                        {members.map(member => {
                          const currentShares = newExpense.shares[member] || 0;
                          const displayMember = getDisplayName(member);
                          const isPayer = newExpense.payerName === member;

                          return (
                            <div key={member} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                              <span className={`font-medium ${isPayer ? 'text-primaryColor-700' : 'text-gray-700'}`}>
                                {displayMember} {isPayer && '(付款人)'}
                              </span>
                              <div className="flex items-center space-x-2 flex-shrink-0">
                                <button
                                  onClick={() => handleShareChange(member, -1)}
                                  type="button"
                                  className="p-1.5 bg-red-50 text-red-600 rounded-lg transition hover:scale-105 transform hover:bg-red-100 shadow-sm border border-red-200 disabled:opacity-50 disabled:hover:scale-100"
                                  aria-label="減少份數"
                                  disabled={isReadOnly}
                                >
                                  <Minus className="w-5 h-5" />
                                </button>
                                <span className="w-8 text-center font-bold text-lg text-gray-800">{currentShares}</span>
                                <button
                                  onClick={() => handleShareChange(member, 1)}
                                  type="button"
                                  className="p-1.5 bg-green-50 text-green-600 rounded-lg transition hover:scale-105 transform hover:bg-green-100 shadow-sm border border-green-200 disabled:opacity-50 disabled:hover:scale-100"
                                  aria-label="增加份數"
                                  disabled={isReadOnly}
                                >
                                  <Plus className="w-5 h-5" />
                                </button>
                                <span className="text-sm text-gray-500 w-8 text-right">份</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
				  </div>

				  {/* 底部：固定儲存按鈕 (flex-shrink-0) */}
				  <div className="p-6 border-t flex justify-end flex-shrink-0">
					  <button
						onClick={saveExpense}
						disabled={isReadOnly || isLoadingModal || !newExpense.description.trim() || newExpense.originalAmount <= 0 || !newExpense.payerName}
						className={
						  "flex items-center px-6 py-3 rounded-full text-white font-semibold transition duration-150 shadow-md " +
						  ((isReadOnly || isLoadingModal || !newExpense.description.trim() || newExpense.originalAmount <= 0 || !newExpense.payerName)
							? "bg-gray-400 cursor-not-allowed"
							: "bg-primaryColor-600 hover:bg-primaryColor-700 hover:shadow-lg")
						}
					  >
						{isLoadingModal ? '儲存中...' : (
						  <>
							<CircleCheck className="w-5 h-5 mr-2" />
							{submitText}
						  </>
						)}
					  </button>
					</div>
                </div>
              </div>
            );
        });
        
		/**
         * 成員管理 Modal (核心邏輯獨立)
         */
        const MemberManagementModal = memo(({ db, currentUserId, members, customMembers, defaultSharesConfig, isMemberModalOpen, setIsMemberModalOpen, saveMembers, handleSaveDefaultShares, handleDeleteMember, setIsLoading, isLoading, setError, getDisplayName, isReadOnly, groupMembers, groupOwner, inviteUserByEmail, removeGroupMember, setToastMessage, migrateMemberID }) => { // <-- MODIFIED: Add migrateMemberID
            const [memberInput, setMemberInput] = useState('');
            const [tempDefaultShares, setTempDefaultShares] = useState({});
            // NEW: 內部訊息狀態
            const [modalMessage, setModalMessage] = useState(null); 
            
            // NEW: 選擇要替換目標的狀態
            const [nameToReplace, setNameToReplace] = useState(null); // <-- NEW
            const [availableUidsForReplace, setAvailableUidsForReplace] = useState([]); // <-- NEW

            useEffect(() => {
                if (isMemberModalOpen) {
                    const initialShares = members.reduce((acc, name) => {
                        const shareValue = defaultSharesConfig[name] !== undefined ? defaultSharesConfig[name] : 1;
                        acc[name] = shareValue;
                        return acc;
                    }, {});
                    setTempDefaultShares(initialShares);
                    setMemberInput('');
                    setModalMessage(null); // NEW: 開啟時清除訊息
                    
                    // NEW: 計算可替換的目標 UID
					const allUIDs = groupMembers.filter(uid => 
						// 這裡只需要判斷是否為「可替換的目標帳號」，不需要再檢查 customMembers
						uid.length > 20 && uid !== currentUserId
					);
					setAvailableUidsForReplace(allUIDs);
                    setNameToReplace(null);
                }
            }, [isMemberModalOpen, members, defaultSharesConfig, groupMembers, customMembers, currentUserId]); // <-- MODIFIED: 增加依賴
            
            // NEW: 內部訊息清除 (防止無限迴圈)
            const resetMessage = useCallback(() => {
                setModalMessage(null);
            }, []);

			
			// 只處理「一般成員名稱」→ 加到分帳成員名單
			const handleAddMemberByName = async (name) => {
			  if (isReadOnly) {
                setModalMessage('❌ 唯讀模式下無法新增成員。'); 
                return;
              }

			  const trimmedName = name.trim();
              setModalMessage(null); // 清除舊訊息

			  if (
				trimmedName &&
				trimmedName !== currentUserId &&
				!customMembers.includes(trimmedName)
			  ) {
				const newMemberList = [...customMembers, trimmedName];
				await saveMembers(newMemberList);
                setModalMessage(`✅ 已新增分帳成員: ${trimmedName}`); 
			  } else if (trimmedName === currentUserId) {
				setModalMessage('❌ 不能將自己的用戶 ID 新增為成員。'); 
			  } else if (customMembers.includes(trimmedName)) {
                setModalMessage(`⚠️ 成員 ${trimmedName} 已存在於分帳清單。`); 
              }
			};

			// 共用：判斷是名稱還是 Email
			const handleSubmitMemberInput = async () => {
			  if (isReadOnly) {
				setModalMessage('❌ 唯讀模式下無法新增或邀請成員。'); 
				return;
			  }

			  const input = memberInput.trim();
			  if (!input) return;

              setModalMessage(null); // 清除舊訊息

			  if (input.includes('@')) {
				// Email → 邀請共享成員
				await inviteUserByEmail(input, setModalMessage); // 傳遞 setModalMessage
			  } else {
				// 一般成員名稱
				await handleAddMemberByName(input);
			  }

			  setMemberInput('');
			};
            
            const handleTempShareChange = (name, delta) => {
                setTempDefaultShares(prev => {
                    const currentShares = prev[name] || 0;
                    const newShares = Math.max(0, currentShares + delta);
                    return {
                        ...prev,
                        [name]: newShares,
                    };
                });
            };
            
            const handleTempInputChange = (name, value) => {
                const shareCount = parseInt(value, 10);
                if (shareCount >= 0 || value === '') {
                    setTempDefaultShares(prev => ({
                        ...prev,
                        [name]: shareCount || 0
                    }));
                }
            };
            
            const handleMemberDeleteWrapper = async (member) => {
                if (isReadOnly) {
                    setModalMessage('❌ 唯讀模式下無法刪除成員。'); 
                    return;
                }
                await handleDeleteMember(member, setModalMessage); // 傳遞 setModalMessage
            };
            
            const handleSaveDefaultSharesWrapper = async (tempShares) => {
                await handleSaveDefaultShares(tempShares, setModalMessage); // 傳遞 setModalMessage
            };
            
            // NEW: 處理替換/轉移按鈕
            const handleReplaceMember = (oldName, newId) => {
                // 呼叫 App 層級的遷移函式
                migrateMemberID(oldName, newId, setModalMessage); 
                setNameToReplace(null); // 關閉選擇 UI
                setIsMemberModalOpen(false); // 遷移成功後關閉整個 Modal
            };

            if (!isMemberModalOpen) return null;

            return (
              // 應用 force-gpu 到背景層
              <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-start justify-center p-4 z-50 transition-opacity overflow-y-auto force-gpu">
                  {/* 修正：將 max-w-2xl 的 max-h 改為 h-full，並確保 flex-col 垂直佈局 */}
                  <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl transform transition-transform duration-300 scale-100 my-4 h-full sm:h-auto sm:max-h-[95vh] flex flex-col force-gpu">
                      {/* 頂部：固定標題 (flex-shrink-0) */}
                      <div className="p-6 border-b flex justify-between items-center flex-shrink-0">
                          <h3 className="text-xl font-bold text-gray-800">
                            管理分帳成員與預設份數 {isReadOnly && <span className="text-red-500 ml-2">(唯讀)</span>}
                          </h3>
                          <button onClick={() => setIsMemberModalOpen(false)} className="p-1 rounded-full hover:bg-gray-100 text-gray-600 transition hover:scale-110 transform">
                              <X className="w-6 h-6" />
                          </button>
                      </div>
                      
                      {/* 修正：中間內容：可滾動 (flex-1 overflow-y-auto) */}
                      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                            {/* NEW: 內部訊息顯示區 */}
                            {modalMessage && (
                                <div className={`p-3 rounded-lg text-sm font-semibold ${modalMessage.startsWith('❌') ? 'bg-red-100 text-red-700' : (modalMessage.startsWith('⚠️') ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700')}`}>
                                    {modalMessage}
                                </div>
                            )}
                            
                            {/* NEW: 替換選擇 UI */}
                            {nameToReplace && (
                                <div className="border border-red-300 p-4 rounded-lg bg-red-50">
                                    <h4 className="font-semibold text-lg mb-2 text-red-700">
                                        將「{getDisplayName(nameToReplace)}」替換為哪個帳號？
                                    </h4>
                                    
                                    <div className="flex gap-2 flex-wrap">
                                        {availableUidsForReplace.length === 0 ? (
                                            <p className="text-sm text-red-500">
                                                目前沒有可供替換的用戶 ID（請先透過 Email 邀請新的共享成員）。
                                            </p>
                                        ) : (
                                            availableUidsForReplace.map(uid => (
                                                <button
                                                    key={`replace-target-${uid}`}
                                                    onClick={() => handleReplaceMember(nameToReplace, uid)}
                                                    disabled={isLoading || isReadOnly}
                                                    className="px-3 py-1 text-sm rounded-lg text-white bg-red-500 hover:bg-red-600 transition disabled:bg-gray-400"
                                                >
                                                    替換為 {getDisplayName(uid)}
                                                </button>
                                            ))
                                        )}
                                        <button
                                            onClick={() => setNameToReplace(null)}
                                            className="px-3 py-1 text-sm rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition"
                                        >
                                            取消替換
                                        </button>
                                    </div>
                                </div>
                            )}

							{/* 成員管理 + 共享權限（合併版） */}
							<div className="border p-4 rounded-lg bg-gray-50 flex-shrink-0">
							  <h4 className="font-semibold text-lg mb-2 flex items-center text-primaryColor-700">
								<Users className="w-5 h-5 mr-2" />
								管理分帳成員與共享權限 {isReadOnly && <span className="text-red-500 ml-2">(唯讀)</span>}
							  </h4>

							  {/* 單一輸入框：名稱 or Email */}
							  <div className="flex gap-2 items-center mb-2">
								<input
								  type="text"
								  value={memberInput}
								  onChange={(e) => setMemberInput(e.target.value)}
								  onKeyDown={(e) => {
									if (e.key === 'Enter') {
									  e.preventDefault();
									  handleSubmitMemberInput();
									}
								  }}
								  placeholder="輸入名稱或Email"
								  className="flex-grow border border-gray-300 rounded-lg p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500 disabled:bg-gray-100"
								  disabled={isLoading || isReadOnly}
								/>
								<button
								  onClick={handleSubmitMemberInput}
								  className={
									'flex-shrink-0 px-4 py-3 rounded-lg text-white font-semibold transition hover:scale-105 transform ' +
									(memberInput.trim() === '' || isLoading || isReadOnly
									  ? 'bg-gray-400 cursor-not-allowed'
									  : 'bg-primaryColor-600 hover:bg-primaryColor-700')
								  }
								  disabled={memberInput.trim() === '' || isLoading || isReadOnly}
								>
								  加入
								</button>
							  </div>

							  <p className="text-xs text-gray-500 mb-3">
								以Email加入，為可編輯成員。
							  </p>

							  {/* 目前有編輯權限的成員列表 */}
							  <div className="mt-1 text-xs text-gray-600">
								<p className="font-semibold mb-1">目前有編輯權限的成員：</p>

								{groupMembers && groupMembers.length === 0 ? (
								  <p className="text-gray-400">尚無成員（只有你自己）。</p>
								) : (
								  <div className="flex flex-wrap gap-2">
									{groupMembers && groupMembers.map((uid) => (
									  <div
										key={uid}
										className="flex items-center px-2 py-1 bg-white border border-gray-300 rounded-lg text-sm"
									  >
										<span>
										  {getDisplayName(uid)}
										  {uid === groupOwner && (
											<span className="ml-1 text-[11px] text-primaryColor-600 font-semibold">
											  （擁有者）
											</span>
										  )}
										</span>

										{!isReadOnly && uid !== groupOwner && (
										  <button
											type="button"
											onClick={() => removeGroupMember(uid, setModalMessage)} // 傳遞 setModalMessage
											className="ml-2 px-2 py-0.5 text-[11px] rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                            disabled={isReadOnly}
										  >
											移除
										  </button>
										)}
									  </div>
									))}
								  </div>
								)}
							  </div>
							</div>

                          {/* 現有成員列表 */}
                          <div>
                              <h4 className="font-semibold text-lg mb-3 text-gray-700">設定所有成員的預設份數 {isReadOnly && <span className="text-red-500 ml-2">(唯讀)</span>}</h4>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3 text-sm font-semibold text-gray-600 border-b pb-2">
                                <span>成員名稱</span>
                                <span className="flex items-center justify-between">預設份數</span>
                              </div>
                              <div className="space-y-2 max-h-64 pr-2">
                                  {members.map(member => {
                                      // NEW: 判斷是否為自訂名稱 (非 UID)
                                      const isCustomName = member !== currentUserId && !groupMembers.includes(member) && member.length < 20;
                                      
										return (
                                          <div key={member} className="grid grid-cols-[1fr_auto] gap-4 items-center p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
                                              <span 
                                                  className={`font-medium truncate ${member === currentUserId ? 'text-primaryColor-700' : 'text-gray-800'} 
                                                    ${isCustomName && !isReadOnly ? 'cursor-pointer hover:text-red-600 hover:underline' : ''}` // ✨ NEW: 增加樣式指示可點擊
                                                  }
                                                  title={member}
                                                  onClick={() => { // ✨ NEW: 增加 onClick 處理器
                                                      if (isCustomName && !isReadOnly) {
                                                          setNameToReplace(member);
                                                      }
                                                  }}
                                              >
                                                  {getDisplayName(member)}
                                                  {isCustomName && <span className="ml-2 text-red-500 text-xs font-normal"></span>}
                                              </span>
                                              <div className="flex items-center space-x-2 flex-shrink">
                                                
                                                <button
                                                    onClick={() => handleTempShareChange(member, -1)}
                                                    type="button"
                                                    className="p-1.5 bg-red-50 text-red-600 rounded-lg transition hover:scale-105 transform hover:bg-red-100 shadow-sm border border-red-200 disabled:opacity-50"
                                                    aria-label="減少份數"
                                                    disabled={isReadOnly}
                                                >
                                                    <Minus className="w-5 h-5" />
                                                </button>
                                                
                                                <input
                                                    key={`shares-input-${member}`} 
                                                    type="number"
                                                    min="0"
                                                    value={tempDefaultShares[member] === 0 ? 0 : tempDefaultShares[member] || 1}
                                                    onChange={(e) => handleTempInputChange(member, e.target.value)}
                                                    placeholder="1"
                                                    className="w-16 border border-gray-300 rounded-lg p-2 text-center focus:ring-primaryColor-500 focus:border-primaryColor-500 disabled:bg-gray-100"
                                                    disabled={isLoading || isReadOnly}
                                                />
                                                
                                                <button
                                                    onClick={() => handleTempShareChange(member, 1)}
                                                    type="button"
                                                    className="p-1.5 bg-green-50 text-green-600 rounded-lg transition hover:scale-105 transform hover:bg-green-100 shadow-sm border border-green-200 disabled:opacity-50"
                                                    aria-label="增加份數"
                                                    disabled={isReadOnly}
                                                >
                                                    <Plus className="w-5 h-5" />
                                                </button>
                                                
                                                <span className="text-gray-500">份</span>
                                               
                                                {member !== currentUserId && (
                                                    <button
                                                        onClick={() => handleMemberDeleteWrapper(member)}
                                                        className="p-1 text-red-500 hover:bg-red-100 rounded-full transition hover:scale-110 transform ml-auto disabled:opacity-50"
                                                        disabled={isLoading || isReadOnly}
                                                        aria-label="刪除成員"
                                                    >
                                                        <UserMinus className="w-5 h-5" />
                                                    </button>
                                                )}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      </div>
                      {/* 底部：固定儲存按鈕 (flex-shrink-0) */}
                      <div className="p-6 border-t flex justify-end flex-shrink-0">
                          <button
                              onClick={() => handleSaveDefaultSharesWrapper(tempDefaultShares)}
                              disabled={isLoading || isReadOnly}
                              className={
                                "flex items-center px-6 py-3 rounded-full text-white font-semibold transition hover:scale-105 transform duration-150 shadow-md " +
                                ((isLoading || isReadOnly)
                                  ? "bg-gray-400 cursor-not-allowed"
                                  : "bg-primaryColor-600 hover:bg-primaryColor-700 hover:shadow-lg")
                              }
                          >
                              <CircleCheck className="w-5 h-5 mr-2" />
                              儲存預設份數
                          </button>
                      </div>
                  </div>
              </div>
            );
        });
		
        /**
         * 主要的 App 元件
         */
        const App = () => {
          // --- 應用程式狀態 ---
          const [db, setDb] = useState(null);
          const [auth, setAuth] = useState(null);
          const [userId, setUserId] = useState(null);
          const [authReady, setAuthReady] = useState(false);
          const [isGuest, setIsGuest] = useState(false); // NEW: 追蹤是否為匿名訪客
          const [isAuthModalOpen, setIsAuthModalOpen] = useState(false); // NEW: 控制 AuthModal 顯示
          const [userProfiles, setUserProfiles] = useState({});
		  const [lastExchangeUpdate, setLastExchangeUpdate] = useState(null);
          const [liveExchangeRates, setLiveExchangeRates] = useState(DEFAULT_EXCHANGE_RATES);
		  const [defaultCurrency, setDefaultCurrency] = useState(DEFAULT_CURRENCY);
		  const [detectedCountry, setDetectedCountry] = useState(null);
		  const [copyMessage, setCopyMessage] = useState('');
          
          const [currentCollectionId, setCurrentCollectionId] = useState(null); // 目前正在檢視的 groupId
		  const [currentCollectionShortCode, setCurrentCollectionShortCode] = useState(null); // 分享用短代碼
		  const [groupOwner, setGroupOwner] = useState(null);                   // 群組擁有者 uid
		  const [groupMembers, setGroupMembers] = useState([]);                 // 群組成員 uid 清單

		  // MODIFIED: 訪客模式 (isGuest) 或不在群組成員清單中都視為唯讀
		  const isReadOnly = isGuest || !groupMembers.includes(userId); 
		
		  const [inviteEmail, setInviteEmail] = useState(''); // 用來輸入要邀請的 email
		  const [groupName, setGroupName] = useState('分帳記帳簿');     // 顯示在上方標題的名稱
		  const [isEditingGroupName, setIsEditingGroupName] = useState(false); 
		  const [groupNameInput, setGroupNameInput] = useState('分帳記帳簿'); // 編輯時使用
          
          // ✨ NEW: 搜尋關鍵字狀態
          const [searchKeyword, setSearchKeyword] = useState('');

          // ✨ MODIFIED: 匯率換算器狀態 (Source and Target)
          const initialConverterSourceCurrency = localStorage.getItem('lastConverterSourceCurrency') || DEFAULT_CURRENCY;
          // 左邊幣值 (Source): 讀取 localStorage 或預設 TWD
          const [converterSourceCurrency, setConverterSourceCurrency] = useState(initialConverterSourceCurrency); 
          // 右邊幣值 (Target): 預設 TWD，不讀取 localStorage
          const [converterTargetCurrency, setConverterTargetCurrency] = useState(DEFAULT_CURRENCY); 
          const [converterAmount, setConverterAmount] = useState('');

          // --- 0. 匯率換算器來源幣別持久化 ---
          // 只有 Source Currency (左邊) 需要記錄
          useEffect(() => {
              if (converterSourceCurrency) {
                  localStorage.setItem('lastConverterSourceCurrency', converterSourceCurrency);
              }
          }, [converterSourceCurrency]);

          const [expenses, setExpenses] = useState([]);
          const [customMembers, setCustomMembers] = useState([]); 
          const [defaultSharesConfig, setDefaultSharesConfig] = useState({}); 
          const [members, setMembers] = useState([]); 
          
		  const ensureDefaultGroup = useCallback(async (_db, uid) => {
		    if (!_db || !uid) return null;

		    const groupId = uid; // 先用 uid 當 groupId
		    const groupRef = _db.doc(`artifacts/${appId}/groups/${groupId}`);
		    const snap = await groupRef.get();

		    if (!snap.exists) {
			  await groupRef.set({
			    owner: uid,
			    members: [uid],
			    createdAt: serverTimestamp(),
				name: '分帳記帳簿',
			  });
		    }
		    return groupId;
		  }, []);
				  
          const [expenseModalState, setExpenseModalState] = useState({
              isOpen: false,
              editingExpense: null,
              isEditing: false,
          });
          
          const [confirmModalState, setConfirmModalState] = useState({
              isOpen: false,
              title: '',
              message: '',
              confirmText: '確認',
              confirmColor: 'red',
              onConfirm: () => {},
          });

          const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
          const [isLoading, setIsLoading] = useState(false);
          const [error, setError] = useState(null);
        
		// 錯誤訊息自動消失
		useEffect(() => {
		  if (!error) return;

		  const timer = setTimeout(() => {
			setError(null);
		  }, 3000); // 3 秒清除

		  return () => clearTimeout(timer);
		}, [error]);
		
          // --- 1. Firebase 初始化與驗證（支援 /g/短代碼） ---
          useEffect(() => {
            if (!firebaseConfig) {
              setError('Firebase configuration is missing.');
              setAuthReady(true);
              return;
            }

            try {
              const app = firebase.initializeApp(firebaseConfig);
              const _auth = app.auth();
              const _db = app.firestore();

              setDb(_db);
              setAuth(_auth);

              const usersCollectionPath = `artifacts/${appId}/users`;
              const usersRef = _db.collection(usersCollectionPath);

              const unsubscribe = _auth.onAuthStateChanged(async (user) => {
                try {
                  if (user) {
                    // Persistent user (email/password) or a converted anonymous user
                    const isAnon = user.isAnonymous; // NEW: 檢查是否為匿名用戶
                    setUserId(user.uid);
                    setIsGuest(isAnon); // NEW: 設定訪客狀態

                    // 1. 先幫登入者自己建立 / 補上短代碼
                    let myShortCode = null;
                    try {
                      const myDocRef = usersRef.doc(user.uid);
                      const mySnap = await myDocRef.get();
                      if (mySnap.exists) {
                        const data = mySnap.data() || {};
                        myShortCode = data.shortCode || null;
                      }
                      
                      // NEW: 只有非匿名用戶才生成短代碼
                      if (!myShortCode && !isAnon) { 
                        myShortCode = generateShortCode();
                        await myDocRef.set(
                          {
                            shortCode: myShortCode,
                            createdAt: serverTimestamp(),
                          },
                          { merge: true }
                        );
                      }
                    } catch (err) {
                      console.error('初始化使用者短代碼失敗：', err);
                    }

                    // 2. 解析網址：優先支援 /g/SHORT，其次舊版 ?shareId=
                    const url = new URL(window.location.href);
                    const urlParams = url.searchParams;
                    const shareId = urlParams.get('shareId');

                    let shortCodeFromPath = null;
                    const path = url.pathname || '';
                    const marker = '/g/';
                    const idx = path.indexOf(marker);
                    if (idx !== -1) {
                      const after = path.slice(idx + marker.length);
                      shortCodeFromPath = after.split('/')[0] || null;
                    }

                    let targetCollectionId = user.uid;
                    let targetShortCode = myShortCode || null;
                    
                    // If the user is anonymous, they can only view shared groups or their own temporary group.
                    // We prioritize shared links for all users (including guests).

                    if (shortCodeFromPath) {
                      try {
                        // 用短代碼查出擁有者的 userId
                        const snap = await usersRef
                          .where('shortCode', '==', shortCodeFromPath)
                          .limit(1)
                          .get();
                        if (!snap.empty) {
                          const doc = snap.docs[0];
                          targetCollectionId = doc.id;
                          const data = doc.data() || {};
                          targetShortCode = data.shortCode || shortCodeFromPath;
                        } else if (isAnon) { // MODIFIED: 訪客模式下找不到就切回訪客預設
                            setError('找不到對應的分帳簿，已切回訪客模式。');
                        } else { // MODIFIED: 登入用戶找不到就切回自己的
                            setError('找不到對應的分帳簿，已切回自己的紀錄簿。');
                        }
                      } catch (err) {
                        console.error('依短代碼尋找分帳簿失敗：', err);
                        setError('連結載入失敗，已切回訪客模式/自己的紀錄簿。'); // MODIFIED
                      }
                    } else if (shareId) {
                      // 舊版連結：?shareId=UID 還是可以用
                      targetCollectionId = shareId;
                      // 清掉舊版 query，避免之後重複解析
                      window.history.replaceState(null, '', url.pathname);
                    }
                    
                    // NEW: 只有非匿名用戶才確保預設群組存在
                    if (!isAnon && targetCollectionId === user.uid) {
                        await ensureDefaultGroup(_db, user.uid);
                    }


                    setCurrentCollectionId((prev) => prev || targetCollectionId);
                    setCurrentCollectionShortCode(targetShortCode);
                    
                  } else {
                    // User is signed out. Sign in anonymously for guest view.
                    const anonUserCredential = await _auth.signInAnonymously();
                    const anonUser = anonUserCredential.user;

                    setUserId(anonUser.uid);
                    setIsGuest(true); // NEW: 設為訪客
                    
                    // --- 沿用已有的 URL 解析邏輯 ---
                    const url = new URL(window.location.href);
                    const urlParams = url.searchParams;
                    const shareId = urlParams.get('shareId');

                    let shortCodeFromPath = null;
                    const path = url.pathname || '';
                    const marker = '/g/';
                    const idx = path.indexOf(marker);
                    if (idx !== -1) {
                        const after = path.slice(idx + marker.length);
                        shortCodeFromPath = after.split('/')[0] || null;
                    }
                    
                    let targetCollectionId = anonUser.uid; // Default to anon's temporary group
                    let targetShortCode = null; 

                    if (shortCodeFromPath) {
                        try {
                            const snap = await usersRef
                                .where('shortCode', '==', shortCodeFromPath)
                                .limit(1)
                                .get();
                            if (!snap.empty) {
                                const doc = snap.docs[0];
                                targetCollectionId = doc.id;
                                const data = doc.data() || {};
                                targetShortCode = data.shortCode || shortCodeFromPath;
                            } else {
                                setError('找不到對應的分帳簿，已切回訪客模式。');
                            }
                        } catch (err) {
                            console.error('依短代碼尋找分帳簿失敗：', err);
                            setError('連結載入失敗，已切回訪客模式。');
                        }
                    } else if (shareId) {
                        targetCollectionId = shareId;
                        window.history.replaceState(null, '', url.pathname);
                    }

                    setCurrentCollectionId(targetCollectionId);
                    setCurrentCollectionShortCode(targetShortCode);
                  }
                } catch (e) {
                    // Handle anonymous sign-in failure (e.g., Firebase config issue)
                    console.error('Auth error during sign-in/anonymous fallback:', e);
                    setUserId(null);
                    setIsGuest(false);
                    setError(`認證失敗，應用程式無法運作: ${e.message}`);
                } finally {
                  setAuthReady(true);
                }
              });

              return () => unsubscribe();
            } catch (e) {
              setError(`Firebase initialization failed: ${e.message}`);
              setAuthReady(true);
            }
          }, []);

		// --- 監聽目前 group 的 owner / members ---
		useEffect(() => {
		  if (!db || !currentCollectionId) return;

		  const groupDocRef = db.doc(`artifacts/${appId}/groups/${currentCollectionId}`);

		  const unsub = groupDocRef.onSnapshot(
			(snap) => {
			  if (snap.exists) {
				const data = snap.data();
				const owner = data.owner || null;
				const members = Array.isArray(data.members) ? data.members : [];

				// owner 也確保在 members 裡（避免 owner 不見）
				const mergedMembers = members.includes(owner)
				  ? members
				  : [...members, owner].filter(Boolean);
				  
				const nameFromDb = data.name || '分帳記帳簿';

				setGroupOwner(owner);
				setGroupMembers(mergedMembers);
				setGroupName(nameFromDb);
				setGroupNameInput(nameFromDb);
			  } else {
				console.warn("Group doc not found:", currentCollectionId);
				setGroupOwner(null);
				setGroupMembers([]);
				setGroupName('分帳記帳簿');
				setGroupNameInput('分帳記帳簿');
			  }
			},
			(err) => {
			  console.error("Error listening group doc:", err);
			  setGroupOwner(null);
			  setGroupMembers([]);
			}
		  );

		  return () => unsub();
		}, [db, currentCollectionId]);

		// 開始編輯群組名稱（只有成員可以編）
		const startEditGroupName = () => {
		  if (isReadOnly) return; // 非成員不能改
		  setGroupNameInput(groupName || '分帳記帳簿');
		  setIsEditingGroupName(true);
		};

		// 取消修改
		const cancelEditGroupName = () => {
		  setIsEditingGroupName(false);
		  setGroupNameInput(groupName || '分帳記帳簿');
		};

		// 儲存名稱到 Firestore
		const saveGroupName = async () => {
		  if (!db || !currentCollectionId) return;
		  if (isReadOnly) return;

		  const trimmed = (groupNameInput || '').trim() || '未命名記帳簿';

		  try {
			setIsLoading(true);
			setError(null);

			const groupRef = db.doc(`artifacts/${appId}/groups/${currentCollectionId}`);
			await groupRef.set(
			  {
				name: trimmed,
			  },
			  { merge: true }
			);

			setGroupName(trimmed);
			setGroupNameInput(trimmed);
			setIsEditingGroupName(false);
		  } catch (e) {
			console.error('saveGroupName error:', e);
			setError(`更新紀錄簿名稱失敗：${e.message}`);
		  } finally {
			setIsLoading(false);
		  }
		};

          // --- 2. 獲取所有公共暱稱 ---
          useEffect(() => {
            if (!authReady || !db) return;
            
            const profilesCollectionPath = `artifacts/${appId}/public_profiles`;
            const profilesRef = db.collection(profilesCollectionPath);

            const unsubscribeProfiles = profilesRef.onSnapshot((snapshot) => {
                const profiles = {};
                snapshot.forEach(docSnap => {
					const data = docSnap.data() || {};
					const uid = data.uid || docSnap.id;           // ✅ doc.id 就是 uid
					const displayName = data.displayName || data.email; // ✅ 沒暱稱就退回 email
					if (uid && displayName) {
					  profiles[uid] = displayName;
					}
                });
                setUserProfiles(profiles);
            }, (err) => {
                console.error("Error listening to user profiles:", err);
            });

            return () => unsubscribeProfiles();
          }, [authReady, db]);

          // --- 3. 獲取實時匯率 ---
          useEffect(() => {
			fetchExchangeRates().then(result => {
				setLiveExchangeRates(result.rates);
				setLastExchangeUpdate(result.lastUpdate);
			});
		  }, []);

			// 登出（改用 confirm modal，而不是 window.confirm）
          // --- Modal 開關 ---
          const openConfirmModal = useCallback((title, message, onConfirm, confirmText = '確認', confirmColor = 'red') => {
              setConfirmModalState({
                  isOpen: true,
                  title,
                  message,
                  confirmText,
                  confirmColor,
                  onConfirm,
              });
          }, []);

          const closeConfirmModal = useCallback(() => {
              setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          }, []);

			const logout = useCallback(() => {
			  if (!auth) return;

			  const onConfirm = async () => {
				closeConfirmModal();
				try {
				  await auth.signOut();
				  // Note: signOut will trigger onAuthStateChanged to run the anonymous login fallback
				  setExpenses([]);
				  setCustomMembers([]);
				  setDefaultSharesConfig({});
				} catch (e) {
				  setError(`登出失敗: ${e.message}`);
				}
			  };

			  openConfirmModal(
				'確認登出',
				'您確定要登出嗎？',
				onConfirm
			  );
			}, [
			  auth,
			  openConfirmModal,
			  closeConfirmModal,
			  setExpenses,
			  setCustomMembers,
			  setDefaultSharesConfig,
			  setError
			]);

          // --- 4. 數據獲取 (Firestore 監聽) ---
          useEffect(() => {
            // FIX: 只要不是完全未就緒，就允許載入 (即使是訪客模式，也需要 userId 和 currentCollectionId)
            if (!authReady || !db || !currentCollectionId || !userId) return; 

            const expensesCollectionPath = getGroupExpensesPath(currentCollectionId);
			const expensesRef = db.collection(expensesCollectionPath);

            const unsubscribeExpenses = expensesRef.onSnapshot((snapshot) => {
              const fetchedExpenses = snapshot.docs.map(docSnap => {
                const data = docSnap.data();
                const timestamp = data.timestamp ? data.timestamp.toDate() : null; 
                
                const originalAmount = data.originalAmount !== undefined ? data.originalAmount : data.amount;
                const currency = data.currency || DEFAULT_CURRENCY;
                const exchangeRate = data.exchangeRate || (DEFAULT_EXCHANGE_RATES[currency] || 1.0);
                const amountInTWD = data.amountInTWD !== undefined ? data.amountInTWD : originalAmount * exchangeRate;

                return {
                  id: docSnap.id, 
                  ...data,
                  originalAmount: typeof originalAmount === 'number' ? originalAmount : parseFloat(originalAmount || 0),
                  currency: currency,
                  exchangeRate: exchangeRate,
                  amountInTWD: typeof amountInTWD === 'number' ? amountInTWD : parseFloat(amountInTWD || 0),
                  shares: data.shares || {},
                  timestamp: timestamp,
                };
              });
              setExpenses(fetchedExpenses);
            }, (err) => {
              console.error(`Error listening to expenses in collection ${currentCollectionId}:`, err);
              if (err.code === 'permission-denied') {
                  setError(`權限不足：無法讀取此分享連結對應的紀錄簿（ID: ${currentCollectionId}）。請洽擁有者確認權限。`);
              } else {
                  setError(`資料同步失敗: ${err.message}`);
              }
              setExpenses([]);
            });

            const membersDocPath = getGroupMembersDocPath(currentCollectionId);
			const membersDocRef = db.doc(membersDocPath);

            const unsubscribeMembers = membersDocRef.onSnapshot((docSnap) => {
                if (docSnap.exists) {
                    const data = docSnap.data();
                    const list = Array.isArray(data.list) ? data.list : [];
                    const shares = data.defaultShares || {};
                    
                    setCustomMembers(list);
                    setDefaultSharesConfig(shares); 
                } else {
                    setCustomMembers([]);
                    setDefaultSharesConfig({}); 
                }
            }, (err) => {
                console.error("Error listening to members settings:", err);
            });

            return () => {
              unsubscribeExpenses();
              unsubscribeMembers();
            };
          }, [authReady, db, currentCollectionId, userId]); // FIX: Add userId dependency

          // --- 5. 衍生成員清單 ---
			useEffect(() => {
			  let currentMembers = [].filter(Boolean);

			  if (!isGuest && currentCollectionId) {
				currentMembers.push(currentCollectionId);
			  }

			  // 群組可編輯成員一定要在
			  groupMembers.forEach(uid => {
				if (!currentMembers.includes(uid)) currentMembers.push(uid);
			  });

			  // 自訂分帳成員一定要在
			  customMembers.forEach(name => {
				if (name !== currentCollectionId && !currentMembers.includes(name)) {
				  currentMembers.push(name);
				}
			  });

			  // ✅ NEW: 把支出資料實際用到的所有成員 key 也加進來（防止結餘被「刪名」影響）
			  expenses.forEach(exp => {
				if (exp?.payerName && !currentMembers.includes(exp.payerName)) {
				  currentMembers.push(exp.payerName);
				}
				const shareKeys = Object.keys(exp?.shares || {});
				shareKeys.forEach(k => {
				  if (k && !currentMembers.includes(k)) currentMembers.push(k);
				});
			  });

			  setMembers(currentMembers);
			}, [currentCollectionId, customMembers, isGuest, groupMembers, expenses]); // ✅ NEW: 加上 expenses 依賴

          const getInitialShares = useCallback(() => {
            return members.reduce((acc, name) => {
                const shareValue = defaultSharesConfig[name] !== undefined ? defaultSharesConfig[name] : 1;
                acc[name] = shareValue;
                return acc;
            }, {});
          }, [members, defaultSharesConfig]);

          // --- UI 輔助 ---
          // NEW: 通用 Toast 訊息設定函式 (包含定時清除)
          const setToastMessage = useCallback((message) => {
            setCopyMessage(message); 
            if (message) {
                // 設定 4 秒後自動清除
                setTimeout(() => setCopyMessage(''), 4000); 
            }
          }, []); 

          const getDisplayName = useCallback((memberId) => {
            if (userProfiles[memberId]) {
                return userProfiles[memberId];
            }
            
            if (memberId === userId) {
                const currentUser = auth?.currentUser;
                const displayName = currentUser?.displayName || currentUser?.email;
                
                // NEW: 針對匿名用戶顯示訪客名稱
                if (currentUser?.isAnonymous) {
                    return '訪客 (Guest)';
                }
                
                return displayName || '我 (You)';
            }
            
            if (memberId === currentCollectionId && memberId) {
                const shortId = memberId.substring(0, 5) + '...' + memberId.substring(memberId.length - 5);
                return shortId;
            }
            
            return memberId;
          }, [userId, auth, currentCollectionId, userProfiles]);

          const startAdd = useCallback(() => {
            if (isReadOnly) {
                setError('您正在瀏覽共享紀錄簿，無法進行修改。請切換回您的私有紀錄簿。');
                return;
            }
            setExpenseModalState({
                isOpen: true,
                editingExpense: null,
                isEditing: false,
            });
          }, [isReadOnly]);
          
          const startEdit = useCallback((expense) => {
             if (isReadOnly) {
                setError('您正在瀏覽共享紀錄簿，無法進行修改。請切換回您的私有紀錄簿。');
                return;
             }
             setExpenseModalState({
                isOpen: true,
                editingExpense: expense,
                isEditing: true,
             });
          }, [isReadOnly]);

          const closeExpenseModal = useCallback(() => {
            setExpenseModalState({
                isOpen: false,
                editingExpense: null,
                isEditing: false,
            });
            setError(null);
          }, []);

          // --- 6. 支出 CRUD ---

          const deleteExpense = useCallback(async (expense) => {
            if (isReadOnly) {
                setError('唯讀模式下無法刪除。');
                return;
            }
            if (!db) return;
            const expenseId = typeof expense === 'string' ? expense : expense?.id;
            if (!expenseId) return;

            const onConfirm = async () => {
                closeConfirmModal();
                setIsLoading(true);
                setError(null);
                try {
                    const docPath = `${getGroupExpensesPath(currentCollectionId)}/${expenseId}`;
                    await db.doc(docPath).delete();
                    if (expense?.imagePath) {
                        try {
                            await firebase.storage().ref(expense.imagePath).delete();
                        } catch (imageDeleteError) {
                            console.warn('Delete expense image failed:', imageDeleteError);
                        }
                    }
                } catch (e) {
                    console.error("Error deleting document: ", e);
                    setError(`刪除支出失敗: ${e.message}`);
                } finally {
                    setIsLoading(false);
                }
            };
            
            openConfirmModal('確認刪除支出', '您確定要刪除這筆支出記錄嗎？此操作無法撤銷。', onConfirm);
          }, [db, currentCollectionId, isReadOnly, openConfirmModal, closeConfirmModal, setError, setIsLoading]);

          const clearAllExpenses = useCallback(async () => {
              if (isReadOnly) {
                  setError('唯讀模式下無法清除資料。');
                  return;
              }
              if (!db) return;

              const onConfirm = async () => {
                  closeConfirmModal();
                  setIsLoading(true);
                  setError(null);
                  try {
                      const expensesCollectionPath = getGroupExpensesPath(currentCollectionId);
                      const snapshot = await db.collection(expensesCollectionPath).get();

                      const batch = db.batch();
                      const imagePaths = [];
                      snapshot.docs.forEach(doc => {
                          const data = doc.data() || {};
                          if (data.imagePath) imagePaths.push(data.imagePath);
                          batch.delete(doc.ref);
                      });
                      await batch.commit();
                      await Promise.allSettled(
                          imagePaths.map(path => firebase.storage().ref(path).delete())
                      );
                  } catch (e) {
                      console.error("Error clearing all documents: ", e);
                      setError(`清除所有資料失敗: ${e.message}`);
                  } finally {
                      setIsLoading(false);
                  }
              };

              openConfirmModal(
                  '確認清除所有支出', 
                  '您確定要刪除此記帳簿中的所有支出記錄嗎？', 
                  onConfirm
              );
          }, [db, currentCollectionId, isReadOnly, openConfirmModal, closeConfirmModal, setError, setIsLoading]);

          // --- 7. 成員管理 ---
          const saveMembers = useCallback(async (newMemberList) => {
            if (isReadOnly) return;
            if (!db) return;

            setIsLoading(true);
            setError(null);
            try {
                const docPath = getGroupMembersDocPath(currentCollectionId);
                const membersDocRef = db.doc(docPath);

                const sanitizedList = Array.from(new Set(
                    newMemberList.filter(name => name.trim() !== '' && name !== currentCollectionId)
                ));

                const currentShares = {};
                members.forEach(name => {
                    const share = defaultSharesConfig[name] !== undefined ? defaultSharesConfig[name] : 1;
                    if (share !== 1 && share >= 0) {
                        currentShares[name] = share;
                    }
                });

                await membersDocRef.set({ list: sanitizedList, defaultShares: currentShares }, { merge: false });
            } catch (e) {
                console.error("Error saving members:", e);
                setError(`儲存成員清單失敗: ${e.message}`);
            } finally {
                setIsLoading(false);
            }
          }, [db, currentCollectionId, isReadOnly, members, defaultSharesConfig, setError, setIsLoading]);

			// 透過 email 邀請使用者加入這個群組（有編輯權）
			// NEW: 傳入 setModalMessage
			const inviteUserByEmail = useCallback(
			  async (emailToInviteRaw, setModalMessage) => { 
				if (!db || !currentCollectionId || isReadOnly) return;
				const emailToInvite = (emailToInviteRaw || '').trim().toLowerCase();
				if (!emailToInvite) return;

				setIsLoading(true);
				setError(null);

				try {
				  // 1) 用 email 找 public_profiles
				  const profilesRef = db.collection(`artifacts/${appId}/public_profiles`);
				  const snap = await profilesRef.where('email', '==', emailToInvite).limit(1).get();

				  if (snap.empty) {
					setModalMessage('❌ 找不到使用這個 Email 註冊的帳號，請對方先在這個系統登入一次。'); // 使用 Modal Message
					return;
				  }

				  const profileData = snap.docs[0].data();
				  const invitedUid = profileData.uid;
				  const invitedDisplayName =
					profileData.displayName || profileData.email || emailToInvite;

				  if (!invitedUid) {
					setError('這個 Email 的使用者資料異常，請稍後再試。'); 
					return;
				  }

				  // 2) 檢查是否已經是成員：如果是，提示就好，不要重複加入
				  if (groupMembers.includes(invitedUid)) {
					setModalMessage(`❌ 「${getDisplayName(invitedUid)}」已經是這本記帳簿的成員了。`); // <-- MODIFIED
					return;
				  }

				  // 3) 把 uid 加進 group.members
				  const groupRef = db.doc(`artifacts/${appId}/groups/${currentCollectionId}`);
				  await groupRef.update({
					members: firebase.firestore.FieldValue.arrayUnion(invitedUid),
				  });

				  // 4) 把他也加入「分帳成員名單」（settings/members.list）
				  if (!customMembers.includes(invitedUid)) {
				    const newMemberList = [...customMembers, invitedUid];
				    await saveMembers(newMemberList);
				  }

				  // ✅ NEW: 如果「舊自訂名稱」剛好等於新帳號 displayName → 直接自動替換
				  // 判斷條件：customMembers 內存在同名字串，且它看起來是「舊自訂名稱」(非 uid)
				  const sameNicknameOldNameExists =
				    customMembers.includes(invitedDisplayName) &&
				    typeof invitedDisplayName === 'string' &&
				    invitedDisplayName.length < 20 &&        // 你的 UI 判斷 custom name 的方式
				    invitedDisplayName !== invitedUid &&
				    invitedDisplayName !== currentCollectionId;

				  if (sameNicknameOldNameExists) {
				    // 自動合併：不跳確認
				    await migrateMemberID(invitedDisplayName, invitedUid, setModalMessage, { skipConfirm: true });
				    // 合併後不需要再提示手動替換
				  } else {
				    // 不同暱稱或沒有舊名稱 → 維持原本行為（不同就手動替換）
				    // 你可以保留提示（可選）
				  }

				  // 5) 清空輸入框 and Success Message
				  setInviteEmail('');
				  setModalMessage(`✅ 已成功邀請成員: ${invitedDisplayName}`);
				  console.log(
					`已邀請成員 ${invitedDisplayName} (${invitedUid}) 並加入分帳成員名單`
				  );
				} catch (e) {
				  console.error('inviteUserByEmail error:', e);
				  setError(`邀請成員失敗: ${e.message}`); 
				} finally {
				  setIsLoading(false);
				}
			  },
			  [db, currentCollectionId, customMembers, saveMembers, groupMembers, userProfiles, getDisplayName, isReadOnly, setError, setIsLoading]
			);

			// 從群組中移除成員（同時從分帳成員名單中移除）
			// NEW: 傳入 setModalMessage，讓移除成功的訊息顯示在 Modal 內部
			const removeGroupMember = useCallback(
			  (memberUid, setModalMessage) => {
				if (isReadOnly) return;

				// 不允許移除 owner
				if (memberUid === groupOwner) {
				  setError('無法移除擁有者。如需變更，請先移轉或建立新的記帳簿。');
				  return;
				}

				const onConfirm = async () => {
				  closeConfirmModal();
				  try {
					setIsLoading(true);
					setError(null);

					// 1) 從 group.members 移除
					const groupRef = db.doc(`artifacts/${appId}/groups/${currentCollectionId}`);
					await groupRef.update({
					  members: firebase.firestore.FieldValue.arrayRemove(memberUid),
					});

					// 2) 從分帳成員列表移除
					const newMemberList = customMembers.filter(id => id !== memberUid);
					await saveMembers(newMemberList);
                    if (setModalMessage) setModalMessage(`🗑️ 已移除共享成員: ${getDisplayName(memberUid)}`);

				  } catch (e) {
					console.error('removeGroupMember error:', e);
					setError(`移除成員失敗：${e.message}`);
				  } finally {
					setIsLoading(false);
				  }
				};

				openConfirmModal(
				  '確認移除共享成員',
				  `確定要移除成員「${getDisplayName(memberUid)}」嗎？`,
				  onConfirm
				);
			  },
			  [
				db,
				currentCollectionId,
				isReadOnly,
				groupOwner,
				customMembers,
				saveMembers,
				openConfirmModal,
				closeConfirmModal,
				getDisplayName,
				setError,
				setIsLoading
			  ]
			);

          // NEW: 讓 handleDeleteMember 回傳訊息給 Modal
          const handleDeleteMember = useCallback(async (nameToDelete, setModalMessage) => {
            if (isReadOnly) return;
            
            const onConfirm = async () => {
                closeConfirmModal();
                const newMemberList = customMembers.filter(name => name !== nameToDelete);
                await saveMembers(newMemberList);
                if (setModalMessage) setModalMessage(`🗑️ 已從分帳清單移除: ${getDisplayName(nameToDelete)}`);
            };

            openConfirmModal(
                '確認刪除成員', 
                `您確定要從成員清單中移除 ${getDisplayName(nameToDelete)} 嗎？`, 
                onConfirm
            );

          }, [customMembers, saveMembers, isReadOnly, openConfirmModal, closeConfirmModal, getDisplayName, setError, setIsLoading]);

          // NEW: 讓 handleSaveDefaultShares 回傳訊息給 Modal
          const handleSaveDefaultShares = useCallback(async (tempShares, setModalMessage) => {
            if (isReadOnly) return;
            if (!db) return;

            setIsLoading(true);
            setError(null);
            try {
                const docPath = getGroupMembersDocPath(currentCollectionId);
                const membersDocRef = db.doc(docPath);

                const sharesToSave = {};
                members.forEach(name => {
                    const share = tempShares[name]; 
                    if (share !== undefined && share >= 0) {
                        if (share !== 1) { 
                            sharesToSave[name] = share;
                        }
                    }
                });
                
                await membersDocRef.set({ list: customMembers, defaultShares: sharesToSave }, { merge: false });
                setIsMemberModalOpen(false);
                if (setModalMessage) setModalMessage(`✅ 預設份數已儲存！`);
            } catch (e) {
                console.error("Error saving default shares:", e);
                setError(`儲存預設份數失敗: ${e.message}`);
            } finally {
                setIsLoading(false);
            }
          }, [db, currentCollectionId, customMembers, members, isReadOnly, setError, setIsLoading]);
          
          
			// --- 11. 成員 ID 遷移/替換功能 ---
			// options = { skipConfirm: boolean }
			const migrateMemberID = useCallback(async (oldName, newId, setModalMessage, options = {}) => {
			  const { skipConfirm = false } = options;

			  if (isReadOnly) {
				setModalMessage?.('❌ 唯讀模式下無法進行成員合併/替換操作。');
				return;
			  }
			  if (!db || !currentCollectionId || !oldName || !newId || oldName === newId) return;

			  // ✅ 改成直接讀取 group doc，避免 state 還沒更新造成誤判
			  try {
				const groupRef = db.doc(`artifacts/${appId}/groups/${currentCollectionId}`);
				const groupSnap = await groupRef.get();
				const data = groupSnap.data() || {};
				const membersFromDb = Array.isArray(data.members) ? data.members : [];
				const ownerFromDb = data.owner || null;
				const merged = membersFromDb.includes(ownerFromDb) ? membersFromDb : [...membersFromDb, ownerFromDb].filter(Boolean);

				if (!merged.includes(newId)) {
				  setModalMessage?.('❌ 目標帳號（新 ID）必須是已加入本紀錄簿的用戶 ID。');
				  return;
				}
			  } catch (e) {
				console.error('讀取 group members 失敗:', e);
				setModalMessage?.(`❌ 檢查群組成員失敗：${e.message}`);
				return;
			  }

			  const doMigrate = async () => {
				setIsLoading(true);
				setError(null);

				try {
				  // --- 1) 更新 settings/members 文檔 (Transaction)
				  const membersDocPath = getGroupMembersDocPath(currentCollectionId);
				  const membersDocRef = db.doc(membersDocPath);

				  await db.runTransaction(async (transaction) => {
					const docSnap = await transaction.get(membersDocRef);
					const data = docSnap.data() || {};
					let list = Array.isArray(data.list) ? data.list : [];
					let shares = data.defaultShares || {};

					// a) list: oldName -> newId
					const oldIndex = list.findIndex((name) => name === oldName);
					if (oldIndex !== -1) {
					  list.splice(oldIndex, 1);
					  if (!list.includes(newId)) list.push(newId);
					} else {
					  // list 裡沒有 oldName 也沒關係，但如果 newId 不在 list，順便補進去
					  if (!list.includes(newId)) list.push(newId);
					}

					// b) defaultShares: oldName -> newId（合併）
					if (shares[oldName] !== undefined) {
					  shares[newId] = (shares[newId] || 0) + shares[oldName];
					  delete shares[oldName];
					}

					// 保持唯一，且避免把 groupId(owner uid) 重複塞進 list
					const sanitizedList = Array.from(new Set(
					  list.filter((name) => (name || '').trim() !== '' && name !== currentCollectionId)
					));

					transaction.set(membersDocRef, { list: sanitizedList, defaultShares: shares }, { merge: false });
				  });

				  // --- 2) 批量更新 expenses (Batch)
				  const expensesCollectionPath = getGroupExpensesPath(currentCollectionId);
				  const expensesSnapshot = await db.collection(expensesCollectionPath).get();

				  let batch = db.batch();
				  let updateCount = 0;
				  let batchOpCount = 0;

				  for (const docSnap of expensesSnapshot.docs) {
					const data = docSnap.data();
					let needsUpdate = false;
					const updateData = {};

					if (data.payerName === oldName) {
					  updateData.payerName = newId;
					  needsUpdate = true;
					}

					const shares = data.shares || {};
					if (shares[oldName] !== undefined) {
					  const newShares = { ...shares };
					  const shareValue = newShares[oldName];
					  newShares[newId] = (newShares[newId] || 0) + shareValue;
					  delete newShares[oldName];

					  updateData.shares = newShares;
					  needsUpdate = true;
					}

					if (needsUpdate) {
					  batch.update(docSnap.ref, updateData);
					  updateCount++;
					  batchOpCount++;

					  if (batchOpCount >= 400) {
						await batch.commit();
						batch = db.batch();
						batchOpCount = 0;
					  }
					}
				  }

				  if (batchOpCount > 0) await batch.commit();

				  setModalMessage?.(`✅ 已將「${oldName}」自動替換為「${getDisplayName(newId)}」，並同步 ${updateCount} 筆支出。`);
				} catch (e) {
				  console.error("Error migrating member ID:", e);
				  setError(`成員替換失敗: ${e.message}`);
				  setModalMessage?.(`❌ 成員替換失敗: ${e.message}`);
				} finally {
				  setIsLoading(false);
				}
			  };

			  if (skipConfirm) {
				// ✅ 自動模式：不跳確認
				await doMigrate();
				return;
			  }

			  // 原本手動模式：保留 confirm modal
			  const onConfirm = async () => {
				closeConfirmModal();
				await doMigrate();
			  };

			  const message = `確認後會將所有與「${oldName}」相關的支出記錄和設定轉移到新成員「${getDisplayName(newId)}」上。`;
			  openConfirmModal('轉移資料', message, onConfirm, '確認', 'red');

			}, [
			  db,
			  currentCollectionId,
			  isReadOnly,
			  openConfirmModal,
			  closeConfirmModal,
			  setIsLoading,
			  setError,
			  getDisplayName
			]);

          // --- 8. 清算結餘功能 ---
          const settleMemberDebt = useCallback(async (debtorId, amount, creditorId) => {
              if (isReadOnly) {
                  setError('唯讀模式下無法進行結算操作。');
                  return;
              }
              if (!db || !userId) return;

              const roundedAmount = Math.round(amount);
              if (roundedAmount <= 0) return;

              const onConfirm = async () => {
                  closeConfirmModal();
                  setIsLoading(true);
                  setError(null);
                  try {
                      const collectionPath = getGroupExpensesPath(currentCollectionId);
                      
                      // 使用新欄位格式：originalAmount / currency / amountInTWD
                      await db.collection(collectionPath).add({
                          description: `[結清] ${getDisplayName(debtorId)} 歸還給 ${getDisplayName(creditorId)} 欠款`,
                          originalAmount: roundedAmount,
                          currency: DEFAULT_CURRENCY,
                          exchangeRate: 1,
                          amountInTWD: roundedAmount,
                          payerName: debtorId,
                          shares: { [creditorId]: roundedAmount },
                          timestamp: serverTimestamp(),
                          creatorId: userId,
                          appId: appId,
                      });
                      setToastMessage(`✅ 已新增結清記錄 TWD ${roundedAmount.toFixed(0)}！`); // 結算成功 Toast
                  } catch (e) {
                      console.error("Error settling debt: ", e);
                      setError(`結算失敗: ${e.message}`);
                  } finally {
                      setIsLoading(false);
                  }
              };
              
              openConfirmModal(
                  '確認轉帳結清', 
                  `您確定 ${getDisplayName(debtorId)} 已向 ${getDisplayName(creditorId)} 支付 TWD ${roundedAmount.toFixed(0)} 並結清欠款嗎？`, 
                  onConfirm, 
                  '確認結清', 
                  'green'
              );

          }, [db, userId, currentCollectionId, isReadOnly, getDisplayName, openConfirmModal, closeConfirmModal, setToastMessage, setError, setIsLoading]);

          // --- 9. 分帳計算 ---
          const calculateBalances = useMemo(() => {
            const balances = members.reduce((acc, name) => ({ ...acc, [name]: 0 }), {});

            expenses.forEach(expense => {
              const amount = expense.amountInTWD; 
              const { payerName, shares } = expense;
              const totalShares = Object.values(shares).reduce((sum, s) => sum + s, 0);

              if (totalShares === 0) return;

              const costPerShare = amount / totalShares;

              if (balances[payerName] !== undefined) {
                balances[payerName] += amount;
              }

              Object.entries(shares).forEach(([member, shareCount]) => {
                const memberCost = costPerShare * shareCount;
                if (balances[member] !== undefined) {
                  balances[member] -= memberCost;
                }
              });
            });

            return balances;
          }, [expenses, members]);

          const calculateSettlements = useMemo(() => {
            const balances = calculateBalances;
            const settlements = [];

            const creditors = []; 
            const debtors = []; 

            const mutableBalances = { ...balances };

            for (const member in mutableBalances) {
                const balance = mutableBalances[member];
                if (balance >= 1) { 
                    creditors.push({ name: member, amount: balance });
                } else if (balance <= -1) { 
                    debtors.push({ name: member, amount: -balance }); 
                }
            }

            let i = 0; 
            let j = 0; 

            while (i < debtors.length && j < creditors.length) {
                const debtor = debtors[i];
                const creditor = creditors[j];

                const transferAmount = Math.round(Math.min(debtor.amount, creditor.amount));

                if (transferAmount > 0) {
                    settlements.push({
                        from: debtor.name,
                        to: creditor.name,
                        amount: transferAmount,
                    });
                }

                debtor.amount -= transferAmount;
                creditor.amount -= transferAmount;

                if (debtor.amount < 1) { 
                    i++;
                }
                if (creditor.amount < 1) {
                    j++;
                }
            }
            
            return settlements;
          }, [calculateBalances]); 

          const formatTimestamp = (timestamp) => {
            if (!timestamp) return '無日期';
            const date = timestamp instanceof Date ? timestamp : (timestamp.toDate ? timestamp.toDate() : null);
            if (!date) return '無日期';

            return date.toLocaleDateString('zh-TW', {
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
          };

		  // --- 計算換算結果 ---
          const convertedAmount = useMemo(() => {
              const amount = parseFloat(converterAmount) || 0;
              if (amount <= 0) return 0;
              
              // ✨ FIXED: Step 1: Convert source amount to TWD
              // 使用 liveExchangeRates，如果沒有，則使用 DEFAULT_EXCHANGE_RATES (包含硬編碼 4.5)，再沒有才用 1.0
              const rateToTWD = liveExchangeRates[converterSourceCurrency] 
                                || DEFAULT_EXCHANGE_RATES[converterSourceCurrency] // 新增備用
                                || 1.0; 
              const amountInTWD = amount * rateToTWD;

              // ✨ FIXED: Step 2: Convert TWD to target currency
              const rateToTarget = liveExchangeRates[converterTargetCurrency] 
                                   || DEFAULT_EXCHANGE_RATES[converterTargetCurrency] // 新增備用
                                   || 1.0; 
              
              if (rateToTarget === 0) return 0; // Avoid division by zero
              
              // 1 Target Currency = X TWD (rateToTarget)
              // 1 TWD = 1 / rateToTarget Target Currency
              const targetAmount = amountInTWD / rateToTarget;
              
              // 換算結果四捨五入到小數點後兩位 (為了精準度，不像分帳只取整數)
              return parseFloat(targetAmount.toFixed(2));

          }, [converterAmount, converterSourceCurrency, converterTargetCurrency, liveExchangeRates]);

			// --- 渲染 ---
			const currentUserLabel = userId ? getDisplayName(userId) : '';
			const isViewingOwn = currentCollectionId === userId && !isGuest; // MODIFIED: 訪客模式不算 viewing own

			// 複製分享連結（移到 header 使用）
			const handleCopyShareLink = useCallback(() => {
			  if (!userId || !currentCollectionId || !currentCollectionShortCode || isGuest) return; // MODIFIED: 訪客不能複製

			  // 修正為複製短代碼路徑連結
			  const url = new URL(window.location.href);
			  let rootPath = url.pathname;
			  const marker = '/g/';
			  const idx = rootPath.indexOf(marker);
			  if (idx !== -1) {
				rootPath = rootPath.slice(0, idx);
			  }
			  if (!rootPath.endsWith('/')) {
				rootPath = rootPath + '/';
			  }
			  // 組裝新的短代碼分享連結
			  const shareUrl = `${window.location.origin}${rootPath}g/${currentCollectionShortCode}`;

			  const tempInput = document.createElement('textarea');
			  tempInput.value = shareUrl;
			  document.body.appendChild(tempInput);
			  tempInput.select();

			  try {
				document.execCommand('copy');
				setToastMessage('✨ 分享連結已複製！');
			  } catch (err) {
				console.error('無法複製連結', err);
				setToastMessage('複製失敗，請手動複製網址。');
			  }

			  document.body.removeChild(tempInput);
			}, [userId, currentCollectionId, currentCollectionShortCode, setToastMessage, isGuest]);

			// 返回自己的記帳簿（加入 confirm modal）
			const handleReturnToOwn = useCallback(() => {
			  if (!db || !userId) return;

			  const onConfirm = async () => {
				closeConfirmModal();

				try {
				  setIsLoading(true);
				  setError(null);

				  const usersCollectionPath = `artifacts/${appId}/users`;
				  const usersRef = db.collection(usersCollectionPath);
				  const myDocRef = usersRef.doc(userId);
				  const mySnap = await myDocRef.get();

				  let myShortCode = null;

				  if (mySnap.exists) {
					const data = mySnap.data() || {};
					myShortCode = data.shortCode || null;
				  }

				  // 如果還沒有 shortCode，就幫自己產生一個
				  if (!myShortCode) {
					myShortCode = generateShortCode();
					await myDocRef.set(
					  {
						shortCode: myShortCode,
						createdAt: serverTimestamp(),
					  },
					  { merge: true }
					);
				  }

				  // 切回自己的紀帳簿
				  setCurrentCollectionId(userId);
				  setCurrentCollectionShortCode(myShortCode);

				  // 更新網址為 /g/自己的 shortCode（不重整頁面）
				  const url = new URL(window.location.href);
				  let rootPath = url.pathname;
				  const marker = '/g/';
				  const idx = rootPath.indexOf(marker);
				  if (idx !== -1) {
					rootPath = rootPath.slice(0, idx);
				  }
				  if (!rootPath.endsWith('/')) {
					rootPath = rootPath + '/';
				  }
				  const newUrl = `${rootPath}g/${myShortCode}`;
				  window.history.replaceState(null, '', newUrl);
				} catch (e) {
				  console.error('handleReturnToOwn error:', e);
				  setError(`返回自己的記帳簿失敗：${e.message}`);
				} finally {
				  setIsLoading(false);
				}
			  };

			  openConfirmModal(
				'返回自己的記帳簿',
				'確定要返回自己的記帳簿嗎？',
				onConfirm
			  );
			}, [
			  db,
			  userId,
			  openConfirmModal,
			  closeConfirmModal,
			  setIsLoading,
			  setError,
			  setCurrentCollectionId,
			  setCurrentCollectionShortCode,
			]);

          if (!authReady) {
            return (
                <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                    <p className="text-lg text-primaryColor-600">應用程式啟動中...</p>
                </div>
            );
          }
          
          if (!userId || !auth) {
            // 這應該不會被觸發，因為在 onAuthStateChanged 內已確保 userId 存在 (匿名登入)
            return (
                <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                    <p className="text-lg text-red-600">認證服務錯誤，無法啟動應用程式。</p>
                </div>
            );
          }
          const isOwner = userId === groupOwner;  // ✅ 只有 owner 才能管理共享/成員
		  return (
            <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
              <div className="max-w-4xl mx-auto">
                {/* 標題和主要操作按鈕 */}
				<header className="py-6 border-b border-gray-200">
				  <div className="flex items-start justify-between gap-4">
					{/* 左邊：標題與匯率資訊 */}
					<div className="flex flex-col gap-2 flex-1 min-w-0">
					  <div className="flex items-center gap-3">
						<Pencil className="w-10 h-10 text-primaryColor-700" />

						{isEditingGroupName && !isReadOnly ? (
						  <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
							<input
							  type="text"
							  value={groupNameInput}
							  onChange={(e) => setGroupNameInput(e.target.value)}
							  onKeyDown={(e) => {
								if (e.key === 'Enter') {
								  e.preventDefault();
								  saveGroupName();
								} else if (e.key === 'Escape') {
								  e.preventDefault();
								  cancelEditGroupName();
								}
							  }}
							  className="w-full border-b border-primaryColor-500 bg-transparent text-2xl sm:text-3xl font-extrabold text-primaryColor-700 focus:outline-none focus:border-primaryColor-700"
							  autoFocus
							  maxLength={40}
							  placeholder="輸入這本分帳記帳簿名稱"
							/>

							{/* 按鈕在手機時會換到下一行 */}
							<div className="flex gap-2 justify-end sm:justify-start">
							  <button
								type="button"
								onClick={saveGroupName}
								disabled={isLoading || !groupNameInput.trim()}
								className={
								  "px-3 py-1 rounded-lg text-sm font-semibold text-white shadow-md " +
								  ((isLoading || !groupNameInput.trim())
									? "bg-gray-400 cursor-not-allowed"
									: "bg-primaryColor-600 hover:bg-primaryColor-700")
								}
							  >
								儲存
							  </button>
							  <button
								type="button"
								onClick={cancelEditGroupName}
								className="px-3 py-1 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
							  >
								取消
							  </button>
							</div>
						  </div>
						) : (
						  // 原本的顯示模式保持不變
						  <div className="flex flex-col">
							<h1
							  className={
								"text-3xl sm:text-4xl font-extrabold text-primaryColor-700 " +
								(isReadOnly ? "" : "cursor-text hover:underline decoration-dotted")
							  }
							  onClick={() => {
								if (!isReadOnly) {
								  startEditGroupName();
								}
							  }}
							  title={isReadOnly ? "" : "點擊以修改這本分帳記帳簿名稱"}
							>
							  {groupName || '分帳記帳簿'}
							</h1>
						  </div>
						)}
					  </div>

					  {lastExchangeUpdate && (
						<p className="text-xs text-gray-500">
						  匯率更新：{new Date(lastExchangeUpdate).toLocaleTimeString('zh-TW', {
							hour: '2-digit',
							minute: '2-digit',
							hour12: true,
						  })}
						  
						  
							{/* 顯示目前來源幣值的匯率 */}
							（{converterSourceCurrency}：
							  {liveExchangeRates?.[converterSourceCurrency]?.toFixed(4)}
							）
						</p>
					  )}
					</div>

					{/* 右上角：登出 / 返回自己的記帳簿 / 註冊登入 */}
					<div className="flex flex-col items-end gap-1">
					  {isGuest ? (
						// Guest Mode: Show Register/Login
						<button
						  onClick={() => setIsAuthModalOpen(true)}
						  className="mt-1 inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-primaryColor-600 border border-primaryColor-300 bg-white hover:bg-primaryColor-50 transition"
						  title="註冊/登入以獲得完整功能"
						>
						  {/* 使用 LogOut 圖標並旋轉 180 度模擬登入箭頭 */}
						  <LogOut className="w-4 h-4 mr-1 transform rotate-180" /> 
						  <span className="inline">註冊/登入</span>
						</button>
					  ) : isViewingOwn ? (
						// Logged in, viewing own group: Show Logout
						<button
						  onClick={logout}
						  className="mt-1 inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-red-600 border border-red-300 hover:bg-red-50 transition"
						  title="登出"
						>
						  <LogOut className="w-4 h-4 mr-1" />
						  <span className="inline">登出</span>
						</button>
					  ) : (
						// Logged in, viewing shared group: Show Return to Own
						<button
						  onClick={handleReturnToOwn}
						  className="mt-1 inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-primaryColor-700 border border-primaryColor-300 hover:bg-primaryColor-50 transition"
						>
						  返回自己的記帳簿
						</button>
					  )}

						{/* 分享按鈕：移到登出下面 */}
						<button
						  type="button"
						  onClick={handleCopyShareLink}
						  disabled={isGuest}
						  className={
                            "mt-1 inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold border bg-white transition " +
                            (isGuest ? "text-gray-400 border-gray-300 cursor-not-allowed" : "text-primaryColor-700 border-primaryColor-400 hover:bg-primaryColor-50")
                          }
						  title={isGuest ? "請登入後再分享" : "生成並複製這本記帳簿的分享連結"}
						>
						  <Share2 className="w-4 h-4 mr-1" />
						  點擊複製連結
						</button>
					</div>
				  </div>
				</header>
                
				{/* ✨ MODIFIED: 頂部匯率換算器 - 放在 header 之後，功能按鈕之前 */}
				<div className="mt-4 p-4 bg-white rounded-xl shadow-lg border-b border-primaryColor-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
					
					{/* 1. 標籤與輸入組 */}
					<div className="flex items-center gap-2 flex-grow min-w-0"> 
						<span className="font-semibold text-gray-700 flex-shrink-0 text-sm"></span>
						{/* 來源幣別選擇框 (左邊) */}
						<select
							value={converterSourceCurrency}
							onChange={(e) => setConverterSourceCurrency(e.target.value)}
							className="block flex-shrink-0 w-auto border border-gray-300 rounded-lg shadow-sm p-2 text-sm focus:ring-primaryColor-500 focus:border-primaryColor-500 bg-white"
						>
							{CURRENCIES.map(code => (
								<option key={`source-${code}`} value={code}>{code}</option>
							))}
						</select>
						{/* 金額輸入框 - 保持寬度限制並移除 w-full */}
						<input
							type="number"
							value={converterAmount}
							onChange={(e) => setConverterAmount(e.target.value)}
							placeholder="金額"
							// ✨ 更改: w-auto max-w-[100px] 確保不會佔滿剩餘空間
							className="block w-auto max-w-[100px] border border-gray-300 rounded-lg shadow-sm p-2 text-sm focus:ring-primaryColor-500 focus:border-primaryColor-500"
						/>
					</div>
					
					{/* 2. 輸出結果 - 確保在最右邊，並在空間不足時換行 */}
					<div className="flex items-center space-x-1 flex-shrink-0 ml-auto sm:ml-0">
						<span className="text-gray-500 text-sm"></span>
						{/* 目標幣別選擇框 (右邊) */}
						<select
							value={converterTargetCurrency}
							onChange={(e) => setConverterTargetCurrency(e.target.value)}
							className="block flex-shrink-0 w-auto border border-gray-300 rounded-lg shadow-sm p-2 text-sm focus:ring-primaryColor-500 focus:border-primaryColor-500 bg-white font-bold"
						>
							{CURRENCIES.map(code => (
								<option key={`target-${code}`} value={code}>{code}</option>
							))}
						</select>
						<span className="text-xl font-bold text-primaryColor-600">
							{convertedAmount.toLocaleString('zh-TW')}
						</span>
					</div>
				</div>

                {/* 錯誤訊息提示 (App層級) */}
                {error && (
                    <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                        <p className="font-semibold">錯誤提示:</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}
                
                {/* NEW: 複製連結成功或失敗的訊息提示 (Toast 效果) - 保持全域，用於登入/登出/複製 */}
                {copyMessage && (
                    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 p-3 bg-primaryColor-600 text-white rounded-lg shadow-xl z-50 transition-opacity duration-300">
                        <p className="font-semibold text-sm">{copyMessage}</p>
                    </div>
                )}
                
                
                {/* 主要功能區塊 */}
                <div className="mt-6 flex space-x-4">
                  <button
                    onClick={startAdd}
                    disabled={isReadOnly}
                    className={
                      "flex-1 flex items-center justify-center px-4 py-3 rounded-xl text-white transition duration-300 shadow-xl hover:scale-[1.03] transform disabled:bg-gray-400 disabled:cursor-not-allowed " +
                      (isReadOnly ? "bg-gray-400" : "bg-primaryColor-500 hover:bg-primaryColor-600 focus:ring-4 focus:ring-primaryColor-300")
                    }
                  >
                    <Plus className="w-6 h-6 mr-2" />
                    新增支出 {isReadOnly && '(唯讀)'}
                  </button>
                  <button
					onClick={() => {
					   if (!isOwner) {
					     setError('只有記帳簿擁有者可以管理分帳成員及共享權限。');
					     return;
					   }
					   setIsMemberModalOpen(true);
					   setError(null);
					 }}
					 disabled={!isOwner}
					 className={
					   "px-4 py-3 border text-lg font-bold rounded-xl bg-white focus:outline-none focus:ring-4 transition duration-300 shadow-xl hover:scale-[1.03] transform disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed " +
					   (!isOwner
					     ? "border-gray-400 text-gray-400"
					     : "focus:ring-primaryColor-300 border-primaryColor-500 text-primaryColor-600 hover:bg-primaryColor-50")
					 }
					 aria-label="管理成員與預設份數"
					 title={!isOwner ? "只有記帳簿擁有者可以操作" : "管理分帳成員與共享權限"}
				  >
				     <Users className="w-6 h-6" />
                  </button>
                </div>

                {/* 總結與列表 */}
                <BalanceSummary 
                    settlements={calculateSettlements} 
                    balances={calculateBalances} 
                    members={members} 
                    getDisplayName={getDisplayName} 
                    isReadOnly={isReadOnly}
                    settleMemberDebt={settleMemberDebt}
                />
                <ExpenseList 
                    expenses={expenses} 
                    deleteExpense={deleteExpense} 
                    startEdit={startEdit} 
                    isLoading={isLoading} 
                    getDisplayName={getDisplayName} 
                    formatTimestamp={formatTimestamp}
                    isReadOnly={isReadOnly}
                    clearAllExpenses={clearAllExpenses}
                    // ✨ 新增搜尋相關 props
                    searchKeyword={searchKeyword}
                    setSearchKeyword={setSearchKeyword}
                />

                {/* Modal 區塊 */}
                <ExpenseModal 
                    key={expenseModalState.isEditing && expenseModalState.editingExpense ? `edit-${expenseModalState.editingExpense.id}` : 'add-new'}
                    db={db}
                    currentUserId={userId}
                    members={members}
                    getInitialShares={getInitialShares}
                    state={expenseModalState}
                    onClose={closeExpenseModal}
                    getDisplayName={getDisplayName} 
                    isReadOnly={isReadOnly}
                    collectionId={currentCollectionId}
                    liveExchangeRates={liveExchangeRates}
					defaultCurrency={defaultCurrency}
					currentUserLabel={currentUserLabel}
                />
                <MemberManagementModal 
                    db={db}
                    currentUserId={userId}
                    members={members}
                    customMembers={customMembers}
                    defaultSharesConfig={defaultSharesConfig}
                    isMemberModalOpen={isMemberModalOpen}
                    setIsMemberModalOpen={setIsMemberModalOpen}
                    saveMembers={saveMembers}
                    handleSaveDefaultShares={handleSaveDefaultShares}
                    handleDeleteMember={handleDeleteMember}
                    setIsLoading={setIsLoading}
                    isLoading={isLoading}
                    setError={setError}
                    getDisplayName={getDisplayName}
                    isReadOnly={isReadOnly}
					inviteEmail={inviteEmail}
					setInviteEmail={setInviteEmail}
					groupMembers={groupMembers}
					groupOwner={groupOwner}
					inviteUserByEmail={inviteUserByEmail}
					removeGroupMember={removeGroupMember}
                    setToastMessage={setToastMessage}
                    migrateMemberID={migrateMemberID} // <-- NEW: 傳入新的遷移函式
                />
                
                {/* 統一的確認提示 Modal */}
                <ConfirmationModal 
                    isOpen={confirmModalState.isOpen}
                    onClose={closeConfirmModal}
                    onConfirm={confirmModalState.onConfirm}
                    title={confirmModalState.title}
                    message={confirmModalState.message}
                    confirmText={confirmModalState.confirmText}
                    confirmColor={confirmModalState.confirmColor}
                />

                {/* NEW: 訪客模式下的註冊/登入 Modal */}
                {isGuest && (
                    <AuthModal 
                       auth={auth} 
                       db={db} 
                       setToastMessage={setToastMessage} 
                       isOpen={isAuthModalOpen} 
                       onClose={() => setIsAuthModalOpen(false)} 
                     />
                 )}

              </div>

              {/* Tailwind color class fix, 讓 primaryColor 類別一定出現在檔案中 */}
              <div className="text-primaryColor-500 bg-primaryColor-500 border-primaryColor-500 hidden"></div>
            </div>
          );
        };
        
        // --- 獨立的列表和總結組件 ---
        const ExpenseList = memo(({ expenses, deleteExpense, startEdit, isLoading, getDisplayName, formatTimestamp, isReadOnly, clearAllExpenses, searchKeyword, setSearchKeyword }) => { // ✨ 接受搜尋相關 props
            const [previewImage, setPreviewImage] = useState(null);
            const sortedExpenses = useMemo(() => {
                // 1. Sort by timestamp
                const sorted = [...expenses].sort((a, b) => {
                    const timeA = a.timestamp ? a.timestamp.getTime() : 0;
                    const timeB = b.timestamp ? b.timestamp.getTime() : 0;
                    return timeB - timeA;
                });
                
                // 2. Filter by searchKeyword (case-insensitive on description)
                if (!searchKeyword.trim()) {
                    return sorted;
                }
                
                const lowerCaseKeyword = searchKeyword.toLowerCase();
                
                return sorted.filter(exp => 
                    (exp.description || '').toLowerCase().includes(lowerCaseKeyword)
                );
                
            }, [expenses, searchKeyword]); // ✨ 依賴 searchKeyword
              
            return (
              <div className="mt-8">
                {/* 1. 支出列表標題與清除按鈕 - 保持在同一行 */}
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                    <CircleDollarSign className="w-7 h-7 mr-3 text-primaryColor-500" /> 
                    所有支出 ({expenses.length})
                  </h2>
                  
                  {/* 清除所有資料按鈕 */}
                  <button
                      onClick={clearAllExpenses}
                      disabled={isLoading || isReadOnly || expenses.length === 0}
                      className="px-3 py-1.5 text-sm rounded-lg text-white bg-red-500 hover:bg-red-600 transition hover:scale-105 transform shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center flex-shrink-0"
                      title={isReadOnly ? "唯讀模式下無法清除資料" : "清除此紀錄簿所有支出"}
                  >
                      <Trash2 className="w-4 h-4 mr-1" />
                      清除所有資料
                  </button>
                </div>
                
                {/* ✨ NEW: 搜尋欄位 - 獨立出來，在標題下方，清單上方 */}
                <div className="mb-4">
                    <div className="relative">
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="輸入品項/描述進行搜尋..." 
                        // 讓它保持全寬
                        className="w-full border border-gray-300 rounded-full h-10 py-2 pl-10 pr-4 text-sm focus:ring-primaryColor-500 focus:border-primaryColor-500 transition-all duration-300"
                        aria-label="搜尋支出"
                      />
                      <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>
                
                {/* 顯示搜尋結果數量提示 */}
                {searchKeyword.trim() !== '' && expenses.length > sortedExpenses.length && (
                    <p className="text-sm text-gray-600 mb-4 italic p-2 bg-gray-100 rounded-lg">
                        🔍 顯示 {sortedExpenses.length} 筆符合「{searchKeyword}」的結果 (總計 {expenses.length} 筆)。
                    </p>
                )}
                
                {sortedExpenses.length === 0 ? (
                  <p className="text-gray-500 italic p-4 bg-white rounded-xl shadow-inner">
                    {searchKeyword.trim() ? `找不到任何符合「${searchKeyword}」的支出記錄。` : '目前沒有任何支出記錄。'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {sortedExpenses.map((exp) => {
                      const totalShares = Object.values(exp.shares).reduce((sum, s) => sum + s, 0);
                      const sharesDetail = Object.entries(exp.shares)
                        .filter(([, share]) => share > 0)
                        .map(([name, share]) => `${getDisplayName(name)} (${share}份)`)
                        .join(', ');

                      const displayAmount = `${exp.currency} ${Math.round(exp.originalAmount).toFixed(0)}`;
                      const convertedTWD = exp.currency !== DEFAULT_CURRENCY ? ` (TWD ${exp.amountInTWD.toFixed(0)})` : '';

                      return (
                        <div key={exp.id} className="bg-white p-4 rounded-xl shadow-lg border-l-4 border-primaryColor-400 flex gap-3 justify-between items-start transition duration-150 hover:shadow-xl">
                          {exp.imageUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewImage({ url: exp.imageUrl, title: exp.description })}
                              className="flex-shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primaryColor-500"
                              aria-label={`查看 ${exp.description} 的圖片`}
                            >
                              <img
                                src={exp.imageUrl}
                                alt={`${exp.description} 的支出圖片`}
                                className="h-20 w-20 rounded-lg object-cover border border-gray-200 shadow-sm"
                                loading="lazy"
                              />
                            </button>
                          )}
                          <div className="min-w-0 flex-grow">
                            <p className="font-semibold text-lg text-gray-800">{exp.description}</p>
                            <p className="text-3xl font-extrabold text-primaryColor-600 my-1">
                                {displayAmount}
                                <span className="text-xl font-normal text-gray-500">{convertedTWD}</span>
                            </p> 
                            <p className="text-sm text-gray-600">
                              <span className="font-medium text-primaryColor-700">付款人:</span> {getDisplayName(exp.payerName)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              <span className="font-medium">分帳:</span> {sharesDetail || '無人分帳'} (總份數: {totalShares})
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              <span className="font-medium">時間:</span> {formatTimestamp(exp.timestamp)}
                            </p>
                          </div>
                          <div className={`flex flex-shrink-0 space-x-2 ${isReadOnly ? 'opacity-50' : ''}`}>
                            <button
                              onClick={() => startEdit(exp)}
                              className="p-2 text-blue-500 bg-white hover:bg-blue-50 rounded-full transition duration-150 hover:scale-110 transform border border-transparent hover:border-blue-300 shadow-md disabled:cursor-not-allowed"
                              aria-label="編輯支出"
                              disabled={isReadOnly}
                              title={isReadOnly ? "唯讀模式下無法編輯" : "編輯支出"}
                            >
                              <Pencil className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => deleteExpense(exp)}
                              disabled={isLoading || isReadOnly}
                              className="p-2 text-red-500 bg-white hover:bg-blue-50 rounded-full transition duration-150 hover:scale-110 transform border border-transparent hover:border-red-300 shadow-md disabled:cursor-not-allowed"
                              aria-label="刪除支出"
                              title={isReadOnly ? "唯讀模式下無法刪除" : "刪除支出"}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {previewImage && (
                  <div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
                    <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setPreviewImage(null)}
                        className="absolute -top-3 -right-3 bg-white rounded-full p-2 text-gray-700 hover:text-gray-900 shadow-lg"
                        aria-label="關閉圖片預覽"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <img
                        src={previewImage.url}
                        alt={previewImage.title || '支出圖片'}
                        className="max-h-[90vh] max-w-full rounded-xl object-contain bg-white shadow-2xl"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
        });

        const BalanceSummary = memo(({ settlements, balances, members, getDisplayName, isReadOnly, settleMemberDebt }) => {
            const debtorBalances = useMemo(() => {
                return members.filter(member => Math.round(balances[member] || 0) < 0)
                               .map(member => ({
                                   id: member,
                                   amount: Math.abs(Math.round(balances[member] || 0)),
                                   displayName: getDisplayName(member),
                               }))
                               .filter(d => d.amount > 0);
            }, [balances, members, getDisplayName]);

            return (
              <div className="mt-8 p-6 bg-white rounded-xl shadow-2xl">
                <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center">
                  <Users className="w-7 h-7 mr-3 text-primaryColor-500" />
                  結餘總結 
                </h2>

                {settlements.length === 0 ? (
                    <p className="text-lg font-medium text-green-600 p-3 bg-green-50 rounded-lg">🎉 所有帳目已結清！</p>
                ) : (
                    <div className="space-y-4">
                        {settlements.map((settlement, index) => {
                            const canSettle = !isReadOnly; 

                            return (
                                <div 
                                    key={index} 
                                    className="bg-yellow-50 p-4 rounded-xl shadow-md border-l-4 border-yellow-400 flex justify-between items-center transition duration-150" 
                                >
                                    <div className="flex items-center">
                                        <span className="font-bold text-yellow-800 text-xl mr-3">💸</span>
                                        <div className="text-gray-800">
                                            <p className="text-lg">
                                                <span className="font-bold text-red-600">{getDisplayName(settlement.from)}</span>
                                                <span className="mx-0 text-gray-500">應付給</span>
                                                <span className="font-bold text-green-600">{getDisplayName(settlement.to)}</span>
                                            </p>
                                            <p className="text-3xl font-extrabold text-yellow-700 mt-1">
                                                TWD {settlement.amount.toFixed(0)}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {canSettle && (
                                        <button
                                            onClick={() => settleMemberDebt(settlement.from, settlement.amount, settlement.to)} 
                                            className="px-3 py-1 text-sm rounded-lg text-white transition hover:scale-105 transform shadow-md flex items-center bg-green-500 hover:bg-green-600"
                                            title="新增一筆結清支出記錄"
                                        >
                                            <CircleCheck className="w-4 h-4 mr-1" />
                                            結清
                                        </button>
                                    )}
                                    {isReadOnly && (
                                         <span className="text-sm text-gray-500 italic">僅成員可操作</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
              </div>
            );
        });
        


export default App;
