import React, { memo, useEffect, useMemo, useState } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { createTaxRefund, getTaxRefundProfileByCountry, TAX_REFUND_PROFILES } from '../../lib/tax-refund.js';
import { createExpense, getExpenseDocRef, updateExpense } from '../../services/expenseRepository.js';

        const ExpenseModal = memo(({ db, currentUserId, members, getInitialShares, state, onClose, getDisplayName, isReadOnly, collectionId, liveExchangeRates, defaultCurrency, currentUserLabel, fallbackExchangeRates, currencies, lastExpenseCurrencyKey, selfPayerKey, getStorageModule, getFirebaseApp, appId, icons }) => {
            const [newExpense, setNewExpense] = useState({
                description: '',
                originalAmount: '',
                currency: defaultCurrency,
                payerName: currentUserId || '',
                shares: {},
                imageUrl: '',
                imagePath: '',
                imageName: '',
                imageDataUrl: '',
                taxRefund: { eligible: false, status: 'pending' },
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

            const currentExchangeRate = liveExchangeRates[newExpense.currency] || fallbackExchangeRates[newExpense.currency] || 1.0;
            const amountInTWD = useMemo(() => {
                const amount = parseFloat(newExpense.originalAmount) || 0;
                return amount * currentExchangeRate;
            }, [newExpense.originalAmount, currentExchangeRate]);

            // ✨ NEW: 選單不列 TWD（因為是預設幣），TWD 改用左邊的 TW 按鈕切換
            const nonTwdCurrencies = currencies.filter(c => c !== defaultCurrency);
            // 當 currency 是 TWD 時，下拉選單顯示「最後一次選的外幣」作為參考
            const lastForeignCurrency = localStorage.getItem(lastExpenseCurrencyKey) || nonTwdCurrencies[0] || 'JPY';


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
                            currency: expenseToEdit.currency || defaultCurrency,
                            payerName: expenseToEdit.payerName,
                            shares: initialShares,
                            imageUrl: expenseToEdit.imageUrl || '',
                            imagePath: expenseToEdit.imagePath || '',
                            imageName: expenseToEdit.imageName || '',
                            imageDataUrl: expenseToEdit.imageDataUrl || '',
                            taxRefund: expenseToEdit.taxRefund || { eligible: false, status: 'pending' },
                        });
                        setImagePreviewUrl(expenseToEdit.imageUrl || expenseToEdit.imageDataUrl || '');
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
                    } catch {
							// getDisplayName 出錯就忽略
						  }
						}
					  }

					  if (!defaultPayerId) {
						defaultPayerId = currentUserId || members[0] || '';
					  }

                      // ✨ NEW: 幣別記憶讀取邏輯
                      const savedCurrency = localStorage.getItem(lastExpenseCurrencyKey);
                      const initialCurrency = savedCurrency || defaultCurrency || defaultCurrency;

					  setNewExpense({
						description: '',
						originalAmount: '',
						currency: initialCurrency, // ✨ 改用記憶或預設幣別
						payerName: defaultPayerId,
						shares: getInitialShares(),
                        imageUrl: '',
                        imagePath: '',
                        imageName: '',
                        imageDataUrl: '',
                        taxRefund: { eligible: false, status: 'pending' },
					  });
                      setImagePreviewUrl('');
					}

                    setImageFile(null);
                    setRemoveExistingImage(false);
                    setModalError(null);
                    setUploadStatus('');
                }
            }, [state.isOpen, isEditing, expenseToEdit, members, currentUserId, getInitialShares, currentUserLabel, getDisplayName, defaultCurrency, lastExpenseCurrencyKey]);

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
                    taxRefund: prev.taxRefund?.eligible
                      ? { ...createTaxRefund({ currency: selectedCurrency, originalAmount: prev.originalAmount, exchangeRate: liveExchangeRates[selectedCurrency] || fallbackExchangeRates[selectedCurrency] || 1 }), status: prev.taxRefund.status }
                      : prev.taxRefund,
                 }));
                 // ✨ NEW: 幣別記憶儲存邏輯
                 localStorage.setItem(lastExpenseCurrencyKey, selectedCurrency);
            };

            const taxRefundPreview = newExpense.taxRefund?.eligible
              ? createTaxRefund({
                  currency: newExpense.currency,
                  originalAmount: newExpense.originalAmount,
                  exchangeRate: currentExchangeRate,
                  country: newExpense.taxRefund.country,
                  status: newExpense.taxRefund.status,
                })
              : null;

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

            const compressImage = (file) => new Promise((resolve, reject) => {
                const imageUrl = URL.createObjectURL(file);
                const image = new Image();
                image.onload = () => {
                    const targets = [
                        { maxSide: 1600, quality: 0.82 },
                        { maxSide: 1200, quality: 0.76 },
                        { maxSide: 1000, quality: 0.72 },
                        { maxSide: 800, quality: 0.70 },
                    ];

                    const renderTarget = (targetIndex) => {
                      try {
                        const { maxSide, quality } = targets[targetIndex];
                        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                        const width = Math.max(1, Math.round(image.width * scale));
                        const height = Math.max(1, Math.round(image.height * scale));
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(image, 0, 0, width, height);

                        canvas.toBlob((blob) => {
                            if (!blob) {
                                URL.revokeObjectURL(imageUrl);
                                reject(new Error('圖片壓縮失敗，請換一張圖片。'));
                                return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                                const dataUrl = reader.result;
                                if (typeof dataUrl === 'string' && dataUrl.length <= 850000) {
                                    URL.revokeObjectURL(imageUrl);
                                    resolve({ dataUrl, blob, width, height });
                                    return;
                                }
                                if (targetIndex < targets.length - 1) {
                                    renderTarget(targetIndex + 1);
                                    return;
                                }
                                URL.revokeObjectURL(imageUrl);
                                reject(new Error('圖片壓縮後仍太大，請裁切或換一張圖片。'));
                            };
                            reader.onerror = () => {
                                URL.revokeObjectURL(imageUrl);
                                reject(new Error('圖片轉換失敗，請換一張圖片。'));
                            };
                            reader.readAsDataURL(blob);
                        }, 'image/jpeg', quality);
                      } catch (err) {
                        URL.revokeObjectURL(imageUrl);
                        reject(err);
                      }
                    };

                    renderTarget(0);
                };
                image.onerror = () => {
                    URL.revokeObjectURL(imageUrl);
                    reject(new Error('圖片讀取失敗，請換一張圖片。'));
                };
                image.src = imageUrl;
            });

            const clearSelectedImage = () => {
                if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(imagePreviewUrl);
                }
                setImageFile(null);
                setImagePreviewUrl('');
                setRemoveExistingImage(Boolean(newExpense.imageUrl || newExpense.imageDataUrl));
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

                if (!newExpense.description.trim() || newExpense.originalAmount <= 0 || (newExpense.payerName !== selfPayerKey && !newExpense.payerName)) {
                    setModalError('請輸入有效的品項、金額和付款人！');
                    return;
                }

                setIsLoadingModal(true);
                setModalError(null);
                try {
                    const docRef = getExpenseDocRef(db, appId, collectionId, isEditing ? expenseToEdit.id : undefined);

                    let imageFields = {
                        imageUrl: newExpense.imageUrl || '',
                        imagePath: newExpense.imagePath || '',
                        imageName: newExpense.imageName || '',
                        imageDataUrl: newExpense.imageDataUrl || '',
                    };

                    if (removeExistingImage && (newExpense.imagePath || newExpense.imageUrl || newExpense.imageDataUrl)) {
                        if (newExpense.imagePath) {
                            try {
                                const { getStorage, storageRef, deleteObject } = await getStorageModule();
                                await deleteObject(storageRef(getStorage(getFirebaseApp()), newExpense.imagePath));
                            } catch (imageDeleteError) {
                                console.warn('Delete old expense image failed:', imageDeleteError);
                            }
                        }
                        imageFields = { imageUrl: '', imagePath: '', imageName: '', imageDataUrl: '' };
                    }

                    if (imageFile) {
                        if (newExpense.imagePath) {
                            try {
                                const { getStorage, storageRef, deleteObject } = await getStorageModule();
                                await deleteObject(storageRef(getStorage(getFirebaseApp()), newExpense.imagePath));
                            } catch (imageDeleteError) {
                                console.warn('Delete replaced expense image failed:', imageDeleteError);
                            }
                        }
                        setUploadStatus('正在壓縮圖片...');
                        const { blob } = await compressImage(imageFile);
                        setUploadStatus('正在上傳圖片到 Firebase Storage...');
                        // ✨ 改用 Firebase Storage 儲存圖片，路徑：groups/{groupId}/expense_images/{expenseId}.jpg
                        const imagePath = `groups/${collectionId}/expense_images/${docRef.id}.jpg`;
                        const { getStorage, storageRef, uploadBytes, getDownloadURL } = await getStorageModule();
                        const sRef = storageRef(getStorage(getFirebaseApp()), imagePath);
                        const uploadResult = await uploadBytes(sRef, blob, { contentType: 'image/jpeg' });
                        const imageUrl = await getDownloadURL(uploadResult.ref);
                        imageFields = {
                            imageUrl,
                            imagePath,
                            imageName: imageFile.name,
                            imageDataUrl: '',
                        };
                        setUploadStatus('');
                    }

                    const expenseToSave = {
                        description: newExpense.description,
                        originalAmount: newExpense.originalAmount,
                        currency: newExpense.currency,
                        exchangeRate: currentExchangeRate,
                        amountInTWD: amountInTWD,
                        taxRefund: taxRefundPreview || { eligible: false, status: 'pending' },
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
                        await updateExpense(db, appId, collectionId, expenseToEdit.id, expenseToSave);
                    } else {
                        await createExpense(db, appId, collectionId, expenseToSave, docRef.id);
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
                          {/* ✨ NEW: TW toggle button - 在幣值下拉左邊，按下去這筆變 TWD，再按一次切回最後選的外幣 */}
                          <button
                            type="button"
                            onClick={() => {
                              setNewExpense(prev => ({
                                ...prev,
                                currency: prev.currency === defaultCurrency ? lastForeignCurrency : defaultCurrency
                              }));
                              // 注意：兩種情況都不寫 localStorage — 切換 TWD 跟切回外幣都不影響下次預設
                            }}
                            className={`flex-shrink-0 px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                              newExpense.currency === defaultCurrency
                                ? 'bg-primaryColor-600 text-white border-primaryColor-600 shadow-sm'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                            disabled={isReadOnly}
                            title="點擊切換 TWD ↔ 最後選的幣值（不影響下次預設）"
                          >
                            TW
                          </button>
                          <select
                              id="currency"
                              name="currency"
                              value={newExpense.currency === defaultCurrency ? lastForeignCurrency : newExpense.currency}
                              onChange={handleCurrencyChange}
                              className="block flex-shrink-0 w-auto border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500 bg-white disabled:bg-gray-100"
                              disabled={isReadOnly}
                          >
                            {nonTwdCurrencies.map(code => (
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
                        {newExpense.originalAmount > 0 && newExpense.currency !== defaultCurrency && (
                           <p className="mt-1 text-xs text-gray-500 italic">
                               換算台幣 (TWD) 約:
                               <span className="font-semibold text-primaryColor-600 ml-1">TWD {amountInTWD.toFixed(2)}</span>
                               (匯率: {currentExchangeRate})
                           </p>
                        )}
                        {newExpense.originalAmount > 0 && newExpense.currency === defaultCurrency && (
                           <p className="mt-1 text-xs text-gray-500 italic">
                               分帳計算使用此金額 (TWD)
                           </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(newExpense.taxRefund?.eligible)}
                          onChange={(e) => setNewExpense((prev) => ({
                            ...prev,
                            taxRefund: e.target.checked
                              ? createTaxRefund({ currency: prev.currency, originalAmount: prev.originalAmount, exchangeRate: currentExchangeRate })
                              : { eligible: false, status: 'pending' },
                          }))}
                          className="h-4 w-4 rounded border-gray-300 text-primaryColor-600 focus:ring-primaryColor-500"
                          disabled={isReadOnly}
                        />
                        <span className="font-medium text-gray-700">此筆可退稅</span>
                      </label>
                      {taxRefundPreview && (
                        <div className="mt-3 space-y-3 rounded-lg bg-primaryColor-50 p-3">
                          <div>
                            <label htmlFor="tax-refund-country" className="block text-sm font-medium text-gray-700">退稅國家／地區</label>
                            <select
                              id="tax-refund-country"
                              value={newExpense.taxRefund.country || ''}
                              onChange={(e) => {
                                const profile = getTaxRefundProfileByCountry(e.target.value);
                                setNewExpense((prev) => ({
                                  ...prev,
                                  taxRefund: createTaxRefund({ currency: prev.currency, originalAmount: prev.originalAmount, exchangeRate: currentExchangeRate, country: profile?.country, status: prev.taxRefund.status }),
                                }));
                              }}
                              className="mt-1 block w-full border border-gray-300 rounded-lg bg-white p-2 text-sm"
                              disabled={isReadOnly}
                            >
                              <option value="">請選擇國家／地區</option>
                              {TAX_REFUND_PROFILES.map((profile) => <option key={profile.country} value={profile.country}>{profile.label}（{Math.round(profile.rate * 100)}%）</option>)}
                            </select>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-700">預估退稅金額</p>
                              <p className="mt-1 rounded-lg bg-white p-2 font-semibold text-primaryColor-700">{newExpense.currency} {taxRefundPreview.estimatedAmount.toLocaleString()}</p>
                            </div>
                            <div>
                              <label htmlFor="tax-refund-status" className="block text-sm font-medium text-gray-700">退稅狀態</label>
                              <select
                                id="tax-refund-status"
                                value={newExpense.taxRefund.status || 'pending'}
                                onChange={(e) => setNewExpense((prev) => ({ ...prev, taxRefund: { ...prev.taxRefund, status: e.target.value } }))}
                                className="mt-1 block w-full border border-gray-300 rounded-lg bg-white p-2 text-sm"
                                disabled={isReadOnly}
                              >
                                <option value="pending">待收退稅</option>
                                <option value="received">已收到</option>
                              </select>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">退款歸付款人，不影響分帳或結算。</p>
                        </div>
                      )}
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
                        <option value={selfPayerKey}>各自付款</option>
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
                                  {React.createElement(icons.Minus, { className: 'w-5 h-5' })}
                                </button>
                                <span className="w-8 text-center font-bold text-lg text-gray-800">{currentShares}</span>
                                <button
                                  onClick={() => handleShareChange(member, 1)}
                                  type="button"
                                  className="p-1.5 bg-green-50 text-green-600 rounded-lg transition hover:scale-105 transform hover:bg-green-100 shadow-sm border border-green-200 disabled:opacity-50 disabled:hover:scale-100"
                                  aria-label="增加份數"
                                  disabled={isReadOnly}
                                >
                                  {React.createElement(icons.Plus, { className: 'w-5 h-5' })}
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
                            {React.createElement(icons.CircleCheck, { className: 'w-5 h-5 mr-2' })}
							{submitText}
						  </>
						)}
					  </button>
					</div>
                </div>
              </div>
            );
        });

export default ExpenseModal;
