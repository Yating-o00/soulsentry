import React from 'react';

// 模块级串行队列:所有 DeferredMount 实例的挂载沿这条链依次执行,
// 每个挂载之间留 280ms 空隙,保证任何浏览器上都是真正的错峰
// （requestIdleCallback 在 iOS Safari 上不存在,之前的兜底会让所有板块
//   在首帧后同时挂载,失去错峰意义）。
let mountChain = Promise.resolve();

function enqueueMount(gapMs) {
  const run = () =>
    new Promise((resolve) => {
      setTimeout(() => {
        // 组件可能已卸载, React 对卸载组件的 setState 是安全的 no-op
        resolve();
      }, gapMs);
    });
  mountChain = mountChain.then(run);
  return mountChain;
}

/**
 * 延迟挂载子树（两条触发路径，都走同一条串行队列，先到先挂）：
 * 1. 后台错峰挂载 —— 首屏渲染后,各板块沿串行链依次挂载,间隔 280ms。
 *    用户手指开始滑动时下方板块基本已就绪,滚动途中不再有挂载重活。
 * 2. 滚动接近兜底 —— 快速下滑到未挂载区域时由 IntersectionObserver 触发,
 *    同样排进队列（只等当前进行中的挂载完成,不再额外等 1.2s）。
 *
 * 背景:之前用 requestIdleCallback + timeout 兜底,iOS Safari 不支持 rIC,
 * 兜底把所有板块的挂载压到同一时刻,首次滑动时仍"边滑边挂载"导致卡顿,
 * 且滚动条（依赖主线程合成）在卡顿瞬间消失。
 */
export default function DeferredMount({ children, minHeight = 420, className = '' }) {
  const ref = React.useRef(null);
  const [near, setNear] = React.useState(false);

  React.useEffect(() => {
    if (near) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      enqueueMount(0).then(() => setNear(true));
      return;
    }

    // 路径 1:后台错峰（首屏渲染后链式挂载,间隔 280ms）
    enqueueMount(280).then(() => setNear(true));

    // 路径 2:快速滚动接近时兜底,排进同一条链
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          enqueueMount(0).then(() => setNear(true));
        }
      },
      { rootMargin: '400px 0px' }
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
