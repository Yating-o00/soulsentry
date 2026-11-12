import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Image, ScrollView } from "@tarojs/components";
import { get, patch } from "@/utils/api";
import { getToken } from "@/utils/auth";
import { ensureDemoSession } from "@/utils/demo";
import theme from "@/components/tasks/theme";
import {
  WALLPAPER_STYLES,
  buildLockscreenItems,
  isItemDone,
  generateWallpaper,
} from "@/lib/lockscreenWallpaper";

// 锁屏约定：把全部约定渲染成锁屏壁纸（查看用），点按下方清单勾选（含子约定）后壁纸自动重绘，
// 勾选走后端接口，完成状态实时同步到小程序与 Web 端；保存壁纸到相册并设为锁屏即可随时查看。
export default function Lockscreen() {
  const [tasks, setTasks] = useState([]);
  const [styleKey, setStyleKey] = useState("night");
  const [imgPath, setImgPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  // 生成序号：勾选连点时旧的一次生成结果不得覆盖新的
  const genSeqRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const all = await get("/tasks", { parent_task_id: "all", sort: "-created_date", limit: 300 });
      setTasks(Array.isArray(all) ? all : []);
    } catch (_err) {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    (async () => {
      await ensureDemoSession();
      const guest = !getToken();
      setIsGuest(guest);
      if (guest) {
        setLoading(false);
      } else {
        fetchData();
      }
    })();
  });

  const items = useMemo(() => buildLockscreenItems(tasks), [tasks]);

  // 勾选状态或壁纸样式变化时自动重绘
  useEffect(() => {
    if (loading || isGuest) return;
    const seq = ++genSeqRef.current;
    generateWallpaper(items, styleKey).then((p) => {
      if (seq === genSeqRef.current && p) setImgPath(p);
    });
  }, [items, styleKey, loading, isGuest]);

  // 勾选 / 取消勾选：重复约定切换 done_today（打卡不杀系列），普通约定切换 status
  const toggle = (task) => {
    const recurring = task.repeat_rule && task.repeat_rule !== "none";
    const done = isItemDone(task);
    const nextStatus = done ? "pending" : "completed";
    const completedAt = done ? null : new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? recurring
            ? { ...t, done_today: !done }
            : { ...t, status: nextStatus, completed_at: completedAt }
          : t
      )
    );
    patch(`/tasks/${task.id}`, { status: nextStatus }).catch(() => {
      // 失败回滚
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      Taro.showToast({ title: "网络开小差了，请再试一次", icon: "none" });
    });
  };

  const save = async () => {
    if (!imgPath || saving) return;
    setSaving(true);
    try {
      await Taro.saveImageToPhotosAlbum({ filePath: imgPath });
      Taro.showToast({ title: "已保存，去设为锁屏壁纸吧", icon: "none", duration: 2500 });
    } catch (_err) {
      Taro.showModal({
        title: "需要相册权限",
        content: "允许保存图片到相册后，才能把壁纸存下来",
        confirmText: "去设置",
        cancelText: "取消",
        success: (r) => {
          if (r.confirm) Taro.openSetting();
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const taskById = useMemo(() => {
    const map = {};
    tasks.forEach((t) => { map[t.id] = t; });
    return map;
  }, [tasks]);

  if (isGuest) {
    return (
      <View style={{ minHeight: "100vh", background: theme.paper, padding: "48rpx 32rpx" }}>
        <View
          style={{
            marginTop: "120rpx",
            padding: "64rpx 32rpx",
            borderRadius: "24rpx",
            background: theme.card,
            border: `1rpx solid ${theme.border}`,
            textAlign: "center",
          }}
        >
          <Text style={{ fontSize: "30rpx", color: theme.inkSecondary }}>登录后，把今日约定生成锁屏壁纸</Text>
          <View
            onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
            style={{
              marginTop: "32rpx",
              margin: "32rpx auto 0",
              width: "280rpx",
              padding: "20rpx 0",
              borderRadius: "999rpx",
              background: theme.primary,
            }}
          >
            <Text style={{ fontSize: "28rpx", color: "#fff" }}>去登录</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ minHeight: "100vh", background: theme.paper, padding: "24rpx", boxSizing: "border-box" }}>
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        {/* 页眉 */}
        <View style={{ paddingBottom: "24rpx", borderBottom: `1rpx solid ${theme.border}` }}>
          <Text style={{ fontSize: "40rpx", fontWeight: 900, color: theme.primary }}>锁屏约定</Text>
          <View style={{ marginTop: "12rpx" }}>
            <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, lineHeight: 1.7 }}>
              保存壁纸设为锁屏，亮屏即见全部约定；在下方勾选（含子约定）即完成约定，完成状态实时同步到小程序与 Web 端，壁纸自动更新，重新保存替换即可。
            </Text>
          </View>
        </View>

        {/* 壁纸预览 */}
        <View style={{ marginTop: "32rpx", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <View
            style={{
              width: "440rpx",
              borderRadius: "36rpx",
              overflow: "hidden",
              border: `1rpx solid ${theme.border}`,
              background: "#222b49",
            }}
          >
            {imgPath ? (
              <Image src={imgPath} mode="widthFix" style={{ width: "100%", display: "block" }} />
            ) : (
              <View style={{ height: "960rpx", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: "24rpx", color: "rgba(247,244,238,0.6)" }}>壁纸生成中…</Text>
              </View>
            )}
          </View>

          {/* 壁纸样式 */}
          <View style={{ marginTop: "24rpx", display: "flex", alignItems: "center", gap: "20rpx" }}>
            {WALLPAPER_STYLES.map((s) => (
              <View
                key={s.key}
                onClick={() => setStyleKey(s.key)}
                style={{
                  width: "64rpx",
                  height: "64rpx",
                  borderRadius: "16rpx",
                  background: `linear-gradient(180deg, ${s.from}, ${s.to})`,
                  border: styleKey === s.key ? `4rpx solid ${theme.primary}` : `2rpx solid ${theme.border}`,
                  boxSizing: "border-box",
                }}
              />
            ))}
          </View>
          <Text style={{ marginTop: "8rpx", fontSize: "20rpx", color: theme.inkQuaternary }}>
            {WALLPAPER_STYLES.find((s) => s.key === styleKey)?.name}
          </Text>

          <View
            onClick={save}
            style={{
              marginTop: "24rpx",
              width: "440rpx",
              padding: "22rpx 0",
              borderRadius: "16rpx",
              background: saving ? theme.inkQuaternary : theme.primary,
              textAlign: "center",
            }}
          >
            <Text style={{ fontSize: "28rpx", color: "#fff" }}>{saving ? "保存中…" : "保存壁纸到相册"}</Text>
          </View>
        </View>

        {/* 快捷勾选 */}
        <View style={{ marginTop: "48rpx" }}>
          <Text style={{ fontSize: "30rpx", fontWeight: 700, color: theme.ink }}>今日约定</Text>
          <View style={{ marginTop: "4rpx" }}>
            <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary }}>点按即可勾选 / 取消，壁纸同步更新</Text>
          </View>

          {loading ? (
            <View style={{ marginTop: "40rpx" }}>
              <Text style={{ fontSize: "24rpx", color: theme.inkQuaternary }}>加载中…</Text>
            </View>
          ) : items.length === 0 ? (
            <View
              style={{
                marginTop: "24rpx",
                padding: "56rpx 32rpx",
                borderRadius: "24rpx",
                border: `1rpx dashed ${theme.border}`,
                textAlign: "center",
              }}
            >
              <Text style={{ fontSize: "26rpx", color: theme.inkTertiary }}>今天还没有约定</Text>
            </View>
          ) : (
            <View style={{ marginTop: "24rpx" }}>
              {items.map((p) => (
                <View
                  key={p.id}
                  style={{
                    marginBottom: "16rpx",
                    borderRadius: "20rpx",
                    background: theme.card,
                    border: `1rpx solid ${theme.border}`,
                    overflow: "hidden",
                  }}
                >
                  <CheckRow title={p.title} done={p.done} onToggle={() => taskById[p.id] && toggle(taskById[p.id])} />
                  {p.subtasks.map((s) => (
                    <CheckRow
                      key={s.id}
                      title={s.title}
                      done={s.done}
                      sub
                      onToggle={() => taskById[s.id] && toggle(taskById[s.id])}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function CheckRow({ title, done, sub = false, onToggle }) {
  const box = sub ? 32 : 40;
  return (
    <View
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "20rpx",
        padding: sub ? "20rpx 28rpx 20rpx 76rpx" : "24rpx 28rpx",
        borderTop: sub ? `1rpx solid ${theme.border}` : "none",
      }}
    >
      <View
        style={{
          width: `${box}rpx`,
          height: `${box}rpx`,
          borderRadius: "8rpx",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: done ? theme.sage : "transparent",
          border: done ? `2rpx solid ${theme.sage}` : `3rpx solid ${theme.inkQuaternary}`,
          boxSizing: "border-box",
        }}
      >
        {done && <Text style={{ fontSize: sub ? "20rpx" : "24rpx", color: "#fff", lineHeight: 1 }}>✓</Text>}
      </View>
      <Text
        style={{
          fontSize: sub ? "26rpx" : "28rpx",
          fontWeight: sub ? 400 : 500,
          color: done ? theme.inkQuaternary : theme.ink,
          textDecoration: done ? "line-through" : "none",
        }}
      >
        {title}
      </Text>
    </View>
  );
}
