export function getOfflineSyncStatus({ isOnline, hasPendingWrites }) {
  if (!isOnline) return { kind: 'offline', label: '離線：新增支出會在連線後同步' };
  if (hasPendingWrites) return { kind: 'syncing', label: '正在同步離線新增的支出…' };
  return { kind: 'synced', label: '已同步' };
}
