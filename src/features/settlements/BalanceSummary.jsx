import { memo } from 'react';

const BalanceSummary = memo(({
  settlements,
  getDisplayName,
  isReadOnly,
  settleMemberDebt,
  pendingTaxRefundInTWD,
  UsersIcon,
  CircleCheckIcon,
}) => {
  const SummaryIcon = UsersIcon;
  const SettleIcon = CircleCheckIcon;

  return (
  <div className="mt-8 p-6 bg-white rounded-xl shadow-2xl">
    <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center">
      <SummaryIcon className="w-7 h-7 mr-3 text-primaryColor-500" />
      結餘總結
    </h2>
    {pendingTaxRefundInTWD > 0 && (
      <div className="mb-4 rounded-xl border border-primaryColor-100 bg-primaryColor-50 p-4">
        <p className="text-sm font-medium text-primaryColor-700">待收退稅預估總額</p>
        <p className="mt-1 text-2xl font-extrabold text-primaryColor-700">
          TWD {pendingTaxRefundInTWD.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
        </p>
      </div>
    )}

    {settlements.length === 0 ? (
      <p className="text-lg font-medium text-green-600 p-3 bg-green-50 rounded-lg">🎉 所有帳目已結清！</p>
    ) : (
      <div className="space-y-4">
        {settlements.map((settlement, index) => (
          <div
            key={index}
            className="bg-yellow-50 p-4 rounded-xl shadow-md border-l-4 border-yellow-400 flex justify-between items-center transition duration-150"
          >
            <div className="flex items-center">
              <span className="font-bold text-yellow-800 text-xl mr-3">💸</span>
              <div className="text-gray-800">
                <p className="text-lg">
                  <span className="font-bold text-red-600">{getDisplayName(settlement.from)}</span>
                  <span className="mx-0 text-gray-500">應付給</span>
                  <span className="font-bold text-green-600">{getDisplayName(settlement.to)}</span>
                </p>
                <p className="text-3xl font-extrabold text-yellow-700 mt-1">TWD {settlement.amount.toFixed(0)}</p>
              </div>
            </div>

            {!isReadOnly && (
              <button
                onClick={() => settleMemberDebt(settlement.from, settlement.amount, settlement.to)}
                className="px-3 py-1 text-sm rounded-lg text-white transition hover:scale-105 transform shadow-md flex items-center bg-green-500 hover:bg-green-600"
                title="新增一筆結清支出記錄"
              >
                <SettleIcon className="w-4 h-4 mr-1" />
                結清
              </button>
            )}
            {isReadOnly && <span className="text-sm text-gray-500 italic">僅成員可操作</span>}
          </div>
        ))}
      </div>
    )}
  </div>
  );
});

export default BalanceSummary;
