import React, { memo, useMemo, useState } from 'react';
import { SELF_PAYER_KEY } from '../../domain/calculateBalances.js';

const ExpenseList = memo(({
  expenses, deleteExpense, startEdit, isLoading, getDisplayName, getPayerLabel,
  formatTimestamp, isReadOnly, clearAllExpenses, searchKeyword, setSearchKeyword,
  defaultCurrency, icons,
}) => {
  const { CircleDollarSign, Trash2, Pencil, Search, Wallet, Crown, X } = icons;
  const [previewImage, setPreviewImage] = useState(null);
  const [showTwdExpenseIds, setShowTwdExpenseIds] = useState(() => new Set());
  const [filterPayer, setFilterPayer] = useState(null);
  const toggleAmountDisplay = (expenseId) => setShowTwdExpenseIds((previous) => {
    const next = new Set(previous);
    if (next.has(expenseId)) next.delete(expenseId); else next.add(expenseId);
    return next;
  });
  const togglePayerFilter = (displayName) => setFilterPayer((previous) => (
    previous === displayName ? null : displayName
  ));
  const sortedExpenses = useMemo(() => {
    const sorted = [...expenses].sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.getTime() : 0;
      const timeB = b.timestamp ? b.timestamp.getTime() : 0;
      return timeB - timeA;
    });
    const keyword = searchKeyword.trim().toLowerCase();
    const keywordFiltered = keyword
      ? sorted.filter((expense) => (expense.description || '').toLowerCase().includes(keyword))
      : sorted;
    if (!filterPayer) return keywordFiltered;
    if (filterPayer === SELF_PAYER_KEY) {
      return keywordFiltered.filter((expense) => expense.payerName === SELF_PAYER_KEY);
    }
    return keywordFiltered.filter((expense) => {
      if (getPayerLabel(expense.payerName) === filterPayer) return true;
      if (expense.payerName === SELF_PAYER_KEY) {
        return Object.entries(expense.shares || {}).some(([userId, share]) => (
          (share || 0) > 0 && getPayerLabel(userId) === filterPayer
        ));
      }
      return false;
    });
  }, [expenses, searchKeyword, filterPayer, getPayerLabel]);
  const memberSpending = useMemo(() => {
    const totals = {};
    for (const expense of expenses) {
      const shares = expense.shares || {};
      const totalShares = Object.values(shares).reduce((sum, share) => sum + share, 0);
      const amountTwd = expense.amountInTWD || 0;
      if (totalShares <= 0 || amountTwd <= 0) continue;
      for (const [userId, share] of Object.entries(shares)) {
        if (share > 0) totals[userId] = (totals[userId] || 0) + amountTwd * (share / totalShares);
      }
    }
    return Object.entries(totals)
      .map(([userId, amount]) => ({ userId, amount, displayName: getDisplayName(userId) }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, getDisplayName]);
  const topSpenderId = memberSpending.length > 1 ? memberSpending[0]?.userId : null;
  const totalSpending = memberSpending.reduce((sum, member) => sum + member.amount, 0);
  const selfPaidSummary = useMemo(() => expenses.reduce((summary, expense) => {
    if (expense.payerName === SELF_PAYER_KEY) {
      summary.count += 1;
      summary.amount += expense.amountInTWD || 0;
    }
    return summary;
  }, { count: 0, amount: 0 }), [expenses]);
  const searchSummary = useMemo(() => {
    if (!searchKeyword.trim() || sortedExpenses.length === 0) return null;
    const sharesByMember = new Map();
    const dates = new Set();
    for (const expense of sortedExpenses) {
      for (const [userId, share] of Object.entries(expense.shares || {})) {
        if (share > 0 && !sharesByMember.has(userId)) sharesByMember.set(userId, share);
      }
      const timestamp = expense.timestamp;
      const date = timestamp instanceof Date ? timestamp : (timestamp && typeof timestamp.toDate === 'function' ? timestamp.toDate() : null);
      if (date) dates.add(date.toISOString().slice(0, 10));
    }
    const groupShares = [...sharesByMember.values()].reduce((sum, share) => sum + share, 0);
    const total = sortedExpenses.reduce((sum, expense) => sum + (expense.amountInTWD || 0), 0);
    const perShare = groupShares > 0 ? total / groupShares : 0;
    const isAccommodation = /住宿/.test(searchKeyword);
    let dayCount = dates.size;
    if (isAccommodation) {
      const days = new Set();
      const expression = /(\d{1,2})\/(\d{1,2})(?:\s*[-至~]\s*(\d{1,2})\/(\d{1,2}))?/g;
      for (const expense of sortedExpenses) {
        expression.lastIndex = 0;
        let match;
        while ((match = expression.exec(expense.description || '')) !== null) {
          const startMonth = Number.parseInt(match[1], 10);
          const startDay = Number.parseInt(match[2], 10);
          if (match[3] && match[4] && startMonth === Number.parseInt(match[3], 10) && Number.parseInt(match[4], 10) >= startDay) {
            for (let day = startDay; day <= Number.parseInt(match[4], 10); day += 1) days.add(`${startMonth}/${day}`);
          } else {
            days.add(`${startMonth}/${startDay}`);
            if (match[3] && match[4]) days.add(`${match[3]}/${match[4]}`);
          }
        }
      }
      dayCount = days.size > 0 ? days.size : sortedExpenses.length;
    }
    return { total, groupShares, perShare, isAccommodation, perDay: groupShares > 0 && dayCount > 0 ? perShare / dayCount : null };
  }, [searchKeyword, sortedExpenses]);
  return <div className="mt-8">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-bold text-gray-800 flex items-center flex-wrap"><CircleDollarSign className="w-7 h-7 mr-3 text-primaryColor-500" />所有支出 ({sortedExpenses.length}{filterPayer || searchKeyword ? ` / ${expenses.length}` : ''})</h2>
      <button onClick={clearAllExpenses} disabled={isLoading || isReadOnly || expenses.length === 0} className="px-3 py-1.5 text-sm rounded-lg text-white bg-red-500 hover:bg-red-600 transition hover:scale-105 transform shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center flex-shrink-0" title={isReadOnly ? '唯讀模式下無法清除資料' : '清除此紀錄簿所有支出'}><Trash2 className="w-4 h-4 mr-1" />清除所有資料</button>
    </div>
    <div className="mb-4"><div className="relative"><input type="text" value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="輸入品項/描述進行搜尋..." className="w-full border border-gray-300 rounded-full h-10 py-2 pl-10 pr-4 text-sm focus:ring-primaryColor-500 focus:border-primaryColor-500 transition-all duration-300" aria-label="搜尋支出" /><Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" /></div></div>
    {searchKeyword.trim() !== '' && expenses.length > sortedExpenses.length && <p className="text-sm text-gray-600 mb-4 italic p-2 bg-gray-100 rounded-lg">🔍 顯示 {sortedExpenses.length} 筆符合「{searchKeyword}」的結果 (總計 {expenses.length} 筆)。</p>}
    {searchSummary && <div className="mb-4 p-3 sm:p-4 bg-gradient-to-r from-primaryColor-50 via-white to-white border border-primaryColor-200 rounded-xl shadow-sm"><div className="flex items-center mb-2"><Search className="w-4 h-4 mr-1.5 text-primaryColor-600" /><h3 className="text-sm font-semibold text-gray-700">搜尋「{searchKeyword}」結果摘要</h3></div><div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 pl-1"><p className="text-sm text-gray-700">總計 <span className="text-xl font-bold text-primaryColor-700 ml-1">TWD {searchSummary.total.toFixed(0)}</span></p>{searchSummary.groupShares > 0 ? <><p className="text-sm text-gray-700">・每人 <span className="text-lg font-bold text-primaryColor-600 ml-1">TWD {searchSummary.perShare.toFixed(0)}</span></p>{searchSummary.isAccommodation && searchSummary.perDay !== null && <p className="text-sm text-gray-700">・每晚平均 <span className="text-lg font-bold text-primaryColor-600 ml-1">TWD {searchSummary.perDay.toFixed(0)}</span></p>}</> : <p className="text-xs text-gray-500">・搜尋結果內無有效份額</p>}</div></div>}
    {(memberSpending.length > 0 || selfPaidSummary.count > 0) && <div className="mb-5 p-4 sm:p-5 bg-gradient-to-br from-white via-white to-primaryColor-50/60 rounded-2xl border border-gray-100 shadow-sm"><div className="flex items-center justify-between mb-3 flex-wrap gap-y-1"><h3 className="text-sm font-semibold text-gray-700 flex items-center"><Wallet className="w-4 h-4 mr-1.5 text-primaryColor-600" />每人花費金額</h3><span className="text-xs text-gray-400">統計範圍：全部 {expenses.length} 筆 · 合計 TWD {totalSpending.toFixed(0)}</span></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {memberSpending.map((member) => { const isTop = member.userId === topSpenderId; const isActive = filterPayer === member.displayName; const name = (member.displayName || '').trim(); const initial = name ? name.charAt(name.length - 1).toUpperCase() : '?'; return <div key={member.userId} role="button" tabIndex={0} onClick={() => togglePayerFilter(member.displayName)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePayerFilter(member.displayName); } }} aria-pressed={isActive} title={isActive ? `取消「${member.displayName}」篩選` : `只顯示付款人為「${member.displayName}」的支出`} className={`relative flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-primaryColor-100 to-white border-2 border-primaryColor-500 shadow-md ring-2 ring-primaryColor-300' : isTop ? 'bg-gradient-to-r from-primaryColor-50 to-white border-2 border-primaryColor-400 shadow-sm hover:shadow-md' : 'bg-gray-50 border border-gray-100 hover:bg-gray-100 hover:border-gray-200'}`}><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-sm ${isActive || isTop ? 'bg-primaryColor-600' : 'bg-gray-400'}`}>{initial}</div><div className="ml-3 min-w-0 flex-1"><p className={`text-sm font-medium truncate flex items-center ${isActive || isTop ? 'text-primaryColor-800' : 'text-gray-700'}`}><span className="truncate">{member.displayName}</span>{isTop && <Crown className="w-3.5 h-3.5 ml-1 text-amber-500 flex-shrink-0" />}</p><p className={`text-lg font-bold leading-tight ${isActive || isTop ? 'text-primaryColor-700' : 'text-gray-800'}`}>TWD {member.amount.toFixed(0)}</p></div>{isActive && <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primaryColor-600 text-white font-medium">篩選中</span>}</div>; })}
      {selfPaidSummary.count > 0 && (() => { const isActive = filterPayer === SELF_PAYER_KEY; return <div role="button" tabIndex={0} onClick={() => togglePayerFilter(SELF_PAYER_KEY)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePayerFilter(SELF_PAYER_KEY); } }} aria-pressed={isActive} title={isActive ? '取消「各自付款」篩選' : '只顯示各自付款的支出'} className={`relative flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-gray-100 to-white border-2 border-gray-500 shadow-md ring-2 ring-gray-300' : 'bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300'}`}><div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-sm bg-gray-500">各自</div><div className="ml-3 min-w-0 flex-1"><p className="text-sm font-medium text-gray-700">各自付款</p><p className="text-lg font-bold leading-tight text-gray-800">TWD {selfPaidSummary.amount.toFixed(0)}</p><p className="text-xs text-gray-500">{selfPaidSummary.count} 筆 · 不計入結算</p></div>{isActive && <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-600 text-white font-medium">篩選中</span>}</div>; })()}
    </div></div>}
    {sortedExpenses.length === 0 ? <p className="text-gray-500 italic p-4 bg-white rounded-xl shadow-inner">{filterPayer && searchKeyword.trim() ? `找不到任何付款人為「${filterPayer}」且符合「${searchKeyword}」的支出記錄。` : filterPayer ? `「${filterPayer}」目前沒有任何支出記錄。` : searchKeyword.trim() ? `找不到任何符合「${searchKeyword}」的支出記錄。` : '目前沒有任何支出記錄。'}</p> : <div className="space-y-4">{sortedExpenses.map((expense) => {
      const totalShares = Object.values(expense.shares).reduce((sum, share) => sum + share, 0);
      const sharesDetail = Object.entries(expense.shares).filter(([, share]) => share > 0).map(([name, share]) => `${getDisplayName(name)} (${share}份)`).join(', ');
      const imageSource = expense.imageUrl || expense.imageDataUrl || '';
      const isTwd = expense.currency === defaultCurrency; const isShowingTwd = showTwdExpenseIds.has(expense.id); const canToggle = !isTwd;
      const displayAmount = isShowingTwd ? `${defaultCurrency} ${expense.amountInTWD.toFixed(0)}` : `${expense.currency} ${Math.round(expense.originalAmount).toFixed(0)}`;
      return <div key={expense.id} className="bg-white p-4 rounded-xl shadow-lg border-l-4 border-primaryColor-400 transition duration-150 hover:shadow-xl"><div className="flex gap-3 justify-between items-start"><div className="min-w-0 flex-grow"><p className="font-semibold text-lg text-gray-800">{expense.description}</p><p className={`text-3xl font-extrabold text-primaryColor-600 my-1 ${canToggle ? 'cursor-pointer select-none hover:underline' : ''}`} onClick={canToggle ? () => toggleAmountDisplay(expense.id) : undefined} role={canToggle ? 'button' : undefined} tabIndex={canToggle ? 0 : undefined} onKeyDown={canToggle ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleAmountDisplay(expense.id); } } : undefined} title={canToggle ? (isShowingTwd ? '點擊換回原幣' : '點擊切換為台幣') : undefined} aria-label={canToggle ? (isShowingTwd ? `切換回 ${expense.currency} 顯示` : '切換為台幣顯示') : undefined}>{displayAmount}</p><p className="text-sm text-gray-600"><span className="font-medium text-primaryColor-700">付款人:</span> {getPayerLabel(expense.payerName)}{expense.payerName === SELF_PAYER_KEY && <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">不計入結算</span>}</p>{expense.taxRefund?.eligible && <p className="mt-1 text-xs text-primaryColor-700"><span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${expense.taxRefund.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-primaryColor-50 text-primaryColor-700'}`}>{expense.taxRefund.status === 'received' ? '退稅已收到' : '待收退稅'}</span><span className="ml-2">{expense.currency} {(Number(expense.taxRefund.estimatedAmount) || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}</span></p>}<p className="text-xs text-gray-500 mt-1"><span className="font-medium">分帳:</span> {sharesDetail || '無人分帳'} (總份數: {totalShares})</p><p className="text-xs text-gray-400 mt-1"><span className="font-medium">時間:</span> {formatTimestamp(expense.timestamp)}</p></div><div className={`flex flex-col items-end space-y-2 flex-shrink-0 ${isReadOnly ? 'opacity-50' : ''}`}><div className="flex space-x-2"><button onClick={() => startEdit(expense)} className="p-2 text-blue-500 bg-white hover:bg-blue-50 rounded-full transition duration-150 hover:scale-110 transform border border-transparent hover:border-blue-300 shadow-md disabled:cursor-not-allowed" aria-label="編輯支出" disabled={isReadOnly} title={isReadOnly ? '唯讀模式下無法編輯' : '編輯支出'}><Pencil className="w-5 h-5" /></button><button onClick={() => deleteExpense(expense)} disabled={isLoading || isReadOnly} className="p-2 text-red-500 bg-white hover:bg-blue-50 rounded-full transition duration-150 hover:scale-110 transform border border-transparent hover:border-red-300 shadow-md disabled:cursor-not-allowed" aria-label="刪除支出" title={isReadOnly ? '唯讀模式下無法刪除' : '刪除支出'}><Trash2 className="w-5 h-5" /></button></div>{imageSource && <button type="button" onClick={() => setPreviewImage({ url: imageSource, title: expense.description })} className="rounded-lg focus:outline-none focus:ring-2 focus:ring-primaryColor-500" aria-label={`查看 ${expense.description} 的圖片`}><img src={imageSource} alt={`${expense.description} 的支出圖片`} className="h-20 w-20 rounded-lg object-cover border border-gray-200 shadow-sm" loading="lazy" /></button>}</div></div></div>;
    })}</div>}
    {previewImage && <div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}><div className="relative max-w-4xl max-h-[90vh]" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setPreviewImage(null)} className="absolute -top-3 -right-3 bg-white rounded-full p-2 text-gray-700 hover:text-gray-900 shadow-lg" aria-label="關閉圖片預覽"><X className="w-5 h-5" /></button><img src={previewImage.url} alt={previewImage.title || '支出圖片'} className="max-h-[90vh] max-w-full rounded-xl object-contain bg-white shadow-2xl" /></div></div>}
  </div>;
});

export default ExpenseList;
