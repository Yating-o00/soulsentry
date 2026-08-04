-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "subscriptionPlan" TEXT NOT NULL DEFAULT 'free',
    "aiCredits" INTEGER NOT NULL DEFAULT 200,
    "themePreferences" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "locationReminders" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT,
    "dueAt" DATETIME,
    "reminderTime" DATETIME,
    "endTime" DATETIME,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "parentTaskId" TEXT,
    "gcalSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "deletedAt" DATETIME,
    "tags" JSONB,
    "reminderStrategy" JSONB,
    "metadata" JSONB,
    "shareToken" TEXT,
    "shareEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "plainText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "color" TEXT,
    "sourceType" TEXT,
    "aiStatus" TEXT,
    "deletedAt" DATETIME,
    "tags" JSONB,
    "shareToken" TEXT,
    "shareEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "conditionCategory" TEXT NOT NULL DEFAULT 'all',
    "conditionPriority" TEXT NOT NULL DEFAULT 'all',
    "actionMute" BOOLEAN NOT NULL DEFAULT false,
    "actionSound" TEXT NOT NULL DEFAULT 'default',
    "actionChannels" JSONB,
    "actionAdvanceMinutes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserBehavior" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "taskId" TEXT,
    "hourOfDay" INTEGER,
    "dayOfWeek" INTEGER,
    "category" TEXT,
    "responseTimeSeconds" INTEGER,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserBehavior_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AICreditTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "feature" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AICreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "taskTitle" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'task',
    "executionStatus" TEXT NOT NULL DEFAULT 'parsing',
    "originalInput" TEXT,
    "aiParsedResult" JSONB,
    "executionSteps" JSONB,
    "errorMessage" TEXT,
    "completedAt" DATETIME,
    "automationType" TEXT NOT NULL DEFAULT 'none',
    "automationPlan" JSONB,
    "automationResult" JSONB,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "userFeedback" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planDate" TEXT NOT NULL,
    "originalInput" TEXT,
    "theme" TEXT,
    "summary" TEXT,
    "planJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekStartDate" TEXT NOT NULL,
    "originalInput" TEXT,
    "theme" TEXT,
    "summary" TEXT,
    "planJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "monthStartDate" TEXT NOT NULL,
    "originalInput" TEXT,
    "theme" TEXT,
    "summary" TEXT,
    "planJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "visitorToken" TEXT,
    "visitorName" TEXT,
    "noteId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NoteComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteComment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WechatOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "description" TEXT,
    "codeUrl" TEXT,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WechatOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "category" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "tags" JSONB,
    "keyPoints" JSONB,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "embeddingSummary" TEXT,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeBase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT,
    "nameCustomized" BOOLEAN NOT NULL DEFAULT false,
    "deviceType" TEXT NOT NULL DEFAULT 'other',
    "role" TEXT NOT NULL DEFAULT 'secondary',
    "platform" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "screenSize" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" DATETIME,
    "pushSubscription" JSONB,
    "capabilities" JSONB,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationType" TEXT NOT NULL DEFAULT 'other',
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "radius" INTEGER NOT NULL DEFAULT 200,
    "address" TEXT,
    "icon" TEXT DEFAULT '📍',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerOn" TEXT NOT NULL DEFAULT 'enter',
    "lastEnteredAt" DATETIME,
    "lastExitedAt" DATETIME,
    "quietMinutes" INTEGER NOT NULL DEFAULT 30,
    "quietPolicy" JSONB,
    "notificationStats" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskDeferralLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskTitle" TEXT,
    "originalTime" DATETIME,
    "deferredTo" DATETIME,
    "reasonCategory" TEXT NOT NULL DEFAULT 'other',
    "missingPrerequisite" TEXT,
    "reasonNote" TEXT,
    "carryToNextPlan" BOOLEAN NOT NULL DEFAULT true,
    "consumedInReplanAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskDeferralLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "relationshipType" TEXT NOT NULL DEFAULT 'friend',
    "closeness" INTEGER NOT NULL DEFAULT 5,
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "lastInteractionDate" DATETIME,
    "favors" JSONB,
    "notes" TEXT,
    "tags" JSONB,
    "preferredContactTime" TEXT,
    "contactFrequencyDays" INTEGER NOT NULL DEFAULT 30,
    "avatarColor" TEXT DEFAULT '#384877',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Relationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "visitorToken" TEXT,
    "visitorName" TEXT,
    "taskId" TEXT,
    "noteId" TEXT,
    "content" TEXT NOT NULL,
    "mentions" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SharedActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareToken" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "visitorToken" TEXT NOT NULL,
    "visitorName" TEXT,
    "actionType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TaskCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "completedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskChangeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "changeType" TEXT NOT NULL,
    "taskTitle" TEXT,
    "changedFields" JSONB,
    "changesDetail" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateData" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "content" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,
    "adminReply" TEXT,
    "images" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalFeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feedType" TEXT NOT NULL DEFAULT 'rss',
    "url" TEXT,
    "description" TEXT,
    "icon" TEXT DEFAULT '📡',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fetchFrequencyHours" INTEGER NOT NULL DEFAULT 24,
    "lastFetchedAt" DATETIME,
    "lastItemCount" INTEGER NOT NULL DEFAULT 0,
    "autoArchiveToHeartsign" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserDataPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "subtype" TEXT,
    "summary" TEXT NOT NULL,
    "category" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "tags" JSONB,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hourOfDay" INTEGER,
    "dayOfWeek" INTEGER,
    "relatedTaskId" TEXT,
    "relatedNoteId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserDataPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_shareToken_key" ON "Task"("shareToken");

