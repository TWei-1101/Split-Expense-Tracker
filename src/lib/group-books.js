const DEFAULT_GROUP_NAME = '分帳記帳簿';

function sortBooks(books) {
  return [...books].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-Hant') || a.id.localeCompare(b.id)
  );
}

function toBook(id, data, userId) {
  const owner = data?.owner || null;
  const members = Array.isArray(data?.members) ? data.members : [];
  if (owner !== userId && !members.includes(userId)) return null;

  return {
    id,
    name: (data?.name || '').trim() || DEFAULT_GROUP_NAME,
    role: owner === userId ? 'owner' : 'member',
  };
}

export function buildGroupBookList({ userId, owned = [], invited = [] }) {
  const booksById = new Map();
  [...owned, ...invited].forEach(({ id, data }) => {
    const book = toBook(id, data, userId);
    if (book) booksById.set(id, book);
  });

  return sortBooks([...booksById.values()]);
}

export function renameGroupBookInList(books, id, name) {
  const trimmedName = (name || '').trim() || DEFAULT_GROUP_NAME;
  return sortBooks(books.map((book) =>
    book.id === id ? { ...book, name: trimmedName } : book
  ));
}

// A group document listener can deliver a cached, older snapshot after a local
// rename. Keep the optimistic name until Firestore acknowledges that exact name.
export function mergeGroupBookSnapshot({
  books,
  userId,
  id,
  data,
  pendingName = null,
  acknowledgePending = true,
}) {
  const snapshotBook = toBook(id, data, userId);
  if (!snapshotBook) {
    return { books: books.filter((book) => book.id !== id), pendingName: null };
  }

  const shouldKeepOptimisticName = pendingName && (
    snapshotBook.name !== pendingName || !acknowledgePending
  );
  const mergedBook = shouldKeepOptimisticName
    ? { ...snapshotBook, name: pendingName }
    : snapshotBook;
  const replaced = books.some((book) => book.id === id)
    ? books.map((book) => book.id === id ? mergedBook : book)
    : [...books, mergedBook];

  return {
    books: sortBooks(replaced),
    pendingName: shouldKeepOptimisticName ? pendingName : null,
  };
}

export function createNewGroupBook(name, userId) {
  const trimmedName = (name || '').trim();
  if (!trimmedName || !userId) return null;
  return { name: trimmedName, owner: userId, members: [userId] };
}

// A user's default book is stored under their UID.  That identity is available
// immediately after Auth resolves, while the group document snapshot can arrive
// later (or be unavailable offline).
export function isViewingOwnGroupBook({ userId, currentCollectionId, groupOwner, isGuest }) {
  if (isGuest || !userId) return false;
  return currentCollectionId === userId || groupOwner === userId;
}
