import React, { useState } from "react";
import { QrCode, Nfc } from "lucide-react";
import { toast } from "sonner";

const URL = "https://xinzhan-soulsentry.com/Dashboard";

export default function QrPairCard() {
  const [writing, setWriting] = useState(false);
  const nfcOk = typeof window !== "undefined" && "NDEFReader" in window;

  const writeNfc = async () => {
    setWriting(true);
    try {
      await new window.NDEFReader().write({ records: [{ recordType: "url", data: URL }] });
      toast.success("已写入 NFC 标签，以后手机碰一碰即可打开心栈");
    } catch (e) {
      toast.error("写入失败：" + e.message);
    }
    setWriting(false);
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center gap-2 font-semibold text-slate-800"><QrCode className="w-4 h-4 text-[#384877]" />扫码 / 碰一碰</div>
      <p className="text-xs text-slate-500">用另一台手机、平板扫码，登录同一账号即自动同步提醒。</p>
      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(URL)}`} alt="心栈二维码" className="w-36 h-36 mx-auto rounded-xl" />
      {nfcOk ? (
        <button onClick={writeNfc} disabled={writing} className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-[#384877] text-white text-sm disabled:opacity-60">
          <Nfc className="w-4 h-4" />{writing ? "请把标签贴近手机…" : "写入 NFC 碰一碰标签"}
        </button>
      ) : <p className="text-[11px] text-slate-400 text-center">碰一碰（NFC）需在安卓 Chrome 中打开</p>}
    </div>
  );
}