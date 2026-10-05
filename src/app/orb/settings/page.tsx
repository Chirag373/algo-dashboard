"use client";

import { useState } from "react";

export default function OrbSettings() {
  const [settings, setSettings] = useState({
    initialSlPercent: 2,
    tslLockPercent: 1.5,
    tslTrailStep: 0.5,
    tslTrailAmount: 0.5,
    perTradeAmount: 10000,
    totalCapital: 300000,
    marketCloseExitTime: "15:19",
    strategyActive: 1,
    maxTradesPerStock: 2,
    rangeCandleCount: 5,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h2 className="text-2xl font-semibold text-white tracking-wide">Strategy Settings</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Row 1 */}
        <SettingCard
          label="initial sl percent"
          name="initialSlPercent"
          value={settings.initialSlPercent}
          onChange={handleChange}
          type="number"
          step="0.1"
        />
        <SettingCard
          label="tsl lock percent"
          name="tslLockPercent"
          value={settings.tslLockPercent}
          onChange={handleChange}
          type="number"
          step="0.1"
        />
        <SettingCard
          label="tsl trail step"
          name="tslTrailStep"
          value={settings.tslTrailStep}
          onChange={handleChange}
          type="number"
          step="0.1"
        />
        <SettingCard
          label="tsl trail amount"
          name="tslTrailAmount"
          value={settings.tslTrailAmount}
          onChange={handleChange}
          type="number"
          step="0.1"
        />

        {/* Row 2 */}
        <SettingCard
          label="per trade amount"
          name="perTradeAmount"
          value={settings.perTradeAmount}
          onChange={handleChange}
          type="number"
        />
        <SettingCard
          label="total capital"
          name="totalCapital"
          value={settings.totalCapital}
          onChange={handleChange}
          type="number"
        />
        <SettingCard
          label="market close exit time"
          name="marketCloseExitTime"
          value={settings.marketCloseExitTime}
          onChange={handleChange}
          type="time"
        />
        <SettingCard
          label="strategy active"
          name="strategyActive"
          value={settings.strategyActive}
          onChange={handleChange}
          type="number"
        />

        {/* Row 3 */}
        <SettingCard
          label="max trades per stock"
          name="maxTradesPerStock"
          value={settings.maxTradesPerStock}
          onChange={handleChange}
          type="number"
        />
        <SettingCard
          label="range candle count"
          name="rangeCandleCount"
          value={settings.rangeCandleCount}
          onChange={handleChange}
          type="number"
        />
      </div>

      <div className="pt-8 flex justify-center">
        <button className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-12 rounded-lg transition-colors text-lg shadow-lg shadow-green-900/20">
          Save All Settings
        </button>
      </div>
    </div>
  );
}

function SettingCard({ label, name, value, onChange, type = "text", step }: unknown) {
  return (
    <div className="bg-orb-panel border border-gray-800 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
      <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        step={step}
        className="w-full bg-[#0a0e17] border border-gray-700 rounded-md px-3 py-2 text-white mono-nums focus:outline-none focus:border-orb-accent focus:ring-1 focus:ring-orb-accent transition-colors"
      />
    </div>
  );
}
