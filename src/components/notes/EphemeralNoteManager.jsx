import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * 临时心签管理器
 * 在前端定期检查并更新即将过期的临时心签倒计时
 */
export function useEphemeralNoteManager(notes) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!notes || notes.length === 0) return;

    const ephemeralNotes = notes.filter(note => 
      note.is_ephemeral && 
      note.ephemeral_expires_at &&
      !note.deleted_at
    );

    if (ephemeralNotes.length === 0) return;

    // 每秒检查一次过期情况
    const interval = setInterval(async () => {
      const now = new Date();
      
      for (const note of ephemeralNotes) {
        const expiresAt = new Date(note.ephemeral_expires_at);
        
        // 如果已过期，软删除
        if (now >= expiresAt) {
          try {
            await base44.entities.Note.update(note.id, {
              deleted_at: new Date().toISOString()
            });
            
            // 刷新查询
            queryClient.invalidateQueries({ queryKey: ['notes'] });
          } catch (error) {
            console.error('删除过期临时心签失败:', error);
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [notes, queryClient]);
}

/**
 * 计算临时心签剩余时间
 */
export function getEphemeralTimeRemaining(expiresAt) {
  if (!expiresAt) return null;
  
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires - now;
  
  if (diffMs <= 0) return { expired: true };
  
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  
  return {
    expired: false,
    minutes,
    seconds,
    total: diffMs,
    percentage: Math.max(0, Math.min(100, (diffMs / (5 * 60 * 1000)) * 100))
  };
}