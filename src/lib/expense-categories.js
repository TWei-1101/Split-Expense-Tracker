export const EXPENSE_CATEGORIES = Object.freeze({
  FOOD: 'food',
  TRANSPORT: 'transport',
  LODGING: 'lodging',
  OTHER: 'other',
});

export const EXPENSE_CATEGORY_OPTIONS = Object.freeze([
  { value: EXPENSE_CATEGORIES.FOOD, label: '餐飲' },
  { value: EXPENSE_CATEGORIES.TRANSPORT, label: '交通' },
  { value: EXPENSE_CATEGORIES.LODGING, label: '住宿' },
  { value: EXPENSE_CATEGORIES.OTHER, label: '其他' },
]);

const CATEGORY_KEYWORDS = Object.freeze({
  [EXPENSE_CATEGORIES.FOOD]: [
    '餐', '飯', '早餐', '午餐', '晚餐', '宵夜', '咖啡', '飲料', '拉麵', '壽司', '燒肉', '便當', '甜點', '麵包',
    'food', 'restaurant', 'cafe', 'coffee', 'breakfast', 'lunch', 'dinner', 'ramen', 'sushi', 'meal',
    'レストラン', 'カフェ', 'コーヒー', '朝食', '昼食', '夕食', 'ラーメン', '寿司', '食事',
  ],
  [EXPENSE_CATEGORIES.TRANSPORT]: [
    '交通', '車票', '計程車', '捷運', '地鐵', '公車', '巴士', '火車', '高鐵', '機票', '租車', '停車', '加油', 'jr', '地鐵',
    'taxi', 'uber', 'train', 'bus', 'metro', 'subway', 'flight', 'airline', 'airport', 'express', 'rental car', 'parking', 'fuel',
    '電車', '地下鉄', '新幹線', 'バス', 'タクシー', '飛行機', '空港', 'レンタカー', '駐車',
  ],
  [EXPENSE_CATEGORIES.LODGING]: [
    '住宿', '飯店', '旅館', '酒店', '民宿', '旅店', 'hotel', 'hostel', 'lodging', 'accommodation', 'airbnb',
    'ホテル', '旅館', '宿泊',
  ],
});

export function normalizeExpenseCategory(category) {
  return EXPENSE_CATEGORY_OPTIONS.some(option => option.value === category)
    ? category
    : EXPENSE_CATEGORIES.OTHER;
}

export function toggleExpenseCategoryFilter(activeCategory, category) {
  const nextCategory = normalizeExpenseCategory(category);
  return activeCategory === nextCategory ? null : nextCategory;
}

export function filterExpensesByCategory(expenses = [], category = null) {
  if (!category) return expenses;
  const selectedCategory = normalizeExpenseCategory(category);
  return expenses.filter(expense => normalizeExpenseCategory(expense?.category) === selectedCategory);
}

export function inferExpenseCategory(description) {
  const normalizedDescription = String(description || '').trim().toLocaleLowerCase();
  if (!normalizedDescription) return EXPENSE_CATEGORIES.OTHER;

  for (const category of [EXPENSE_CATEGORIES.LODGING, EXPENSE_CATEGORIES.TRANSPORT, EXPENSE_CATEGORIES.FOOD]) {
    if (CATEGORY_KEYWORDS[category].some(keyword => normalizedDescription.includes(keyword))) {
      return category;
    }
  }
  return EXPENSE_CATEGORIES.OTHER;
}

export function resolveExpenseCategory({ description, category, categoryWasManuallySelected = false } = {}) {
  return categoryWasManuallySelected
    ? normalizeExpenseCategory(category)
    : inferExpenseCategory(description);
}

function emptyCategoryTotals() {
  return {
    [EXPENSE_CATEGORIES.FOOD]: 0,
    [EXPENSE_CATEGORIES.TRANSPORT]: 0,
    [EXPENSE_CATEGORIES.LODGING]: 0,
    [EXPENSE_CATEGORIES.OTHER]: 0,
    total: 0,
  };
}

function storedAmountInTWD(expense) {
  const storedAmount = Number(expense?.amountInTWD);
  if (Number.isFinite(storedAmount)) return storedAmount;

  const originalAmount = Number(expense?.originalAmount);
  const exchangeRate = Number(expense?.exchangeRate);
  return Number.isFinite(originalAmount) && Number.isFinite(exchangeRate)
    ? originalAmount * exchangeRate
    : 0;
}

export function calculateMemberCategorySpending({ members = [], expenses = [] } = {}) {
  const totals = Object.fromEntries(members.map(member => [member, emptyCategoryTotals()]));

  expenses.forEach(expense => {
    const shares = expense?.shares || {};
    const totalShares = Object.values(shares).reduce((sum, share) => sum + (Number(share) || 0), 0);
    const amountInTWD = storedAmountInTWD(expense);
    if (totalShares <= 0 || amountInTWD <= 0) return;

    const category = normalizeExpenseCategory(expense?.category);
    Object.entries(shares).forEach(([member, rawShare]) => {
      if (!totals[member]) return;
      const share = Number(rawShare) || 0;
      if (share <= 0) return;
      const allocatedAmount = amountInTWD * share / totalShares;
      totals[member][category] += allocatedAmount;
      totals[member].total += allocatedAmount;
    });
  });

  return totals;
}
