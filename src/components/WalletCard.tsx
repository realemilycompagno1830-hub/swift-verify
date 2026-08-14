"use client";

import { useState } from "react";

interface WalletCardProps {
  username?: string;
  balance?: number;
  onFund?: (amount?: number) => void;
  announcement?: string;
}

export default function WalletCard({
  username = "guest",
  balance = 0,
  onFund,
  announcement,
}: WalletCardProps) {
  const [showInput, setShowInput] = useState(false);
  const [amount, setAmount] = useState("1000");
  const [error, setError] = useState<string | null>(null);

  const handleFundClick = () => {
    if (!onFund) {
      alert("Funding is not available right now.");
      return;
    }
    setShowInput(true);
    setError(null);
  };

  const handleConfirm = () => {
    const value = Number(amount);

    if (!value || isNaN(value)) {
      setError("Please enter a valid amount");
      return;
    }

    if (value < 1000) {
      setError("Minimum amount is ₦1,000");
      return;
    }

    setError(null);
    setShowInput(false);
    onFund?.(value);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 w-full max-w-xs">
        <div className="text-sm text-gray-600 mb-1">
          Account: <span className="font-semibold text-black">{username}</span>
        </div>
        <div className="text-sm text-gray-600 mb-4">
          Balance:{" "}
          <span className="font-bold text-green-700 text-base">
            ₦{Number(balance).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </span>
        </div>

        {!showInput ? (
          <button
            onClick={handleFundClick}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-md text-sm transition-colors"
          >
            FUND WALLET
          </button>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs text-gray-500">
              Enter amount (minimum ₦1,000)
            </label>
            <input
              type="number"
              min={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="1000"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-md text-sm"
              >
                Continue
              </button>
              <button
                onClick={() => {
                  setShowInput(false);
                  setError(null);
                }}
                className="px-3 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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
