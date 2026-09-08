import React from 'react';

// 模块级序号:每个 DeferredMount 实例按挂载顺序拿一个递增序号,
// 用于把后台挂载错开到不同的空闲时段,避免同一帧内集中初始化。
let mountSeq = 0;

/**
 * 延迟挂载子树（两种触发方式，先到先挂）：
 * 1. 后台错峰挂载 —— 首屏渲染完成后，按序号在浏览器空闲时段依次挂载
 *    （seq*600ms 的 timeout 兜底保证必定执行）。这是主要路径：
 *    等用户开始滚动时，板块大多已挂载完毕，滚动途中不再有挂载工作。
 * 2. 滚动接近挂载 —— 快速下滑时仍由 IntersectionObserver 兜底,
 *    同样挂在空闲回调里,不与滚动手势同帧。
 *
 * 之前只保留方式 2，结果第一次滑动时每个板块边滑边挂载 + 齐发查询,
 * 造成"首次滑动卡、滑完一遍就顺"的现象。
 */
export default function DeferredMount({ children, minHeight = 420, className = '' }) {
  const ref = React.useRef(null);
  const [near, setNear] = React.useState(false);
  const seq = React.useRef(mountSeq++);

  React.useEffect(() => {
    if (near) return;
    const node = ref.current;
    if (!node) return;

    const scheduleMount = (timeout) => {
      if (typeof requestIdleCallback === 'function') {
        return requestIdleCallback(() => setNear(true), { timeout });
      }
      const t = setTimeout(() => setNear(true), Math.min(timeout, 200));
      return () => clearTimeout(t);
    };

    // IO 不支持时直接挂
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }

    // 方式 1：后台错峰挂载（主要路径）
    const idleHandle = scheduleMount(1200 + seq.current * 600);

    // 方式 2：快速滚动接近时兜底
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          scheduleMount(300);
        }
      },
      { rootMargin: '400px 0px' }
    );
    io.observe(node);

    return () => {
      io.disconnect();
      if (typeof idleHandle === 'function') idleHandle();
      else if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle);
    };
  }, [near]);

  return (
    <div ref={ref} className={className} style={near ? undefined : { minHeight }}>
      {near ? children : null}
    </div>
  );
}
