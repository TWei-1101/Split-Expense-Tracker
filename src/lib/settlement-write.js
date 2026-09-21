import { calculateBalances, calculateSettlements } from './settlement.js';
import { buildExpenseMemberList } from './expense-members.js';

function orderedMap(value = {}) {
  return Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
}

export function settlementSourceKey(expense) {
  return JSON.stringify([expense.payerName, expense.amountInTWD,
    orderedMap(expense.shares), orderedMap(expense.payers), orderedMap(expense.customSplits)]);
}

// The state revision serializes settlement writers across devices. Each action
// also has a durable receipt, so a transaction/network retry cannot repay twice.
// Adapters keep this protocol testable without a live Firebase project.
export async function commitSettlementOnce({ request, members, stateRef, operationRef, expenseRef,
  readState, readExpenses, transact, timestamp }) {
  if (!Number.isFinite(request.amount) || request.amount <= 0 || !Number.isInteger(request.amount)
    || !request.from || !request.to || request.from === request.to) {
    throw new Error('結清金額或付款對象無效。');
  }
  const state = await readState();
  const revision = state.exists() ? (state.data().revision || 0) : 0;
  const source = await readExpenses();
  const expenses = source.docs.map(doc => doc.data());
  const participants = buildExpenseMemberList({ groupMembers: members, expenses, isGuest: true });
  const suggestion = calculateSettlements(calculateBalances(participants, expenses))
    .find(item => item.from === request.from && item.to === request.to && item.amount === request.amount);

  return transact(async transaction => {
    const operation = await transaction.get(operationRef);
    if (operation.exists()) return { created: false };
    const currentState = await transaction.get(stateRef);
    const currentRevision = currentState.exists() ? (currentState.data().revision || 0) : 0;
    if (currentRevision !== revision || !suggestion) {
      throw new Error('帳目或結清狀態已更新，請確認最新結餘後再操作。');
    }
    // Protect against edits/deletes of expenses while the confirmation runs.
    for (const doc of source.docs) {
      const current = await transaction.get(doc.ref);
      if (!current.exists() || settlementSourceKey(current.data()) !== settlementSourceKey(doc.data())) {
        throw new Error('支出資料已變更，請確認最新結餘後再操作。');
      }
    }
    transaction.set(expenseRef, {
      ...request.expense,
      originalAmount: request.amount, amountInTWD: request.amount,
      currency: 'TWD', exchangeRate: 1, payerName: request.from,
      shares: { [request.to]: request.amount }, kind: 'settlement',
      settlementOperationId: request.operationId, timestamp: timestamp(),
    });
    transaction.set(operationRef, { expenseId: expenseRef.id, createdAt: timestamp() });
    transaction.set(stateRef, { revision: revision + 1 }, { merge: true });
    return { created: true };
  });
}
