import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  signInAnonymously,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  limit,
  writeBatch,
  runTransaction,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { detectTelegramMode } from './lib/tg-mode.js';
import { pendingTaxRefundTotalInTWD } from './features/tax-refunds/taxRefund.js';
import { calculateBalances, SELF_PAYER_KEY } from './domain/calculateBalances.js';
import { calculateSettlements } from './domain/calculateSettlements.js';
import BalanceSummary from './features/settlements/BalanceSummary.jsx';
import ConfirmationModal from './features/common/ConfirmationModal.jsx';
import ExpenseModal from './features/expenses/ExpenseModal.jsx';
import ExpenseList from './features/expenses/ExpenseList.jsx';
import MemberManagementModal from './features/members/MemberManagementModal.jsx';
import AuthModal from './features/auth/AuthModal.jsx';
import useExchangeRates from './hooks/useExchangeRates.js';
import useAuth from './hooks/useAuth.js';
import useGroup from './hooks/useGroup.js';
import GroupNameEditor from './features/groups/GroupNameEditor.jsx';
import {
  deleteExpense as deleteExpenseRecord,
  createExpense,
  getGroupExpensesPath,
  listExpenses,
  mapExpenseSnapshot,
} from './services/expenseRepository.js';
import { appId, getFirebaseApp, getFirebaseServices, getStorageModule } from './services/firebase.js';
// 注意：icon 元件（CircleDollarSign / Trash2 / Plus / ...）由下方 CDN 程式碼內聯 SVG 定義，
// 避免 lucide-react 跟內聯 SVG 撞名。

