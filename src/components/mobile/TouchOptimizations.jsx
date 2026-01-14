import { useEffect } from 'react';

export function useTouchOptimizations() {
  useEffect(() => {
    // 禁用双击缩放
    let lastTouchEnd = 0;
    const preventDoubleTapZoom = (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    };

    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

    // 优化滚动性能
    document.body.style.webkitOverflowScrolling = 'touch';
    document.body.style.overscrollBehavior = 'contain';

    // 添加 touch-action 优化
    const addTouchAction = () => {
      const interactiveElements = document.querySelectorAll('button, a, [role="button"], input, textarea, select');
      interactiveElements.forEach(el => {
        if (!el.style.touchAction) {
          el.style.touchAction = 'manipulation';
        }
      });
    };

    addTouchAction();
    const observer = new MutationObserver(addTouchAction);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('touchend', preventDoubleTapZoom);
      observer.disconnect();
    };
  }, []);
}

export function useHapticFeedback() {
  const triggerHaptic = (type = 'light') => {
    if (!navigator.vibrate) return;

    const patterns = {
      light: [10],
      medium: [30],
      heavy: [50],
      success: [10, 30, 10],
      error: [50, 100, 50],
      selection: [5]
    };

    navigator.vibrate(patterns[type] || patterns.light);
  };

  return triggerHaptic;
}

// 优化的触摸手势 Hook
export function useSwipeGesture(onSwipe, threshold = 50) {
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipe();
    };

    const handleSwipe = () => {
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
        onSwipe(deltaX > 0 ? 'right' : 'left');
      } else if (Math.abs(deltaY) > threshold) {
        onSwipe(deltaY > 0 ? 'down' : 'up');
      }
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipe, threshold]);
}