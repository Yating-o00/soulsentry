import { useCallback, useRef } from 'react';

// 交错揭示：进入视口时给 .reveal 元素打上 data-revealed
// 从参考稿 hooks/useReveal.ts 移植，改为 callback ref：
// 页签切换导致容器重新挂载时会自动重新建立观察
export function useRevealRoot() {
  const cleanupRef = useRef(null);

  return useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!node) return;

    const revealAll = () => {
      node.querySelectorAll('.reveal').forEach((el) => {
        el.dataset.revealed = 'true';
      });
    };

    if (typeof IntersectionObserver === 'undefined') {
      revealAll();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.dataset.revealed = 'true';
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    node.querySelectorAll('.reveal').forEach((el) => io.observe(el));

    // 动态新增的 .reveal（如页签内容延迟渲染）也纳入观察
    const mo = new MutationObserver(() => {
      node.querySelectorAll('.reveal:not([data-revealed="true"])').forEach((el) => io.observe(el));
    });
    mo.observe(node, { childList: true, subtree: true });

    cleanupRef.current = () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