-- CreateIndex
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");

-- CreateIndex
CREATE INDEX "Task_userId_dueAt_idx" ON "Task"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "Task_userId_reminderTime_idx" ON "Task"("userId", "reminderTime");

-- CreateIndex
CREATE INDEX "Task_userId_deletedAt_idx" ON "Task"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_shareEnabled_shareExpiresAt_idx" ON "Task"("shareEnabled", "shareExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Note_shareToken_key" ON "Note"("shareToken");

-- CreateIndex
CREATE INDEX "Note_userId_status_idx" ON "Note"("userId", "status");

-- CreateIndex
CREATE INDEX "Note_userId_deletedAt_idx" ON "Note"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Note_shareEnabled_shareExpiresAt_idx" ON "Note"("shareEnabled", "shareExpiresAt");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "NotificationRule_userId_isEnabled_idx" ON "NotificationRule"("userId", "isEnabled");

-- CreateIndex
CREATE INDEX "NotificationRule_userId_conditionCategory_conditionPriority_idx" ON "NotificationRule"("userId", "conditionCategory", "conditionPriority");

-- CreateIndex
CREATE INDEX "NotificationRule_userId_createdAt_idx" ON "NotificationRule"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserBehavior_userId_eventType_idx" ON "UserBehavior"("userId", "eventType");

-- CreateIndex
CREATE INDEX "UserBehavior_userId_taskId_idx" ON "UserBehavior"("userId", "taskId");

-- CreateIndex
CREATE INDEX "UserBehavior_userId_createdAt_idx" ON "UserBehavior"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserBehavior_userId_category_idx" ON "UserBehavior"("userId", "category");

-- CreateIndex
CREATE INDEX "AICreditTransaction_userId_createdAt_idx" ON "AICreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskExecution_userId_createdAt_idx" ON "TaskExecution"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskExecution_userId_taskId_idx" ON "TaskExecution"("userId", "taskId");

-- CreateIndex
CREATE INDEX "TaskExecution_userId_executionStatus_idx" ON "TaskExecution"("userId", "executionStatus");

-- CreateIndex
CREATE INDEX "TaskExecution_userId_completedAt_idx" ON "TaskExecution"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "DailyPlan_userId_planDate_idx" ON "DailyPlan"("userId", "planDate");

-- CreateIndex
CREATE INDEX "DailyPlan_userId_isActive_idx" ON "DailyPlan"("userId", "isActive");

