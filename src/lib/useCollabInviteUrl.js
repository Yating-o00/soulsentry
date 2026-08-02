import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// 分享卡片二维码固定指向正式域名，避免微信把预览沙箱链接判定为风险站点
const SHARE_ORIGIN = "https://xinzhan-soulsentry.com";

/**
 * 为约定/心签确保存在一个协作邀请链接（免注册可参与），返回可放进二维码的完整 URL。
 * resourceType: "task" | "note"
 */
export default function useCollabInviteUrl({ resourceType, resource, enabled = true }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !resource?.id) { setUrl(""); return; }

    const run = async () => {
      const idField = resourceType === "note" ? "note_id" : "task_id";
      const existing = await base44.entities.CollaborationInvite.filter({
        [idField]: resource.id,
        status: "active",
      }, "-created_date", 1);

      let invite = existing[0];
      if (!invite) {
        const me = await base44.auth.me();
        invite = await base44.entities.CollaborationInvite.create({
          token: Math.random().toString(36).slice(2) + Date.now().toString(36),
          resource_type: resourceType,
          [idField]: resource.id,
          task_title: resource.title || (resource.plain_text || "").slice(0, 40),
          inviter_id: me?.id,
          inviter_name: me?.full_name,
          permission: "collaborate",
          status: "active",
        });
      }

      const page = resourceType === "note" ? "/ShareNote" : "/Collaborate";
      if (!cancelled) setUrl(`${SHARE_ORIGIN}${page}?token=${invite.token}`);
    };

    run().catch(() => { if (!cancelled) setUrl(""); });
    return () => { cancelled = true; };
  }, [resourceType, resource?.id, enabled]);

  return url;
}