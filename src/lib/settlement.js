// 分帳/結算核心邏輯：從 App.real.jsx 抽出，純函數可 unit test。
//
// DEFAULT_SELF_PAYER_KEY 預設為 '__self__'，對齊 App.real.jsx 第 84 行的
// SELF_PAYER_KEY。呼叫端若要自訂，可傳 { selfPayerKey: '...' } 覆寫。
export const DEFAULT_SELF_PAYER_KEY = '__self__';

// 計算每位成員的結餘（正數=被欠、負數=欠人）
// 規則：
//   1. payerName === selfPayerKey（各自付款）的 expense 跳過，不進結算
//   2. totalShares === 0 的 expense 跳過（防 NaN）
//   3. 付款人 += amount；每位參與者 -= costPerShare * shareCount
export function calculateBalances(members, expenses, { selfPayerKey = DEFAULT_SELF_PAYER_KEY } = {}) {
  const balances = members.reduce((acc, name) => ({ ...acc, [name]: 0 }), {});

  expenses.forEach(expense => {
    if (expense.payerName === selfPayerKey) return;

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
