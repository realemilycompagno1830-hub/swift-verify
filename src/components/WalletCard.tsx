"use client";

interface WalletCardProps {
  username?: string;
  balance?: number;
  onFund?: () => void;
  announcement?: string;
}

export default function WalletCard({
  username = "guest",
  balance = 0,
  onFund,
  announcement = "NOTICE: New US WhatsApp numbers added. High success rates!",
}: WalletCardProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 w-full max-w-xs">
        <div className="text-sm text-gray-600 mb-1">
          Account: <span className="font-semibold text-black">{username}</span>
        </div>
        <div className="text-sm text-gray-600 mb-4">
          Balance:{" "}
          <span className="font-bold text-green-700 text-base">
            ₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <button
          onClick={onFund}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-md text-sm transition-colors"
        >
          FUND WALLET
        </button>
      </div>

      {announcement && (
        <div className="text-xs text-gray-600 max-w-xs leading-relaxed border-l-2 border-red-500 pl-3">
          {announcement}
        </div>
      )}

      <div className="pt-4 space-y-1">
        <p className="font-bold text-lg leading-tight">Instant Delivery.</p>
        <p className="font-bold text-lg leading-tight">High Success Rate.</p>
        <p className="font-bold text-lg leading-tight">Automated System.</p>
      </div>
    </div>
  );
}
