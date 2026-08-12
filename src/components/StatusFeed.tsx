"use client";

const STEPS = [
  "1. Order Placed",
  "2. Get Number",
  "3. Wait for SMS",
  "4. View OTP Code",
];

interface StatusFeedProps {
  currentStep?: number; // 0-3
}

export default function StatusFeed({ currentStep = -1 }: StatusFeedProps) {
  return (
    <div className="w-full max-w-3xl mx-auto mt-8">
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-700">
        {STEPS.map((step, idx) => (
          <div key={step} className="flex items-center gap-2">
            <span
              className={
                idx <= currentStep
                  ? "font-semibold text-red-600"
                  : "text-gray-600"
              }
            >
              {step}
            </span>
            {idx < STEPS.length - 1 && (
              <span className="text-gray-400 hidden sm:inline">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
