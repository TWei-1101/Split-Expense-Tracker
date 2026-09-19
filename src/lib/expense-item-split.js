// Split in currency minor units, assigning the rounding remainder once.
export function splitItemAmounts(amount, parts, currency = 'TWD') {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency })
    .resolvedOptions().maximumFractionDigits;
  const scale = 10 ** digits;
  const units = Math.round(Number(amount) * scale);
  const base = Math.floor(units / parts);
  const remainder = units - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < remainder ? 1 : 0)) / scale);
}

// Rebuild items and assignments together so shifted indices stay aligned.
export function splitExpenseItems(items, assignments, currency, index = null, partsCount = 2) {
  const nextItems = [];
  const nextAssignments = {};
  items.forEach((item, oldIndex) => {
    const requested = index === null ? Number(item.quantity) : oldIndex === index ? Number(partsCount) : 1;
    const parts = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1;
    const pieces = parts > 1
      ? splitItemAmounts(item.amount, parts, currency).map((amount, i) => ({
        ...item,
        name: `${(item.name || '').replace(/\s*\(\d+\/\d+\)$/, '')} (${i + 1}/${parts})`,
        amount,
        quantity: 1,
      })) : [item];
    for (const piece of pieces) {
      if (assignments[oldIndex] !== undefined) nextAssignments[nextItems.length] = assignments[oldIndex];
      nextItems.push(piece);
    }
  });
  return { items: nextItems, assignments: nextAssignments };
}
