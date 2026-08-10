import { memo } from 'react';

const ConfirmationModal = memo(({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  confirmColor = 'red',
}) => {
  if (!isOpen) return null;

  const colorClass = confirmColor === 'green'
    ? 'bg-green-600 hover:bg-green-700'
    : 'bg-red-600 hover:bg-red-700';

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-[9999] transition-opacity force-gpu">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl transform transition-transform duration-300 scale-100 force-gpu">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">{title}</h3>
          <p className="text-gray-600 mb-6">{message}</p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full text-gray-700 bg-gray-200 hover:bg-gray-300 transition font-semibold"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 rounded-full text-white font-semibold transition duration-150 shadow-md ${colorClass}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ConfirmationModal;
