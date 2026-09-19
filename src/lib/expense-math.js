function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function normalizeKana(str) {
  return (str || '').replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const SEARCH_SYNONYM_GROUPS = [
  ['唐吉', '唐吉訶德', '唐吉訶德', 'donki', 'don quijote', 'ドンキ', 'ドンキホーテ', 'ドン・キホーテ'],
  ['札幌藥妝', '札藥', 'サツドラ', 'サッポロドラッグ', 'satsudora'],
  ['鶴羽', '鶴羽藥妝', 'ツルハ', 'ツルハドラッグ', 'tsuruha'],
  ['松本清', 'マツキヨ', 'マツモトキヨシ', 'matsukiyo', 'matsumoto kiyoshi'],
  ['大創', 'daiso', 'ダイソー'],
  ['bic camera', '必酷', 'ビックカメラ'],
  ['友都八喜', 'yodobashi', 'ヨドバシ'],
  ['全家', 'familymart', 'ファミリーマート', 'ファミマ'],
  ['7-11', '7-eleven', '711', '小七', 'セブン', 'セブンイレブン'],
  ['lawson', '羅森', 'ローソン'],
  ['若元', '若元錠', 'wakamoto', 'wakamodo', 'わかもと', 'ワカモト'],
  ['寶礦力', '寶礦力水得', 'pocari', 'pocarisweat', 'ポカリスエット', 'ポカリ'],
  ['明治', 'meiji', 'メイジ'],
  ['樂天', 'lotte', 'ロッテ'],
];

function expandSearchSynonyms(keyword) {
  const k = (keyword || '').trim().toLowerCase();
  if (!k) return [];
  const results = new Set([k]);
  for (const group of SEARCH_SYNONYM_GROUPS) {
    const match = group.some(term => {
      const t = term.toLowerCase();
      return t === k || (t.length >= 2 && k.includes(t)) || (k.length >= 2 && t.includes(k));
    });
    if (match) {
      for (const term of group) {
        results.add(term.toLowerCase());
      }
    }
  }
  return Array.from(results);
}

function matchSingleTerm(target, term) {
  const k = (term || '').trim().toLowerCase();
  if (!k) return true;
  const t = (target || '').toLowerCase();
  if (!t) return false;

  if (t.includes(k)) return true;

  const normK = normalizeKana(k);
  const normT = normalizeKana(t);
  if (normT.includes(normK)) return true;

  if (k.length >= 4) {
    const tokens = t.match(/[a-z0-9]+/g) || [];
    for (const token of tokens) {
      if (token.includes(k)) return true;
      if (token.length >= k.length) {
        const sub = token.slice(0, k.length);
        if (levenshtein(sub, k) <= 1) return true;
      } else if (k.length - token.length <= 1) {
        if (levenshtein(token, k) <= 1) return true;
      }
    }
  }

  return false;
}

export function matchesSearchKeyword(target, rawKeyword) {
  const k = (rawKeyword || '').trim().toLowerCase();
  if (!k) return true;
  const t = (target || '').toLowerCase();
  if (!t) return false;

  const synonyms = expandSearchSynonyms(k);
  return synonyms.some(variant => matchSingleTerm(t, variant));
}

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
