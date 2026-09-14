export function isSettlement(expense) {
  return expense.kind === 'settlement' || /^\[結清\]/.test(expense.description || '');
}

export function resolveExpenseConversion(draft, saved, latestRate) {
  const sameCurrency = saved && draft.currency === saved.currency;
  const rate = sameCurrency && Number(saved.exchangeRate) > 0 ? Number(saved.exchangeRate) : latestRate;
  const amount = sameCurrency && Number(draft.originalAmount) === Number(saved.originalAmount)
    && Number.isFinite(saved.amountInTWD) ? saved.amountInTWD : (Number(draft.originalAmount) || 0) * rate;
  return { rate, amount };
}

export function validatePayers(payers, members, total) {
  const clean = Object.fromEntries(members.map(id => [id, Number(payers[id]) || 0]).filter(([,value]) => value > 0));
  const sum = Object.values(clean).reduce((a,b) => a+b, 0);
  if (!Object.keys(clean).length || !Number.isFinite(sum) || Math.abs(sum - Number(total)) > 0.005) {
    throw new Error('共同付款金額總和與總金額不符，請確認金額！');
  }
  return clean;
}

export function getSearchSpendingSummary(expenses) {
  const participants = new Set();
  let total = 0;
  for (const expense of expenses) {
    if (isSettlement(expense)) continue;
    total += Number(expense.amountInTWD) || 0;
    for (const [id, value] of Object.entries(expense.customSplits || expense.shares || {})) {
      if (Number(value) > 0) participants.add(id);
    }
  }
  return { total, count: participants.size, average: participants.size ? total / participants.size : 0 };
}

export function computeItemSplits(items, assignments, payerId, members, total) {
  const weights = Object.fromEntries(members.map(id => [id, 0]));
  for (const [index, item] of (items || []).entries()) {
    const amount = Math.max(0, Number(item.amount) || 0);
    const assignment = assignments?.[index];
    const targets = assignment === 'all' ? members
      : [members.includes(assignment) ? assignment : (members.includes(payerId) ? payerId : members[0])].filter(Boolean);
    for (const id of targets) weights[id] += amount / targets.length;
  }
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const cents = Math.round((Number(total) || 0) * 100);
  if (sum <= 0) {
    const target = members.includes(payerId) ? payerId : members[0];
    if (target) weights[target] = cents / 100;
    return weights;
  }
  // Allocate the final bill proportionally, distributing rounding cents once.
  const rows = Object.entries(weights).map(([id, weight]) => {
    const exact = cents * weight / sum;
    return { id, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = cents - rows.reduce((a, row) => a + row.cents, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining-- > 0) row.cents++;
  }
  return Object.fromEntries(rows.map(row => [row.id, row.cents / 100]));
}

export function migrateExpenseIdentity(expense, oldId, newId) {
  const updates = {};
  if (expense.payerName === oldId) updates.payerName = newId;
  for (const field of ['shares', 'payers', 'customSplits']) {
    if (expense[field]?.[oldId] !== undefined) {
      const values = { ...expense[field] };
      values[newId] = (Number(values[newId]) || 0) + (Number(values[oldId]) || 0);
      delete values[oldId];
      updates[field] = values;
    }
  }
  if (Object.values(expense.itemAssignments || {}).includes(oldId)) {
    updates.itemAssignments = Object.fromEntries(Object.entries(expense.itemAssignments)
      .map(([index, id]) => [index, id === oldId ? newId : id]));
  }
  return updates;
}
