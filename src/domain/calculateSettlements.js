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

  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const transferAmount = Math.round(Math.min(debtor.amount, creditor.amount));

    if (transferAmount > 0) {
      settlements.push({ from: debtor.name, to: creditor.name, amount: transferAmount });
    }

    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;

    if (debtor.amount < 1) debtorIndex++;
    if (creditor.amount < 1) creditorIndex++;
  }

  return settlements;
}
