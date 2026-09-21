export function isGroupImagePath(path, appId, groupId) {
  if (typeof path !== 'string' || path.split('/').some(part => !part || part === '.' || part === '..')) return false;
  return [`groups/${groupId}/expense_images/`, `artifacts/${appId}/groups/${groupId}/expense-images/`]
    .some(prefix => path.startsWith(prefix) && path.length > prefix.length);
}

export function createExpenseImagePath(groupId, expenseId, version) {
  return `groups/${groupId}/expense_images/${expenseId}/${version}.jpg`;
}

// Missing files mean cleanup is already complete; permission/network errors
// must propagate so callers retain the record and can retry.
export async function deleteImageIfPresent(remove, path) {
  try { await remove(path); } catch (error) {
    if (error.code !== 'storage/object-not-found') throw error;
  }
}

export async function finalizeExpenseImageWrite({ write, oldPath, newPath, remove, onCleanupError = () => {} }) {
  try {
    await write;
  } catch (error) {
    if (newPath && newPath !== oldPath) {
      try { await remove(newPath); } catch (cleanupError) { onCleanupError(cleanupError); }
    }
    throw error;
  }
  if (oldPath && oldPath !== newPath) {
    try { await remove(oldPath); } catch (error) { onCleanupError(error); }
  }
}

// Delete images before discarding their references, retaining retry information
// on failures. This operation is only for explicitly permanent deletion.
export async function deleteRecordsWithImages({ records, appId, groupId, removeImage, removeRecords }) {
  const paths = [...new Set(records.map(record => record.imagePath).filter(path => isGroupImagePath(path, appId, groupId)))];
  for (const path of paths) await removeImage(path);
  await removeRecords();
}