// --- Firebase 設定（從 CDN 版 hardcode，沿用同一份，避免 query 跑到 default-app-id）---

        
        
        // 注意：GEMINI_API_KEY 已在頂層的純 JS 區塊中定義，可以直接訪問
        // serverTimestamp 已在外層 import / alias 過，這裡不重複宣告
        
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
        // ✨ NEW: 錢包圖標 (Wallet) — 給每人花費區塊用
        const Wallet = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>;
        // ✨ NEW: 皇冠圖標 (Crown) — 給最高花費者用
        const Crown = (props) => <svg {...props} {...IconProps} viewBox="0 0 24 24"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>;
        // --- 圖標元件結束 ---

        /**
         * 創建或更新 Firestore 公共 Profile
         */
        const createOrUpdatePublicProfile = async (db, uid, displayName, email) => {
            if (!db || !uid || !displayName) return;
            const profileDocPath = `artifacts/${appId}/public_profiles/${uid}`;
            try {
                await setDoc(doc(db, profileDocPath), {
                    displayName: displayName,
                    email: email,
                    uid: uid,
                }, { merge: true });
            } catch (e) {
                console.error("Error creating/updating public profile:", e);
            }
        };
        
        /**
         * 主要的 App 元件
         */
        const App = () => {
          // --- 應用程式狀態 ---
          const [userId, setUserId] = useState(null);
          const [isGuest, setIsGuest] = useState(false); // NEW: 追蹤是否為匿名訪客
          const [isAuthModalOpen, setIsAuthModalOpen] = useState(false); // NEW: 控制 AuthModal 顯示
		  const {
			lastExchangeUpdate,
			liveExchangeRates,
			converterSourceCurrency,
			setConverterSourceCurrency,
			converterTargetCurrency,
			setConverterTargetCurrency,
			converterAmount,
			setConverterAmount,
			convertedAmount,
		  } = useExchangeRates();
		  const [defaultCurrency, setDefaultCurrency] = useState(DEFAULT_CURRENCY);
		  const [detectedCountry, setDetectedCountry] = useState(null);
		  const [copyMessage, setCopyMessage] = useState('');
          
          const [currentCollectionId, setCurrentCollectionId] = useState(null); // 目前正在檢視的 groupId
		  const [currentCollectionShortCode, setCurrentCollectionShortCode] = useState(null); // 分享用短代碼

		  const [inviteEmail, setInviteEmail] = useState(''); // 用來輸入要邀請的 email
		  const [isEditingGroupName, setIsEditingGroupName] = useState(false); 
		  const [groupNameInput, setGroupNameInput] = useState('分帳記帳簿'); // 編輯時使用
          
          // ✨ NEW: 搜尋關鍵字狀態
          const [searchKeyword, setSearchKeyword] = useState('');

          const [members, setMembers] = useState([]); 
          
		  const ensureDefaultGroup = useCallback(async (_db, uid) => {
		    if (!_db || !uid) return null;

		    const groupId = uid; // 先用 uid 當 groupId
		    const groupRef = doc(_db, `artifacts/${appId}/groups/${groupId}`);
		    const snap = await getDoc(groupRef);

		    if (!snap.exists) {
			  await setDoc(groupRef, {
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
          const { auth, authReady, db } = useAuth({
            getFirebaseServices,
            onUser: async (user, { auth: _auth, db: _db }) => {
              const usersCollectionPath = `artifacts/${appId}/users`;
              const usersRef = collection(_db, usersCollectionPath);
                try {
                  if (user) {
                    // Persistent user (email/password) or a converted anonymous user
                    const isAnon = user.isAnonymous; // NEW: 檢查是否為匿名用戶
                    setUserId(user.uid);
                    setIsGuest(isAnon); // NEW: 設定訪客狀態

                    // 1. 先幫登入者自己建立 / 補上短代碼
                    let myShortCode = null;
                    try {
                      const myDocRef = doc(usersRef, user.uid);
                      const mySnap = await getDoc(myDocRef);
                      if (mySnap.exists) {
                        const data = mySnap.data() || {};
                        myShortCode = data.shortCode || null;
                      }
                      
                      // NEW: 只有非匿名用戶才生成短代碼
                      if (!myShortCode && !isAnon) { 
                        myShortCode = generateShortCode();
                        await setDoc(
                          myDocRef,
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
                        const q = query(usersRef, where('shortCode', '==', shortCodeFromPath), limit(1));
                        const snap = await getDocs(q);
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
                    // (TG Mini App 內跟瀏覽器一樣匿名看、登入用 email/password)
                    const anonUserCredential = await signInAnonymously(_auth);
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
                            const q = query(usersRef, where('shortCode', '==', shortCodeFromPath), limit(1));
                            const snap = await getDocs(q);
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
                }
            },
            onInitializationError: (e) => {
              console.error('Firebase initialization/auth error:', e);
              setUserId(null);
              setIsGuest(false);
              setError(`認證失敗，應用程式無法運作: ${e.message}`);
            },
          });

          const {
            customMembers,
            defaultSharesConfig,
            expenses,
            groupMembers,
            groupName,
            groupOwner,
            setCustomMembers,
            setDefaultSharesConfig,
            setExpenses,
            setGroupName,
            userProfiles,
          } = useGroup({
            appId,
            authReady,
            currentCollectionId,
            db,
            defaultCurrency: DEFAULT_CURRENCY,
            defaultExchangeRates: DEFAULT_EXCHANGE_RATES,
            mapExpenseSnapshot,
            onError: setError,
            onGroupName: setGroupNameInput,
            userId,
          });

		  // MODIFIED: 訪客模式 (isGuest) 或不在群組成員清單中都視為唯讀
		  const isReadOnly = isGuest || !groupMembers.includes(userId);

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

			const groupRef = doc(db, `artifacts/${appId}/groups/${currentCollectionId}`);
			await setDoc(
			  groupRef,
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
				  await signOut(auth);
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
				if (exp?.payerName && exp.payerName !== SELF_PAYER_KEY && !currentMembers.includes(exp.payerName)) {
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

          const getPayerLabel = useCallback((payerName) => {
            return payerName === SELF_PAYER_KEY ? '各自付款' : getDisplayName(payerName);
          }, [getDisplayName]);

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
                    await deleteExpenseRecord(db, appId, currentCollectionId, expenseId);
                    if (expense?.imagePath) {
                        try {
                            const { getStorage, storageRef, deleteObject } = await getStorageModule();
                            await deleteObject(storageRef(getStorage(getFirebaseApp()), expense.imagePath));
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
                      const snapshot = await listExpenses(db, appId, currentCollectionId);

                      const batch = writeBatch(db);
                      const imagePaths = [];
                      snapshot.docs.forEach(docSnap => {
                          const data = docSnap.data() || {};
                          if (data.imagePath) imagePaths.push(data.imagePath);
                          batch.delete(docSnap.ref);
                      });
                      await batch.commit();
                      if (imagePaths.length > 0) {
                          const { getStorage, storageRef, deleteObject } = await getStorageModule();
                          const storage = getStorage(getFirebaseApp());
                          await Promise.allSettled(
                              imagePaths.map(path => deleteObject(storageRef(storage, path)))
                          );
                      }
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
                const membersDocRef = doc(db, docPath);

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

                await setDoc(membersDocRef, { list: sanitizedList, defaultShares: currentShares }, { merge: false });
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
				  const profilesRef = collection(db, `artifacts/${appId}/public_profiles`);
				  const q = query(profilesRef, where('email', '==', emailToInvite), limit(1));
				  const snap = await getDocs(q);

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
				  const groupRef = doc(db, `artifacts/${appId}/groups/${currentCollectionId}`);
				  await updateDoc(groupRef, {
					members: arrayUnion(invitedUid),
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
					const groupRef = doc(db, `artifacts/${appId}/groups/${currentCollectionId}`);
					await updateDoc(groupRef, {
					  members: arrayRemove(memberUid),
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
                const membersDocRef = doc(db, docPath);

                const sharesToSave = {};
                members.forEach(name => {
                    const share = tempShares[name]; 
                    if (share !== undefined && share >= 0) {
                        if (share !== 1) { 
                            sharesToSave[name] = share;
                        }
                    }
                });
                
                await setDoc(membersDocRef, { list: customMembers, defaultShares: sharesToSave }, { merge: false });
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
				const groupRef = doc(db, `artifacts/${appId}/groups/${currentCollectionId}`);
				const groupSnap = await getDoc(groupRef);
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
				  const membersDocRef = doc(db, membersDocPath);

				  await runTransaction(db, async (transaction) => {
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
				  const expensesCollectionPath = getGroupExpensesPath(appId, currentCollectionId);
				  const expensesSnapshot = await getDocs(collection(db, expensesCollectionPath));

				  let batch = writeBatch(db);
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
						batch = writeBatch(db);
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
                      // 使用新欄位格式：originalAmount / currency / amountInTWD
                      await createExpense(db, appId, currentCollectionId, {
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
          const balances = useMemo(
            () => calculateBalances({ members, expenses }),
            [expenses, members],
          );

          // 退稅只追蹤付款人待收款項，不參與 calculateBalances / calculateSettlements。
          const pendingTaxRefundInTWD = useMemo(
            () => pendingTaxRefundTotalInTWD(expenses),
            [expenses],
          );

          const settlements = useMemo(() => calculateSettlements(balances), [balances]);

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
				  const usersRef = collection(db, usersCollectionPath);
				  const myDocRef = doc(usersRef, userId);
				  const mySnap = await getDoc(myDocRef);

				  let myShortCode = null;

				  if (mySnap.exists) {
					const data = mySnap.data() || {};
					myShortCode = data.shortCode || null;
				  }

				  // 如果還沒有 shortCode，就幫自己產生一個
				  if (!myShortCode) {
					myShortCode = generateShortCode();
					await setDoc(
					  myDocRef,
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

						<GroupNameEditor
						  isEditing={isEditingGroupName}
						  isReadOnly={isReadOnly}
						  groupName={groupName}
						  groupNameInput={groupNameInput}
						  isLoading={isLoading}
						  onGroupNameInputChange={setGroupNameInput}
						  onSave={saveGroupName}
						  onCancel={cancelEditGroupName}
						  onStartEdit={startEditGroupName}
						/>
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
                    settlements={settlements}
                    getDisplayName={getDisplayName} 
                    isReadOnly={isReadOnly}
                    settleMemberDebt={settleMemberDebt}
                    pendingTaxRefundInTWD={pendingTaxRefundInTWD}
                    UsersIcon={Users}
                    CircleCheckIcon={CircleCheck}
                />
                <ExpenseList 
                    expenses={expenses} 
                    deleteExpense={deleteExpense} 
                    startEdit={startEdit} 
                    isLoading={isLoading} 
                    getDisplayName={getDisplayName} 
                    getPayerLabel={getPayerLabel}
                    formatTimestamp={formatTimestamp}
                    isReadOnly={isReadOnly}
                    clearAllExpenses={clearAllExpenses}
                    // ✨ 新增搜尋相關 props
                    searchKeyword={searchKeyword}
                    setSearchKeyword={setSearchKeyword}
                    defaultCurrency={DEFAULT_CURRENCY}
                    icons={{ CircleDollarSign, Trash2, Pencil, Search, Wallet, Crown, X }}
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
                    fallbackExchangeRates={DEFAULT_EXCHANGE_RATES}
                    currencies={CURRENCIES}
                    lastExpenseCurrencyKey={LAST_EXPENSE_CURRENCY_KEY}
                    selfPayerKey={SELF_PAYER_KEY}
                    getStorageModule={getStorageModule}
                    getFirebaseApp={getFirebaseApp}
                    appId={appId}
                    icons={{ Plus, Minus, CircleCheck }}
                />
                <MemberManagementModal 
                    currentUserId={userId}
                    members={members}
                    customMembers={customMembers}
                    defaultSharesConfig={defaultSharesConfig}
                    isMemberModalOpen={isMemberModalOpen}
                    setIsMemberModalOpen={setIsMemberModalOpen}
                    saveMembers={saveMembers}
                    handleSaveDefaultShares={handleSaveDefaultShares}
                    handleDeleteMember={handleDeleteMember}
                    isLoading={isLoading}
                    getDisplayName={getDisplayName}
                    isReadOnly={isReadOnly}
					inviteEmail={inviteEmail}
					setInviteEmail={setInviteEmail}
					groupMembers={groupMembers}
					groupOwner={groupOwner}
					inviteUserByEmail={inviteUserByEmail}
					removeGroupMember={removeGroupMember}
                    migrateMemberID={migrateMemberID}
                    icons={{ X, Users, Minus, Plus, UserMinus, CircleCheck }}
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
                       setToastMessage={setToastMessage} 
                       isOpen={isAuthModalOpen} 
                       onClose={() => setIsAuthModalOpen(false)} 
                       onAuthenticated={async (authenticatedUser, displayName, email) => {
                         if (db) {
                           await createOrUpdatePublicProfile(db, authenticatedUser.uid, displayName, email);
                         }
                       }}
                       closeIcon={<X className="w-6 h-6" />}
                     />
                 )}

              </div>

              {/* Tailwind color class fix, 讓 primaryColor 類別一定出現在檔案中 */}
              <div className="text-primaryColor-500 bg-primaryColor-500 border-primaryColor-500 hidden"></div>
            </div>
          );
        };
        
        // --- 獨立的列表和總結組件 ---

export default App;
