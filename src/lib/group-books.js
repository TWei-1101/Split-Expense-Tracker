const DEFAULT_GROUP_NAME = '分帳記帳簿';

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

  return [...booksById.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-Hant') || a.id.localeCompare(b.id)
  );
}

export function createNewGroupBook(name, userId) {
  const trimmedName = (name || '').trim();
  if (!trimmedName || !userId) return null;
  return { name: trimmedName, owner: userId, members: [userId] };
}
