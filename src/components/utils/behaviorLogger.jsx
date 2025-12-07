
import { base44 } from "@/api/base44Client";

export const logUserBehavior = async (eventType, task = {}, metadata = {}) => {
  try {
    const now = new Date();
    await base44.entities.UserBehavior.create({
      event_type: eventType,
      task_id: task.id || null,
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
      category: task.category || null,
      metadata: metadata
    });
  } catch (error) {
    console.error("Failed to log user behavior:", error);
  }
};
