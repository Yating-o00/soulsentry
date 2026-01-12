import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 获取所有阅后即焚心签
        const burnNotes = await base44.asServiceRole.entities.Note.filter({
            is_burn_after_read: true,
            deleted_at: null
        });

        console.log(`检查 ${burnNotes.length} 条阅后即焚心签`);

        let deletedCount = 0;
        const now = Date.now();

        for (const note of burnNotes) {
            if (!note.last_interaction_time) {
                // 如果没有交互时间，使用创建时间
                const createdTime = new Date(note.created_date).getTime();
                const timeoutMs = (note.burn_timeout_minutes || 5) * 60 * 1000;
                
                if (now - createdTime > timeoutMs) {
                    await base44.asServiceRole.entities.Note.update(note.id, {
                        deleted_at: new Date().toISOString()
                    });
                    deletedCount++;
                    console.log(`删除过期心签: ${note.id} (基于创建时间)`);
                }
            } else {
                const lastInteraction = new Date(note.last_interaction_time).getTime();
                const timeoutMs = (note.burn_timeout_minutes || 5) * 60 * 1000;
                
                if (now - lastInteraction > timeoutMs) {
                    await base44.asServiceRole.entities.Note.update(note.id, {
                        deleted_at: new Date().toISOString()
                    });
                    deletedCount++;
                    console.log(`删除过期心签: ${note.id}`);
                }
            }
        }

        return Response.json({ 
            success: true, 
            message: `清理完成，删除了 ${deletedCount} 条过期心签`,
            checked: burnNotes.length,
            deleted: deletedCount
        });
    } catch (error) {
        console.error('清理失败:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});