import React, { useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { RefreshCw, Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export default function PullToRefresh({
  children,
  onRefresh,
  threshold = 80
}: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const y = useMotionValue(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const opacity = useTransform(y, [0, threshold], [0, 1]);
  const rotation = useTransform(y, [0, threshold], [0, 360]);
  const scale = useTransform(y, [0, threshold], [0.5, 1]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0) {
      e.preventDefault();
      y.set(Math.min(diff, threshold * 1.5));
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;

    setIsPulling(false);

    if (y.get() >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      y.set(threshold);

      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
        y.set(0);
      }
    } else {
      y.set(0);
    }
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative overflow-auto h-full"
    >
      {/* 下拉指示器 */}
      <motion.div
        className="absolute top-0 left-0 right-0 flex items-center justify-center"
        style={{
          y: useTransform(y, [0, threshold], [-50, 0]),
          opacity
        }}
      >
        <motion.div
          className="flex items-center justify-center gap-2 bg-white rounded-full px-4 py-2 shadow-lg"
          style={{ scale }}
        >
          {isRefreshing ? (
            <>
              <Loader2 className="w-5 h-5 text-[#384877] animate-spin" />
              <span className="text-sm font-medium text-slate-700">刷新中...</span>
            </>
          ) : (
            <>
              <motion.div style={{ rotate: rotation }}>
                <RefreshCw className="w-5 h-5 text-[#384877]" />
              </motion.div>
              <span className="text-sm font-medium text-slate-700">
                {y.get() >= threshold ? '松开刷新' : '下拉刷新'}
              </span>
            </>
          )}
        </motion.div>
      </motion.div>

      {/* 内容 */}
      <motion.div
        style={{
          y: isRefreshing ? threshold : y
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}