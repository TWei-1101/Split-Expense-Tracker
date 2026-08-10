import { memo, useCallback, useEffect, useState } from 'react';

const MemberManagementModal = memo(({
  currentUserId,
  members,
  customMembers,
  defaultSharesConfig,
  isMemberModalOpen,
  setIsMemberModalOpen,
  saveMembers,
  handleSaveDefaultShares,
  handleDeleteMember,
  isLoading,
  getDisplayName,
  isReadOnly,
  groupMembers,
  groupOwner,
  inviteUserByEmail,
  removeGroupMember,
  migrateMemberID,
  icons,
}) => {
  const { X, Users, Minus, Plus, UserMinus, CircleCheck } = icons;
  const [memberInput, setMemberInput] = useState('');
  const [tempDefaultShares, setTempDefaultShares] = useState({});
  const [modalMessage, setModalMessage] = useState(null);
  const [nameToReplace, setNameToReplace] = useState(null);
  const [availableUidsForReplace, setAvailableUidsForReplace] = useState([]);

  useEffect(() => {
    if (isMemberModalOpen) {
      const initialShares = members.reduce((acc, name) => {
        const shareValue = defaultSharesConfig[name] !== undefined ? defaultSharesConfig[name] : 1;
        acc[name] = shareValue;
        return acc;
      }, {});
      setTempDefaultShares(initialShares);
      setMemberInput('');
      setModalMessage(null);

      const allUIDs = groupMembers.filter(uid => uid.length > 20 && uid !== currentUserId);
      setAvailableUidsForReplace(allUIDs);
      setNameToReplace(null);
    }
  }, [isMemberModalOpen, members, defaultSharesConfig, groupMembers, customMembers, currentUserId]);

  const resetMessage = useCallback(() => {
    setModalMessage(null);
  }, []);

  const handleAddMemberByName = async (name) => {
    if (isReadOnly) {
      setModalMessage('❌ 唯讀模式下無法新增成員。');
      return;
    }

    const trimmedName = name.trim();
    resetMessage();

    if (trimmedName && trimmedName !== currentUserId && !customMembers.includes(trimmedName)) {
      await saveMembers([...customMembers, trimmedName]);
      setModalMessage(`✅ 已新增分帳成員: ${trimmedName}`);
    } else if (trimmedName === currentUserId) {
      setModalMessage('❌ 不能將自己的用戶 ID 新增為成員。');
    } else if (customMembers.includes(trimmedName)) {
      setModalMessage(`⚠️ 成員 ${trimmedName} 已存在於分帳清單。`);
    }
  };

  const handleSubmitMemberInput = async () => {
    if (isReadOnly) {
      setModalMessage('❌ 唯讀模式下無法新增或邀請成員。');
      return;
    }

    const input = memberInput.trim();
    if (!input) return;

    resetMessage();
    if (input.includes('@')) {
      await inviteUserByEmail(input, setModalMessage);
    } else {
      await handleAddMemberByName(input);
    }

    setMemberInput('');
  };

  const handleTempShareChange = (name, delta) => {
    setTempDefaultShares(prev => {
      const currentShares = prev[name] || 0;
      return { ...prev, [name]: Math.max(0, currentShares + delta) };
    });
  };

  const handleTempInputChange = (name, value) => {
    const shareCount = parseInt(value, 10);
    if (shareCount >= 0 || value === '') {
      setTempDefaultShares(prev => ({ ...prev, [name]: shareCount || 0 }));
    }
  };

  const handleMemberDeleteWrapper = async (member) => {
    if (isReadOnly) {
      setModalMessage('❌ 唯讀模式下無法刪除成員。');
      return;
    }
    await handleDeleteMember(member, setModalMessage);
  };

  const handleSaveDefaultSharesWrapper = async (tempShares) => {
    await handleSaveDefaultShares(tempShares, setModalMessage);
  };

  const handleReplaceMember = (oldName, newId) => {
    migrateMemberID(oldName, newId, setModalMessage);
    setNameToReplace(null);
    setIsMemberModalOpen(false);
  };

  if (!isMemberModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-start justify-center p-4 z-50 transition-opacity overflow-y-auto force-gpu">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl transform transition-transform duration-300 scale-100 my-4 h-full sm:h-auto sm:max-h-[95vh] flex flex-col force-gpu">
        <div className="p-6 border-b flex justify-between items-center flex-shrink-0">
          <h3 className="text-xl font-bold text-gray-800">
            管理分帳成員與預設份數 {isReadOnly && <span className="text-red-500 ml-2">(唯讀)</span>}
          </h3>
          <button onClick={() => setIsMemberModalOpen(false)} className="p-1 rounded-full hover:bg-gray-100 text-gray-600 transition hover:scale-110 transform">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {modalMessage && (
            <div className={`p-3 rounded-lg text-sm font-semibold ${modalMessage.startsWith('❌') ? 'bg-red-100 text-red-700' : (modalMessage.startsWith('⚠️') ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700')}`}>
              {modalMessage}
            </div>
          )}

          {nameToReplace && (
            <div className="border border-red-300 p-4 rounded-lg bg-red-50">
              <h4 className="font-semibold text-lg mb-2 text-red-700">
                將「{getDisplayName(nameToReplace)}」替換為哪個帳號？
              </h4>
              <div className="flex gap-2 flex-wrap">
                {availableUidsForReplace.length === 0 ? (
                  <p className="text-sm text-red-500">目前沒有可供替換的用戶 ID（請先透過 Email 邀請新的共享成員）。</p>
                ) : (
                  availableUidsForReplace.map(uid => (
                    <button
                      key={`replace-target-${uid}`}
                      onClick={() => handleReplaceMember(nameToReplace, uid)}
                      disabled={isLoading || isReadOnly}
                      className="px-3 py-1 text-sm rounded-lg text-white bg-red-500 hover:bg-red-600 transition disabled:bg-gray-400"
                    >
                      替換為 {getDisplayName(uid)}
                    </button>
                  ))
                )}
                <button onClick={() => setNameToReplace(null)} className="px-3 py-1 text-sm rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition">
                  取消替換
                </button>
              </div>
            </div>
          )}

          <div className="border p-4 rounded-lg bg-gray-50 flex-shrink-0">
            <h4 className="font-semibold text-lg mb-2 flex items-center text-primaryColor-700">
              <Users className="w-5 h-5 mr-2" />
              管理分帳成員與共享權限 {isReadOnly && <span className="text-red-500 ml-2">(唯讀)</span>}
            </h4>
            <div className="flex gap-2 items-center mb-2">
              <input
                type="text"
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmitMemberInput();
                  }
                }}
                placeholder="輸入名稱或Email"
                className="flex-grow border border-gray-300 rounded-lg p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500 disabled:bg-gray-100"
                disabled={isLoading || isReadOnly}
              />
              <button
                onClick={handleSubmitMemberInput}
                className={'flex-shrink-0 px-4 py-3 rounded-lg text-white font-semibold transition hover:scale-105 transform ' + (memberInput.trim() === '' || isLoading || isReadOnly ? 'bg-gray-400 cursor-not-allowed' : 'bg-primaryColor-600 hover:bg-primaryColor-700')}
                disabled={memberInput.trim() === '' || isLoading || isReadOnly}
              >
                加入
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">以Email加入，為可編輯成員。</p>
            <div className="mt-1 text-xs text-gray-600">
              <p className="font-semibold mb-1">目前有編輯權限的成員：</p>
              {groupMembers && groupMembers.length === 0 ? (
                <p className="text-gray-400">尚無成員（只有你自己）。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {groupMembers && groupMembers.map((uid) => (
                    <div key={uid} className="flex items-center px-2 py-1 bg-white border border-gray-300 rounded-lg text-sm">
                      <span>
                        {getDisplayName(uid)}
                        {uid === groupOwner && <span className="ml-1 text-[11px] text-primaryColor-600 font-semibold">（擁有者）</span>}
                      </span>
                      {!isReadOnly && uid !== groupOwner && (
                        <button
                          type="button"
                          onClick={() => removeGroupMember(uid, setModalMessage)}
                          className="ml-2 px-2 py-0.5 text-[11px] rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          disabled={isReadOnly}
                        >
                          移除
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-lg mb-3 text-gray-700">設定所有成員的預設份數 {isReadOnly && <span className="text-red-500 ml-2">(唯讀)</span>}</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3 text-sm font-semibold text-gray-600 border-b pb-2">
              <span>成員名稱</span>
              <span className="flex items-center justify-between">預設份數</span>
            </div>
            <div className="space-y-2 max-h-64 pr-2">
              {members.map(member => {
                const isCustomName = member !== currentUserId && !groupMembers.includes(member) && member.length < 20;
                return (
                  <div key={member} className="grid grid-cols-[1fr_auto] gap-4 items-center p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
                    <span
                      className={`font-medium truncate ${member === currentUserId ? 'text-primaryColor-700' : 'text-gray-800'} ${isCustomName && !isReadOnly ? 'cursor-pointer hover:text-red-600 hover:underline' : ''}`}
                      title={member}
                      onClick={() => {
                        if (isCustomName && !isReadOnly) setNameToReplace(member);
                      }}
                    >
                      {getDisplayName(member)}
                      {isCustomName && <span className="ml-2 text-red-500 text-xs font-normal"></span>}
                    </span>
                    <div className="flex items-center space-x-2 flex-shrink">
                      <button
                        onClick={() => handleTempShareChange(member, -1)}
                        type="button"
                        className="p-1.5 bg-red-50 text-red-600 rounded-lg transition hover:scale-105 transform hover:bg-red-100 shadow-sm border border-red-200 disabled:opacity-50"
                        aria-label="減少份數"
                        disabled={isReadOnly}
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <input
                        key={`shares-input-${member}`}
                        type="number"
                        min="0"
                        value={tempDefaultShares[member] === 0 ? 0 : tempDefaultShares[member] || 1}
                        onChange={(e) => handleTempInputChange(member, e.target.value)}
                        placeholder="1"
                        className="w-16 border border-gray-300 rounded-lg p-2 text-center focus:ring-primaryColor-500 focus:border-primaryColor-500 disabled:bg-gray-100"
                        disabled={isLoading || isReadOnly}
                      />
                      <button
                        onClick={() => handleTempShareChange(member, 1)}
                        type="button"
                        className="p-1.5 bg-green-50 text-green-600 rounded-lg transition hover:scale-105 transform hover:bg-green-100 shadow-sm border border-green-200 disabled:opacity-50"
                        aria-label="增加份數"
                        disabled={isReadOnly}
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                      <span className="text-gray-500">份</span>
                      {member !== currentUserId && (
                        <button
                          onClick={() => handleMemberDeleteWrapper(member)}
                          className="p-1 text-red-500 hover:bg-red-100 rounded-full transition hover:scale-110 transform ml-auto disabled:opacity-50"
                          disabled={isLoading || isReadOnly}
                          aria-label="刪除成員"
                        >
                          <UserMinus className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="p-6 border-t flex justify-end flex-shrink-0">
          <button
            onClick={() => handleSaveDefaultSharesWrapper(tempDefaultShares)}
            disabled={isLoading || isReadOnly}
            className={'flex items-center px-6 py-3 rounded-full text-white font-semibold transition hover:scale-105 transform duration-150 shadow-md ' + ((isLoading || isReadOnly) ? 'bg-gray-400 cursor-not-allowed' : 'bg-primaryColor-600 hover:bg-primaryColor-700 hover:shadow-lg')}
          >
            <CircleCheck className="w-5 h-5 mr-2" />
            儲存預設份數
          </button>
        </div>
      </div>
    </div>
  );
});

export default MemberManagementModal;
