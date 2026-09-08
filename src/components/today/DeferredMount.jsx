import React from 'react';

/**
 * 临近视口才挂载子树。
 * 今日页首屏只渲染 Hero + 今日印记;其余板块在滚动接近前不挂载,
 * 避免首次打开时所有重组件(心境分析/守护/编织/设备协同/简报)同时初始化,
 * 与滚动手势争抢主线程造成卡顿。
 * 占位高度保持滚动条大致稳定,IO 不支持时直接挂载。
 */
export default function DeferredMount({ children, minHeight = 420, className = '' }) {
  const ref = React.useRef(null);
  const [near, setNear] = React.useState(false);

  React.useEffect(() => {
    if (near) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          // 等浏览器空闲再挂载,避免在滚动手势的同帧里
          // 一次性初始化重组件 + 齐发查询,造成滚动中段卡顿。
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => setNear(true), { timeout: 300 });
          } else {
            setTimeout(() => setNear(true), 60);
          }
        }
      },
      // 预挂载距离缩小:500px 窗口让各板块错帧挂载,而不是 1000px 内集中触发
      { rootMargin: '500px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [near]);

  return (
    <div ref={ref} className={className} style={near ? undefined : { minHeight }}>
      {near ? children : null}
    </div>
  );
}
