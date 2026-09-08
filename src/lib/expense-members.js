function isSyntheticCollectionId(memberId, { collectionId, ownerId, currentUserId }) {
  return memberId === collectionId
    && collectionId !== ownerId
    && collectionId !== currentUserId;
}

export function buildExpenseMemberList({
  groupMembers = [],
  customMembers = [],
  expenses = [],
  ownerId = '',
  currentUserId = '',
  collectionId = '',
  isGuest = false,
} = {}) {
  const members = [];
  const addMember = (value) => {
    const memberId = typeof value === 'string' ? value.trim() : '';
    if (!memberId
      || isSyntheticCollectionId(memberId, { collectionId, ownerId, currentUserId })
      || members.includes(memberId)) return;
    members.push(memberId);
  };

  // A legacy group can lack a members list, so preserve the owner/current user
  // fallback. Do not use collectionId: it identifies a book, not a person.
  if (!isGuest) addMember(ownerId || currentUserId);
  groupMembers.forEach(addMember);
  customMembers.forEach(addMember);

  // Retain real historical participants so older expenses can still settle.
  expenses.forEach((expense) => {
    if (expense?.payerName && expense.payerName !== '__self__') addMember(expense.payerName);
    Object.keys(expense?.shares || {}).forEach(addMember);
  });

  return members;
}
