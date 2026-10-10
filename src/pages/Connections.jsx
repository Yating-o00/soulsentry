import React, { useState } from "react";
import AppConnectionsGrid from "@/components/connections/AppConnectionsGrid";
import MailboxPanel from "@/components/connections/MailboxPanel";
import RecommendedHardware from "@/components/connections/RecommendedHardware";
import ConnectedDevicesPanel from "@/components/devices/ConnectedDevicesPanel";

export default function Connections() {
  const [mailConnected, setMailConnected] = useState(false);
  const [active, setActive] = useState("mail");

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">外部连接</h1>
        <p className="text-sm text-slate-500 mt-1">把你常用的应用与硬件接入心栈，让数据流通、让事情被真正办完。</p>
      </div>

      <section className="space-y-4">
        <h2 className="font-semibold text-slate-800">应用连接</h2>
        <AppConnectionsGrid mailConnected={mailConnected} active={active} onSelect={setActive} />
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/50 p-4 md:p-6">
          <MailboxPanel onStatus={setMailConnected} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-slate-800">硬件连接</h2>
        <ConnectedDevicesPanel />
        <h3 className="text-sm font-medium text-slate-600 pt-2">推荐连接</h3>
        <RecommendedHardware />
      </section>
    </div>
  );
}