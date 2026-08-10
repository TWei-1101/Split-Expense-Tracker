export const SELF_PAYER_KEY = '__self__';

export function calculateBalances({ members, expenses, selfPayerKey = SELF_PAYER_KEY }) {
  const balances = members.reduce((acc, name) => ({ ...acc, [name]: 0 }), {});

  expenses.forEach((expense) => {
    if (expense.payerName === selfPayerKey) return;

    const amount = expense.amountInTWD;
    const { payerName, shares } = expense;
    const totalShares = Object.values(shares).reduce((sum, share) => sum + share, 0);

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
