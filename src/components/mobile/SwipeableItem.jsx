import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Trash2, Archive, Star, Edit } from 'lucide-react';

interface SwipeAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  onAction: () => void;
}

interface SwipeableItemProps {
  children: React.ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  threshold?: number;
}

export default function SwipeableItem({
  children,
  leftActions = [],
  rightActions = [],
  threshold = 80
}: SwipeableItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const backgroundColor = useTransform(
    x,
    [-threshold, 0, threshold],
    ['rgba(239, 68, 68, 0.1)', 'rgba(255, 255, 255, 0)', 'rgba(34, 197, 94, 0.1)']
  );

  const handleDragEnd = (event: any, info: PanInfo) => {
    setIsDragging(false);
    
    const offset = info.offset.x;
    
    // 右滑（显示左侧操作）
    if (offset > threshold && leftActions.length > 0) {
      leftActions[0].onAction();
    }
    // 左滑（显示右侧操作）
    else if (offset < -threshold && rightActions.length > 0) {
      rightActions[0].onAction();
    }
    
    // 重置位置
    x.set(0);
  };

  return (
    <div className="relative overflow-hidden" ref={containerRef}>
      {/* 左侧操作按钮背景 */}
      {leftActions.length > 0 && (
        <motion.div
          className="absolute inset-y-0 left-0 flex items-center pl-4"
          style={{
            opacity: useTransform(x, [0, threshold], [0, 1])
          }}
        >
          {leftActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <div
                key={index}
                className={`flex items-center gap-2 ${action.color}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{action.label}</span>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* 右侧操作按钮背景 */}
      {rightActions.length > 0 && (
        <motion.div
          className="absolute inset-y-0 right-0 flex items-center pr-4"
          style={{
            opacity: useTransform(x, [-threshold, 0], [1, 0])
          }}
        >
          {rightActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <div
                key={index}
                className={`flex items-center gap-2 ${action.color}`}
              >
                <span className="text-sm font-medium">{action.label}</span>
                <Icon className="w-5 h-5" />
              </div>
            );
          })}
        </motion.div>
      )}

      {/* 可滑动内容 */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ 
          x,
          backgroundColor
        }}
        className={`relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {children}
      </motion.div>
    </div>
  );
}

// 预设的滑动操作
export const SwipeActions = {
  delete: (onDelete: () => void): SwipeAction => ({
    icon: Trash2,
    label: '删除',
    color: 'text-red-600',
    onAction: onDelete
  }),
  archive: (onArchive: () => void): SwipeAction => ({
    icon: Archive,
    label: '归档',
    color: 'text-blue-600',
    onAction: onArchive
  }),
  favorite: (onFavorite: () => void): SwipeAction => ({
    icon: Star,
    label: '收藏',
    color: 'text-yellow-600',
    onAction: onFavorite
  }),
  edit: (onEdit: () => void): SwipeAction => ({
    icon: Edit,
    label: '编辑',
    color: 'text-purple-600',
    onAction: onEdit
  })
};