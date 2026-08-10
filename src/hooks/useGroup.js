import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';

export function normalizeGroupSnapshot(data) {
  const owner = data?.owner || null;
  const members = Array.isArray(data?.members) ? data.members : [];
  return {
    owner,
    members: members.includes(owner) ? members : [...members, owner].filter(Boolean),
    name: data?.name || '分帳記帳簿',
  };
}

export function normalizeMemberSettings(data) {
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    defaultShares: data?.defaultShares || {},
  };
}

export default function useGroup({
  appId,
  authReady,
  db,
  currentCollectionId,
  defaultCurrency,
  defaultExchangeRates,
  mapExpenseSnapshot,
  onGroupName,
  onError,
  userId,
}) {
  const [groupOwner, setGroupOwner] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupName, setGroupName] = useState('分帳記帳簿');
  const [userProfiles, setUserProfiles] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [customMembers, setCustomMembers] = useState([]);
  const [defaultSharesConfig, setDefaultSharesConfig] = useState({});

  useEffect(() => {
    if (!db || !currentCollectionId) return undefined;
    return onSnapshot(
      doc(db, `artifacts/${appId}/groups/${currentCollectionId}`),
      (snapshot) => {
        if (!snapshot.exists) {
          setGroupOwner(null);
          setGroupMembers([]);
          setGroupName('分帳記帳簿');
          onGroupName('分帳記帳簿');
          return;
        }
        const group = normalizeGroupSnapshot(snapshot.data());
        setGroupOwner(group.owner);
        setGroupMembers(group.members);
        setGroupName(group.name);
        onGroupName(group.name);
      },
      (error) => {
        console.error('Error listening group doc:', error);
        setGroupOwner(null);
        setGroupMembers([]);
      },
    );
  }, [appId, currentCollectionId, db, onGroupName]);

  useEffect(() => {
    if (!authReady || !db) return undefined;
    return onSnapshot(collection(db, `artifacts/${appId}/public_profiles`), (snapshot) => {
      const profiles = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const uid = data.uid || docSnap.id;
        const displayName = data.displayName || data.email;
        if (uid && displayName) profiles[uid] = displayName;
      });
      setUserProfiles(profiles);
    }, (error) => console.error('Error listening to user profiles:', error));
  }, [appId, authReady, db]);

  useEffect(() => {
    if (!authReady || !db || !currentCollectionId || !userId) return undefined;
    const expensesRef = collection(db, `artifacts/${appId}/groups/${currentCollectionId}/expenses`);
    const membersRef = doc(db, `artifacts/${appId}/groups/${currentCollectionId}/settings/members`);
    const unsubscribeExpenses = onSnapshot(expensesRef, (snapshot) => {
      setExpenses(snapshot.docs.map((docSnap) => mapExpenseSnapshot(docSnap, defaultCurrency, defaultExchangeRates)));
    }, (error) => {
      console.error(`Error listening to expenses in collection ${currentCollectionId}:`, error);
      onError(error.code === 'permission-denied'
        ? `權限不足：無法讀取此分享連結對應的紀錄簿（ID: ${currentCollectionId}）。請洽擁有者確認權限。`
        : `資料同步失敗: ${error.message}`);
      setExpenses([]);
    });
    const unsubscribeMembers = onSnapshot(membersRef, (snapshot) => {
      const settings = normalizeMemberSettings(snapshot.exists ? snapshot.data() : null);
      setCustomMembers(settings.list);
      setDefaultSharesConfig(settings.defaultShares);
    }, (error) => console.error('Error listening to members settings:', error));
    return () => {
      unsubscribeExpenses();
      unsubscribeMembers();
    };
  }, [appId, authReady, currentCollectionId, db, defaultCurrency, defaultExchangeRates, mapExpenseSnapshot, onError, userId]);

  return {
    customMembers, defaultSharesConfig, expenses, groupMembers, groupName, groupOwner,
    setCustomMembers, setDefaultSharesConfig, setExpenses, setGroupName, userProfiles,
  };
}
