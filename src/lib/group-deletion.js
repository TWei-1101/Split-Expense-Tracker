export function canDeleteGroupBook({ userId, groupOwner, isGuest }) {
  return Boolean(userId && !isGuest && groupOwner && userId === groupOwner);
}

export function createGroupDeletionPlan({ appId, groupId, expenses = [] }) {
  const groupPath = `artifacts/${appId}/groups/${groupId}`;
  const imagePrefix = `${groupPath}/expense-images/`;
  const safeImagePaths = [];
  const unmanagedImagePaths = [];

  expenses.forEach((expense) => {
    const imagePath = expense?.imagePath;
    if (!imagePath) return;
    if (imagePath.startsWith(imagePrefix)) safeImagePaths.push(imagePath);
    else unmanagedImagePaths.push(imagePath);
  });

  return {
    groupPath,
    expensesPath: `${groupPath}/expenses`,
    membersPath: `${groupPath}/settings/members`,
    safeImagePaths: [...new Set(safeImagePaths)],
    unmanagedImagePaths: [...new Set(unmanagedImagePaths)],
  };
}

export function createGroupDeletionConfirmationSteps(groupName) {
  const name = (groupName || '這本帳本').trim();
  return [
    {
      title: '刪除帳本（第 1/2 步）',
      message: `「${name}」的所有支出、成員設定與帳本資料都會永久刪除。請確認要繼續。`,
    },
    {
      title: '最後確認（第 2/2 步）',
      message: `確定永久刪除「${name}」嗎？此操作無法復原。`,
    },
  ];
}

// Firestore data removal is the irreversible foreground operation. Storage cleanup
// may be slow, so it deliberately runs after the UI has moved to a safe next book.
export async function deleteGroupBookDataThenCleanup({
  deleteFirestoreData,
  chooseNextBook,
  applyUiTransition,
  deleteImages,
  onBackgroundCleanupStart = () => {},
  onBackgroundCleanupDone = () => {},
  onBackgroundCleanupError = () => {},
}) {
  const deletionResult = await deleteFirestoreData();
  const nextBook = await chooseNextBook();
  applyUiTransition(nextBook);

  const imagePaths = deletionResult.safeImagePaths || [];
  if (imagePaths.length) {
    onBackgroundCleanupStart(imagePaths);
    Promise.resolve()
      .then(() => deleteImages(imagePaths))
      .then(onBackgroundCleanupDone)
      .catch(onBackgroundCleanupError);
  }

  return { ...deletionResult, nextBook };
}
