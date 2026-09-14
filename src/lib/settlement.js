// 分帳/結算核心邏輯：從 App.real.jsx 抽出，純函數可 unit test。
//
// DEFAULT_SELF_PAYER_KEY 預設為 '__self__'，對齊 App.real.jsx 第 84 行的
// SELF_PAYER_KEY。呼叫端若要自訂，可傳 { selfPayerKey: '...' } 覆寫。
export const DEFAULT_SELF_PAYER_KEY = '__self__';

// 計算每位成員的結餘（正數=被欠、負數=欠人）
// 規則：
//   1. payerName === selfPayerKey（各自付款）的 expense 跳過，不進結算
//   2. totalShares === 0 的 expense 跳過（防 NaN）
//   3. 付款端：若有 payers 共同付款且出資總和 > 0，依各成員出資比例計入付款；否則由 payerName 100% 支付
//   4. 分攤端：每位參與者扣除 costPerShare * shareCount
export function calculateBalances(members, expenses, { selfPayerKey = DEFAULT_SELF_PAYER_KEY } = {}) {
  const balances = members.reduce((acc, name) => ({ ...acc, [name]: 0 }), {});

  expenses.forEach(expense => {
    if (expense.payerName === selfPayerKey) return;

    const amount = expense.amountInTWD;
    const { payerName, shares, payers, customSplits } = expense;

    const hasCustomSplits = customSplits && typeof customSplits === 'object' && Object.keys(customSplits).length > 0;
    const totalShares = Object.values(shares || {}).reduce((sum, s) => sum + s, 0);

    // 若既無 customSplits 且 totalShares === 0，跳過（防 NaN）
    if (!hasCustomSplits) {
      if (totalShares === 0) return;
    }

    // 付款端：若有 payers（多人共同付款/代墊），依比例計入已付金額
    if (payers && typeof payers === 'object' && Object.keys(payers).length > 0) {
      const totalOriginalPaid = Object.values(payers).reduce((sum, v) => sum + (Number(v) || 0), 0);
      if (totalOriginalPaid > 0) {
        Object.entries(payers).forEach(([pMember, pAmount]) => {
          const ratio = (Number(pAmount) || 0) / totalOriginalPaid;
          const pAmountTWD = amount * ratio;
          if (balances[pMember] !== undefined) {
            balances[pMember] += pAmountTWD;
          }
        });
      } else if (balances[payerName] !== undefined) {
        balances[payerName] += amount;
      }
    } else if (balances[payerName] !== undefined) {
      balances[payerName] += amount;
    }

    // 分攤端：若有 customSplits（自訂/依品項分配金額），依比例扣除各成員應負擔金額
    if (hasCustomSplits) {
      const totalCustom = Object.values(customSplits).reduce((sum, v) => sum + (Number(v) || 0), 0);
      if (totalCustom > 0) {
        Object.entries(customSplits).forEach(([member, memberAmt]) => {
          const ratio = (Number(memberAmt) || 0) / totalCustom;
          const memberCost = amount * ratio;
          if (balances[member] !== undefined) {
            balances[member] -= memberCost;
          }
        });
        return;
      }
    }

    const costPerShare = amount / totalShares;

    Object.entries(shares || {}).forEach(([member, shareCount]) => {
      const memberCost = costPerShare * shareCount;
      if (balances[member] !== undefined) {
        balances[member] -= memberCost;
      }
    });
  });

  return balances;
}

// 從結餘生成建議結清清單（greedy debtor→creditor 配對）
// 規則：
//   1. balance >= 1 為 creditor，<= -1 為 debtor
//   2. Math.min 配對、Math.round 取整
//   3. 配對後 balance < 1 視為結清，移到下一位
export function calculateSettlements(balances) {
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
}
