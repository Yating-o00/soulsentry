import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 使用 service role 权限清理过期笔记
        const notes = await base44.asServiceRole.entities.Note.filter({
            is_burn_after_reading: true,
            deleted_at: null
        });

        const now = new Date();
        let deletedCount = 0;

        for (const note of notes) {
            if (!note.last_active_at) continue;

            const lastActive = new Date(note.last_active_at);
            const expiresAt = new Date(lastActive.getTime() + (note.burn_duration_minutes || 5) * 60 * 1000);

            if (now >= expiresAt) {
                // 软删除过期笔记
                await base44.asServiceRole.entities.Note.update(note.id, {
                    deleted_at: now.toISOString()
                });
                deletedCount++;
            }
        }

        return Response.json({
            success: true,
            message: `已清理 ${deletedCount} 条过期阅后即焚笔记`,
            deletedCount
        });
    } catch (error) {
        console.error('清理阅后即焚笔记失败:', error);
        return Response.json({
            error: error.message
        }, { status: 500 });
    }
});