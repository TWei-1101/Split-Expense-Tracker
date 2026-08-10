import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

export const getGroupExpensesPath = (appId, groupId) =>
  `artifacts/${appId}/groups/${groupId}/expenses`;

export const getExpensePath = (appId, groupId, expenseId) =>
  `${getGroupExpensesPath(appId, groupId)}/${expenseId}`;

export const getExpensesCollectionRef = (db, appId, groupId) =>
  collection(db, getGroupExpensesPath(appId, groupId));

export const getExpenseDocRef = (db, appId, groupId, expenseId) =>
  expenseId
    ? doc(db, getExpensePath(appId, groupId, expenseId))
    : doc(getExpensesCollectionRef(db, appId, groupId));

export const listExpenses = (db, appId, groupId) =>
  getDocs(getExpensesCollectionRef(db, appId, groupId));

export const getExpense = (db, appId, groupId, expenseId) =>
  getDoc(getExpenseDocRef(db, appId, groupId, expenseId));

export const createExpense = (db, appId, groupId, expense, expenseId) =>
  expenseId
    ? setDoc(getExpenseDocRef(db, appId, groupId, expenseId), expense)
    : addDoc(getExpensesCollectionRef(db, appId, groupId), expense);

export const updateExpense = (db, appId, groupId, expenseId, expense) =>
  updateDoc(getExpenseDocRef(db, appId, groupId, expenseId), expense);

export const deleteExpense = (db, appId, groupId, expenseId) =>
  deleteDoc(getExpenseDocRef(db, appId, groupId, expenseId));

export const mapExpenseSnapshot = (docSnap, defaultCurrency, defaultExchangeRates) => {
  const data = docSnap.data();
  const timestamp = data.timestamp ? data.timestamp.toDate() : null;
  const originalAmount = data.originalAmount !== undefined ? data.originalAmount : data.amount;
  const currency = data.currency || defaultCurrency;
  const exchangeRate = data.exchangeRate || (defaultExchangeRates[currency] || 1.0);
  const amountInTWD = data.amountInTWD !== undefined ? data.amountInTWD : originalAmount * exchangeRate;

  return {
    id: docSnap.id,
    ...data,
    originalAmount: typeof originalAmount === 'number' ? originalAmount : parseFloat(originalAmount || 0),
    currency,
    exchangeRate,
    amountInTWD: typeof amountInTWD === 'number' ? amountInTWD : parseFloat(amountInTWD || 0),
    shares: data.shares || {},
    timestamp,
  };
};
