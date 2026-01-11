import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function EphemeralNotesCleaner() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const checkAndCleanEphemeralNotes = async () => {
      try {
        // Fetch all ephemeral notes
        const ephemeralNotes = await base44.entities.Note.filter({
          is_ephemeral: true,
          deleted_at: null
        });

        if (!ephemeralNotes || ephemeralNotes.length === 0) return;

        const now = Date.now();
        const expiredNotes = [];

        for (const note of ephemeralNotes) {
          if (!note.last_active_at) continue;

          const lastActive = new Date(note.last_active_at).getTime();
          const ttl = (note.ephemeral_ttl_minutes || 5) * 60 * 1000;
          const expiresAt = lastActive + ttl;

          if (now >= expiresAt) {
            expiredNotes.push(note);
          }
        }

        // Delete expired notes
        if (expiredNotes.length > 0) {
          for (const note of expiredNotes) {
            await base44.entities.Note.update(note.id, {
              deleted_at: new Date().toISOString()
            });
          }

          // Invalidate queries to refresh UI
          queryClient.invalidateQueries(['notes']);
          
          // Show notification
          if (expiredNotes.length === 1) {
            toast.info("🔥 1个临时心签已自动删除");
          } else {
            toast.info(`🔥 ${expiredNotes.length}个临时心签已自动删除`);
          }
        }
      } catch (error) {
        console.error("清理临时心签失败:", error);
      }
    };

    // Check immediately
    checkAndCleanEphemeralNotes();

    // Then check every 30 seconds
    const interval = setInterval(checkAndCleanEphemeralNotes, 30000);

    return () => clearInterval(interval);
  }, [queryClient]);

  return null; // This is a background component
}