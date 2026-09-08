import React, { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, Plus, Trash2, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { httpRequest, getAccessToken } from "@/api/httpClient";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// 后端 /api/vault 实际行为（backend/src/routes/vault.js）：
//   GET    /api/vault          → 200 [{ id, label, created_date, updated_date }]（仅元数据，不暴露是否已设密码）
//   POST   /api/vault/unlock   → 200 [{ id, label, value, created_date }]（服务端解密返回明文）
//                                400 { error: 'VAULT_NOT_SET' } / 403 { error: 'WRONG_PASSWORD' }
//   POST   /api/vault/setup    → { ok: true }，密码 ≥ 4 位
//   POST   /api/vault          → 201 { id, label, created_date }，body { label, value, password }
//   DELETE /api/vault/:id      → 204
// 是否已设密码只能通过 unlock/新增返回的 VAULT_NOT_SET 判断，因此默认进 locked 态，命中后转 setup。

function errCode(e) {
  return e?.data?.error || "";
}

export default function VaultDialog({ open, onOpenChange, initialValue, pendingNote, onVaulted }) {
  const [status, setStatus] = useState("checking"); // checking | setup | locked | unlocked
  const [items, setItems] = useState([]); // 解锁后的明文列表，关闭弹层即清空
  const [password, setPassword] = useState(""); // 解锁密码（解锁后暂存内存，用于新增条目）
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [showValues, setShowValues] = useState({});
  const [addLabel, setAddLabel] = useState("");
  const [addValue, setAddValue] = useState("");
  const [adding, setAdding] = useState(false);

  // 打开时重置并探测登录态；关闭时清空内存中的明文与密码
  useEffect(() => {
    if (!open) return;
    setStatus("checking");
    setItems([]);
    setPassword("");
    setNewPwd("");
    setConfirmPwd("");
    setShowValues({});
    setAddLabel(pendingNote ? (pendingNote.plain_text || "").slice(0, 20) : "");
    setAddValue(pendingNote?.plain_text || initialValue || "");
    if (!getAccessToken()) {
      toast.error("请先登录后再使用保险柜");
      onOpenChange(false);
      return;
    }
    // GET /api/vault 不返回是否已设密码，仅用于确认后端可用；未设密码在解锁时经 VAULT_NOT_SET 转到 setup 态
    httpRequest("/api/vault")
      .then(() => setStatus("locked"))
      .catch((e) => {
        toast.error(e?.message || "保险柜暂不可用");
        onOpenChange(false);
      });
     
  }, [open]);

  useEffect(() => {
    if (!open) {
      setItems([]);
      setPassword("");
    }
  }, [open]);

  const handleSetup = async () => {
    if (newPwd.length < 4) {
      toast.error("密码至少 4 位");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      await httpRequest("/api/vault/setup", { method: "POST", body: { password: newPwd } });
      // 设置成功后直接用新密码解锁，一步进入已解锁态
      const data = await httpRequest("/api/vault/unlock", { method: "POST", body: { password: newPwd } });
      setPassword(newPwd);
      setItems(Array.isArray(data) ? data : []);
      setStatus("unlocked");
      toast.success("保险柜已开启");
    } catch (e) {
      toast.error(e?.message || "设置失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const data = await httpRequest("/api/vault/unlock", { method: "POST", body: { password } });
      setItems(Array.isArray(data) ? data : []);
      setStatus("unlocked");
    } catch (e) {
      if (errCode(e) === "VAULT_NOT_SET") {
        setStatus("setup");
      } else if (errCode(e) === "WRONG_PASSWORD") {
        toast.error("密码错误，请重试");
      } else {
        toast.error(e?.message || "解锁失败，请重试");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const label = addLabel.trim();
    const value = addValue.trim();
    if (!label || !value) {
      toast.error("请填写名称和内容");
      return;
    }
    setAdding(true);
    try {
      const created = await httpRequest("/api/vault", {
        method: "POST",
        body: { label, value, password },
      });
      setItems((prev) => [{ ...created, value }, ...prev]);
      setAddLabel("");
      setAddValue("");
      // 移入心签：入库成功后软删原心签并通知父组件移除
      if (pendingNote?.id) {
        await base44.entities.Note.update(pendingNote.id, { deleted_at: new Date().toISOString() });
        onVaulted?.(pendingNote.id);
        toast.success("已移入保险柜，原心签已删除");
        onOpenChange(false);
      } else {
        toast.success("已存入保险柜");
      }
    } catch (e) {
      toast.error(e?.message || "保存失败，请重试");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await httpRequest(`/api/vault/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((it) => it.id !== id));
      toast.success("已删除");
    } catch (e) {
      toast.error("删除失败，请重试");
    }
  };

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#384877]/50 focus:ring-2 focus:ring-[#384877]/10 transition";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <span className="w-6 h-6 rounded-lg bg-[#384877]/10 flex items-center justify-center">
              <Lock className="w-3.5 h-3.5 text-[#384877]" />
            </span>
            保险柜
          </DialogTitle>
          <DialogDescription className="text-left">
            敏感信息独立加密保存，密码仅用于加解密，不会上传明文密码。
          </DialogDescription>
        </DialogHeader>

        {status === "checking" && (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 检查中…
          </div>
        )}

        {status === "setup" && (
          <div className="space-y-3">
            <p className="text-[13px] text-slate-600 leading-relaxed">
              第一次使用保险柜，请设置一个独立密码（至少 4 位）。密码用于加密你的敏感信息，请牢记。
            </p>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="设置密码（4 位以上）"
              className={inputCls}
            />
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              placeholder="再输入一次确认"
              className={inputCls}
            />
            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[#384877] hover:bg-[#2d3a5f] text-white text-sm font-medium transition disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              设置并进入
            </button>
          </div>
        )}

        {status === "locked" && (
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              placeholder="输入保险柜密码"
              className={inputCls}
              autoFocus
            />
            <button
              onClick={handleUnlock}
              disabled={loading || !password}
              className="w-full py-2.5 rounded-xl bg-[#384877] hover:bg-[#2d3a5f] text-white text-sm font-medium transition disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              解锁
            </button>
          </div>
        )}

        {status === "unlocked" && (
          <div className="space-y-3">
            {pendingNote && (
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-[12px] text-amber-700">
                正在将这条心签移入保险柜，存入后原文心签会被删除。
              </div>
            )}

            {/* 新增 */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600">
                <Plus className="w-3.5 h-3.5" /> 新增敏感信息
              </div>
              <input
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="名称，如：工商银行卡"
                className={inputCls}
              />
              <textarea
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                placeholder="内容，如：卡号 / 密码 / 证件号"
                rows={2}
                className={`${inputCls} resize-none`}
              />
              <button
                onClick={handleAdd}
                disabled={adding}
                className="w-full py-2 rounded-lg bg-[#384877] hover:bg-[#2d3a5f] text-white text-xs font-medium transition disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                {pendingNote ? "存入保险柜并删除心签" : "加密存入"}
              </button>
            </div>

            {/* 列表 */}
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-slate-400 text-sm">
                <Inbox className="w-6 h-6" /> 保险柜是空的
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {items.map((it) => (
                  <div key={it.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-slate-700 flex-1 truncate">{it.label}</span>
                      <button
                        onClick={() => setShowValues((v) => ({ ...v, [it.id]: !v[it.id] }))}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        title={showValues[it.id] ? "隐藏内容" : "查看内容"}
                      >
                        {showValues[it.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDelete(it.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 text-[12.5px] text-slate-500 break-all leading-relaxed">
                      {showValues[it.id] ? it.value : "••••••••"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
