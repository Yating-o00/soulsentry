import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * 定期清理过期的临时心签
 * 建议通过定时任务每分钟运行一次
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // 使用 service role 权限来删除过期的临时心签
    const notes = await base44.asServiceRole.entities.Note.filter({
      is_ephemeral: true,
      deleted_at: null
    });

    if (!notes || notes.length === 0) {
      return Response.json({ 
        success: true, 
        message: '没有需要清理的临时心签',
        deleted_count: 0 
      });
    }

    const now = new Date();
    let deletedCount = 0;

    for (const note of notes) {
      if (!note.ephemeral_expires_at) continue;

      const expiresAt = new Date(note.ephemeral_expires_at);
      
      // 如果已过期，软删除
      if (now >= expiresAt) {
        await base44.asServiceRole.entities.Note.update(note.id, {
          deleted_at: now.toISOString()
        });
        deletedCount++;
      }
    }

    return Response.json({ 
      success: true, 
      message: `成功清理 ${deletedCount} 个过期临时心签`,
      deleted_count: deletedCount,
      checked_count: notes.length
    });

  } catch (error) {
    console.error('清理临时心签失败:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});