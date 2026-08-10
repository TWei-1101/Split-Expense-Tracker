export function normalizeLuggageList(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || '').trim();
    const nameKey = name.toLocaleLowerCase();
    if (!id || !name || seen.has(id) || seen.has(`name:${nameKey}`)) return [];
    seen.add(id); seen.add(`name:${nameKey}`);
    return [{ id, name, ownerId: String(item?.ownerId || '').trim() }];
  });
}

export function createLuggageItem({ name, ownerId = '', existing = [], id = 'luggage-new' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('請輸入行李箱名稱');
  const duplicate = normalizeLuggageList(existing).some((item) => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
  if (duplicate) throw new Error('已有相同名稱的行李箱');
  return { id, name: cleanName, ownerId: String(ownerId || '').trim() };
}

export function getLuggageId(taxRefund) {
  return taxRefund?.eligible ? String(taxRefund.luggageId || '').trim() : '';
}

export function buildLuggageDeletionPlan({ luggageId, expenses = [], batchSize = 400 }) {
  const affected = expenses.filter((expense) => getLuggageId(expense.taxRefund) === luggageId);
  const batches = [];
  for (let index = 0; index < affected.length; index += batchSize) batches.push(affected.slice(index, index + batchSize));
  return { affected, affectedCount: affected.length, batches };
}

export function groupTaxRefundExpensesByLuggage({ expenses = [], luggage = [] }) {
  const normalized = normalizeLuggageList(luggage);
  const byId = new Map(normalized.map((item) => [item.id, { ...item, expenses: [] }]));
  const unassigned = [];
  expenses.filter((expense) => expense?.taxRefund?.eligible).forEach((expense) => {
    const bucket = byId.get(getLuggageId(expense.taxRefund));
    if (bucket) bucket.expenses.push(expense); else unassigned.push(expense);
  });
  return { byLuggage: [...byId.values()], unassigned };
}
