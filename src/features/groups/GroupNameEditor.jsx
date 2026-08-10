import React from 'react';

export default function GroupNameEditor({
  isEditing,
  isReadOnly,
  groupName,
  groupNameInput,
  isLoading,
  onGroupNameInputChange,
  onSave,
  onCancel,
  onStartEdit,
}) {
  if (isEditing && !isReadOnly) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
        <input
          type="text"
          value={groupNameInput}
          onChange={(event) => onGroupNameInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSave();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
          className="w-full border-b border-primaryColor-500 bg-transparent text-2xl sm:text-3xl font-extrabold text-primaryColor-700 focus:outline-none focus:border-primaryColor-700"
          autoFocus
          maxLength={40}
          placeholder="輸入這本分帳記帳簿名稱"
        />
        <div className="flex gap-2 justify-end sm:justify-start">
          <button
            type="button"
            onClick={onSave}
            disabled={isLoading || !groupNameInput.trim()}
            className={'px-3 py-1 rounded-lg text-sm font-semibold text-white shadow-md ' + (
              isLoading || !groupNameInput.trim()
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primaryColor-600 hover:bg-primaryColor-700'
            )}
          >
            儲存
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-1 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100">
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <h1
        className={'text-3xl sm:text-4xl font-extrabold text-primaryColor-700 ' + (isReadOnly ? '' : 'cursor-text hover:underline decoration-dotted')}
        onClick={() => {
          if (!isReadOnly) onStartEdit();
        }}
        title={isReadOnly ? '' : '點擊以修改這本分帳記帳簿名稱'}
      >
        {groupName || '分帳記帳簿'}
      </h1>
    </div>
  );
}
