const key = uid => `expense:last-group-book:${uid}`;

export function readLastGroupBook(uid, storage) {
  if (!uid) return null;
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(key(uid));
    return value && !value.includes('/') ? value : null;
  } catch { return null; }
}

export function rememberGroupBook(uid, groupId, storage) {
  if (!uid || !groupId || groupId.includes('/')) return;
  try { (storage ?? globalThis.localStorage)?.setItem(key(uid), groupId); } catch { /* Storage may be blocked. */ }
}

export function manualBookUrl(href) {
  const url = new URL(href);
  url.pathname = url.pathname.replace(/\/g\/[^/]+\/?$/, '/') || '/';
  url.searchParams.delete('shareId');
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function restoreLastGroupBook({ uid, readGroup, storage }) {
  const saved = readLastGroupBook(uid, storage);
  if (!saved || saved === uid) return uid;
  try {
    const group = await readGroup(saved);
    if (group && (group.owner === uid || group.members?.includes(uid))) return saved;
    rememberGroupBook(uid, uid, storage);
  } catch { /* A transient/offline read must not erase the saved choice. */ }
  return uid;
}
