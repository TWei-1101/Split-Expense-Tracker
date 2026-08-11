export const RECYCLE_BIN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function deletedAtToMillis(deletedAt) {
  if (typeof deletedAt === 'number') return deletedAt;
  if (deletedAt instanceof Date) return deletedAt.getTime();
  if (deletedAt && typeof deletedAt.toMillis === 'function') return deletedAt.toMillis();
  return 0;
}

export function createRecycleBinRecord({ expense, deletedAt }) {
  return { id: expense.id, deletedAt, expense: { ...expense } };
}

export function isRecycleBinRecordExpired(record, now = Date.now()) {
  if (!record?.deletedAt) return false;
  return now - deletedAtToMillis(record?.deletedAt) >= RECYCLE_BIN_RETENTION_MS;
}

export function buildExpiredRecycleBinCleanupPlan({ records = [], now = Date.now(), batchSize = 400 } = {}) {
  const expired = records.filter(record => isRecycleBinRecordExpired(record, now));
  const batches = [];
  for (let index = 0; index < expired.length; index += batchSize) batches.push(expired.slice(index, index + batchSize));
  return {
    batches,
    imagePaths: expired.map(record => record.expense?.imagePath).filter(Boolean),
  };
}
