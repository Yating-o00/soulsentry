import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all notes with burn_after_read enabled
    const burnNotes = await base44.asServiceRole.entities.Note.filter({
      burn_after_read: true
    });

    const now = Date.now();
    let deletedCount = 0;

    for (const note of burnNotes) {
      // Skip already deleted notes
      if (note.deleted_at) continue;
      
      // Skip if no last_interaction_at (shouldn't happen but safety check)
      if (!note.last_interaction_at) continue;

      const lastInteraction = new Date(note.last_interaction_at).getTime();
      const burnTimeMs = (note.burn_timeout_minutes || 5) * 60 * 1000;
      const expiryTime = lastInteraction + burnTimeMs;

      // Delete if expired
      if (now >= expiryTime) {
        await base44.asServiceRole.entities.Note.delete(note.id);
        deletedCount++;
        console.log(`Deleted expired burn note: ${note.id}`);
      }
    }

    return Response.json({
      success: true,
      message: `Cleanup complete. Deleted ${deletedCount} expired burn-after-read notes.`,
      deleted_count: deletedCount,
      checked_notes: burnNotes.length
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});