-- CreateIndex
CREATE INDEX "DailyPlan_userId_createdAt_idx" ON "DailyPlan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyPlan_userId_weekStartDate_idx" ON "WeeklyPlan"("userId", "weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyPlan_userId_isActive_idx" ON "WeeklyPlan"("userId", "isActive");

-- CreateIndex
CREATE INDEX "WeeklyPlan_userId_createdAt_idx" ON "WeeklyPlan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyPlan_userId_updatedAt_idx" ON "WeeklyPlan"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "MonthlyPlan_userId_monthStartDate_idx" ON "MonthlyPlan"("userId", "monthStartDate");

-- CreateIndex
CREATE INDEX "MonthlyPlan_userId_isActive_idx" ON "MonthlyPlan"("userId", "isActive");

-- CreateIndex
CREATE INDEX "MonthlyPlan_userId_createdAt_idx" ON "MonthlyPlan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MonthlyPlan_userId_updatedAt_idx" ON "MonthlyPlan"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "NoteComment_userId_createdAt_idx" ON "NoteComment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NoteComment_noteId_createdAt_idx" ON "NoteComment"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "NoteComment_visitorToken_createdAt_idx" ON "NoteComment"("visitorToken", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WechatOrder_orderNo_key" ON "WechatOrder"("orderNo");

-- CreateIndex
CREATE INDEX "WechatOrder_userId_status_idx" ON "WechatOrder"("userId", "status");

-- CreateIndex
CREATE INDEX "WechatOrder_userId_createdAt_idx" ON "WechatOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_createdAt_idx" ON "KnowledgeBase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_updatedAt_idx" ON "KnowledgeBase"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_category_idx" ON "KnowledgeBase"("userId", "category");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_importance_idx" ON "KnowledgeBase"("userId", "importance");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_accessCount_idx" ON "KnowledgeBase"("userId", "accessCount");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_lastAccessed_idx" ON "KnowledgeBase"("userId", "lastAccessed");

-- CreateIndex
CREATE INDEX "Device_userId_deviceId_idx" ON "Device"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "Device_userId_lastSeenAt_idx" ON "Device"("userId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "Device_userId_isOnline_idx" ON "Device"("userId", "isOnline");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_deviceId_key" ON "Device"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "SavedLocation_userId_isActive_idx" ON "SavedLocation"("userId", "isActive");

-- CreateIndex
CREATE INDEX "SavedLocation_userId_locationType_idx" ON "SavedLocation"("userId", "locationType");

-- CreateIndex
CREATE INDEX "SavedLocation_userId_updatedAt_idx" ON "SavedLocation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskDeferralLog_userId_taskId_idx" ON "TaskDeferralLog"("userId", "taskId");

-- CreateIndex
CREATE INDEX "TaskDeferralLog_userId_carryToNextPlan_idx" ON "TaskDeferralLog"("userId", "carryToNextPlan");

-- CreateIndex
CREATE INDEX "TaskDeferralLog_userId_createdAt_idx" ON "TaskDeferralLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskDeferralLog_userId_consumedInReplanAt_idx" ON "TaskDeferralLog"("userId", "consumedInReplanAt");

-- CreateIndex
CREATE INDEX "Relationship_userId_relationshipType_idx" ON "Relationship"("userId", "relationshipType");

-- CreateIndex
CREATE INDEX "Relationship_userId_lastInteractionDate_idx" ON "Relationship"("userId", "lastInteractionDate");

-- CreateIndex
CREATE INDEX "Relationship_userId_createdAt_idx" ON "Relationship"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_taskId_createdAt_idx" ON "Comment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_noteId_createdAt_idx" ON "Comment"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_userId_createdAt_idx" ON "Comment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_visitorToken_createdAt_idx" ON "Comment"("visitorToken", "createdAt");

-- CreateIndex
CREATE INDEX "SharedActionLog_shareToken_createdAt_idx" ON "SharedActionLog"("shareToken", "createdAt");

-- CreateIndex
CREATE INDEX "SharedActionLog_targetType_targetId_createdAt_idx" ON "SharedActionLog"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "SharedActionLog_visitorToken_createdAt_idx" ON "SharedActionLog"("visitorToken", "createdAt");

-- CreateIndex
CREATE INDEX "TaskCompletion_taskId_completedAt_idx" ON "TaskCompletion"("taskId", "completedAt");

-- CreateIndex
CREATE INDEX "TaskCompletion_userId_createdAt_idx" ON "TaskCompletion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskCompletion_userId_status_idx" ON "TaskCompletion"("userId", "status");

-- CreateIndex
CREATE INDEX "TaskChangeLog_userId_createdAt_idx" ON "TaskChangeLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskChangeLog_taskId_createdAt_idx" ON "TaskChangeLog"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskChangeLog_parentTaskId_createdAt_idx" ON "TaskChangeLog"("parentTaskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskChangeLog_userId_changeType_idx" ON "TaskChangeLog"("userId", "changeType");

-- CreateIndex
CREATE INDEX "TaskTemplate_userId_createdAt_idx" ON "TaskTemplate"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskTemplate_userId_updatedAt_idx" ON "TaskTemplate"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalFeed_userId_isActive_idx" ON "ExternalFeed"("userId", "isActive");

-- CreateIndex
CREATE INDEX "ExternalFeed_userId_createdAt_idx" ON "ExternalFeed"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalFeed_userId_lastFetchedAt_idx" ON "ExternalFeed"("userId", "lastFetchedAt");

-- CreateIndex
CREATE INDEX "UserDataPoint_userId_dataType_createdAt_idx" ON "UserDataPoint"("userId", "dataType", "createdAt");

-- CreateIndex
CREATE INDEX "UserDataPoint_userId_occurredAt_idx" ON "UserDataPoint"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "UserDataPoint_userId_category_idx" ON "UserDataPoint"("userId", "category");

-- CreateIndex
CREATE INDEX "SmsVerification_phone_purpose_createdAt_idx" ON "SmsVerification"("phone", "purpose", "createdAt");
