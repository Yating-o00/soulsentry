import { httpRequest, setAccessToken, getAccessToken } from "./httpClient";

function unsupported(target, method) {
  throw new Error(`独立后端尚未实现 ${target}.${method}，请先完成对应模块迁移`);
}

const DEMO_EMAIL = "demo@soulsentry.local";
const DEMO_PASSWORD = "demo123456";

async function ensureStandaloneSession() {
  if (getAccessToken()) return true;

  const result = await httpRequest("/api/auth/login", {
    method: "POST",
    body: {
      type: "email",
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD
    }
  });

  if (result?.token) {
    setAccessToken(result.token);
    return true;
  }

  return false;
}

function createPlanEntity(basePath) {
  return {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}?sort=${encodeURIComponent(sort)}&limit=${limit}`);
    },
    async filter(filters = {}, sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const text = String(value);
        if (!text) return;
        params.set(key, text);
      });
      params.set("sort", sort);
      params.set("limit", String(limit));
      return httpRequest(`${basePath}?${params.toString()}`);
    },
    async get(id) {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}/${id}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest(basePath, {
        method: "POST",
        body: data
      });
    },
    async update(id, data) {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}/${id}`, {
        method: "PATCH",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported(`entities.${basePath}`, "subscribe");
    }
  };
}

function createTaskEntity() {
  return {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/tasks?sort=${encodeURIComponent(sort)}&limit=${limit}`);
    },
    async filter(filters = {}, sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const text = typeof value === "boolean" ? String(value) : String(value).trim();
        if (!text) return;
        params.set(key, text);
      });
      params.set("sort", sort);
      params.set("limit", String(limit));
      return httpRequest(`/api/tasks?${params.toString()}`);
    },
    async get(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/tasks/${id}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest("/api/tasks", {
        method: "POST",
        body: data
      });
    },
    async bulkCreate(items = []) {
      await ensureStandaloneSession();
      return httpRequest("/api/tasks/batch", {
        method: "POST",
        body: items
      });
    },
    async update(id, data) {
      await ensureStandaloneSession();
      return httpRequest(`/api/tasks/${id}`, {
        method: "PATCH",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/tasks/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported("entities.Task", "subscribe");
    }
  };
}

function createNoteEntity() {
  return {
    async list(sort = "-updated_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/notes?sort=${encodeURIComponent(sort)}&limit=${limit}`);
    },
    async get(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/notes/${id}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest("/api/notes", {
        method: "POST",
        body: data
      });
    },
    async update(id, data) {
      await ensureStandaloneSession();
      return httpRequest(`/api/notes/${id}`, {
        method: "PATCH",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/notes/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported("entities.Note", "subscribe");
    }
  };
}

function createTaskExecutionEntity() {
  return {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/task-executions?sort=${encodeURIComponent(sort)}&limit=${limit}`);
    },
    async filter(filters = {}, sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const text = String(value);
        if (!text) return;
        params.set(key, text);
      });
      params.set("sort", sort);
      params.set("limit", String(limit));
      return httpRequest(`/api/task-executions?${params.toString()}`);
    },
    async get(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/task-executions/${id}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest("/api/task-executions", {
        method: "POST",
        body: data
      });
    },
    async update(id, data) {
      await ensureStandaloneSession();
      return httpRequest(`/api/task-executions/${id}`, {
        method: "PATCH",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/task-executions/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported("entities.TaskExecution", "subscribe");
    }
  };
}

function createSavedLocationEntity() {
  return {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/saved-locations?sort=${encodeURIComponent(sort)}&limit=${limit}`);
    },
    async filter(filters = {}, sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const text = String(value);
        if (!text) return;
        params.set(key, text);
      });
      params.set("sort", sort);
      params.set("limit", String(limit));
      return httpRequest(`/api/saved-locations?${params.toString()}`);
    },
    async get(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/saved-locations/${id}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest("/api/saved-locations", {
        method: "POST",
        body: data
      });
    },
    async bulkCreate(items = []) {
      await ensureStandaloneSession();
      return httpRequest("/api/saved-locations/batch", {
        method: "POST",
        body: items
      });
    },
    async update(id, data) {
      await ensureStandaloneSession();
      return httpRequest(`/api/saved-locations/${id}`, {
        method: "PATCH",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/saved-locations/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported("entities.SavedLocation", "subscribe");
    }
  };
}

function createNotificationRuleEntity() {
  return {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/notification-rules?sort=${encodeURIComponent(sort)}&limit=${limit}`);
    },
    async filter(filters = {}, sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const text = String(value);
        if (!text) return;
        params.set(key, text);
      });
      params.set("sort", sort);
      params.set("limit", String(limit));
      return httpRequest(`/api/notification-rules?${params.toString()}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest("/api/notification-rules", {
        method: "POST",
        body: data
      });
    },
    async update(id, data) {
      await ensureStandaloneSession();
      return httpRequest(`/api/notification-rules/${id}`, {
        method: "PATCH",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/notification-rules/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported("entities.NotificationRule", "subscribe");
    }
  };
}

// 通用 REST 实体工厂：映射标准 list/filter/get/create/update/delete 到 /api/{basePath}
function createStandardEntity(basePath, { includeGet = true, includeBulkCreate = false } = {}) {
  const entity = {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}?sort=${encodeURIComponent(sort)}&limit=${limit}`);
    },
    async filter(filters = {}, sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const text = typeof value === "boolean" ? String(value) : String(value).trim();
        if (!text) return;
        params.set(key, text);
      });
      params.set("sort", sort);
      params.set("limit", String(limit));
      return httpRequest(`${basePath}?${params.toString()}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest(basePath, {
        method: "POST",
        body: data
      });
    },
    async update(id, data) {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}/${id}`, {
        method: "PATCH",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported(`entities.${basePath}`, "subscribe");
    }
  };

  if (includeGet) {
    entity.get = async (id) => {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}/${id}`);
    };
  }

  if (includeBulkCreate) {
    entity.bulkCreate = async (items = []) => {
      await ensureStandaloneSession();
      return httpRequest(`${basePath}/batch`, {
        method: "POST",
        body: items
      });
    };
  }

  return entity;
}

// 后端尚未提供独立路由的实体，返回静默空实现，避免前端因 "未实现" 抛错而卡死
function createMockEntity(entityName) {
  return {
    async list() { return []; },
    async filter() { return []; },
    async get() { return null; },
    async create(data) { return { id: `mock-${Date.now()}`, ...data }; },
    async update(id, data) { return { id, ...data }; },
    async delete() { return true; },
    async bulkCreate(items = []) { return items.map((item, i) => ({ id: `mock-${Date.now()}-${i}`, ...item })); },
    subscribe() { return () => {}; }
  };
}

function createEntityProxy() {
  return new Proxy(
    {},
    {
      get(_target, entityName) {
        if (entityName === "Task") {
          return createTaskEntity();
        }

        if (entityName === "Note") {
          return createNoteEntity();
        }

        if (entityName === "TaskExecution") {
          return createTaskExecutionEntity();
        }

        if (entityName === "SavedLocation") {
          return createSavedLocationEntity();
        }

        if (entityName === "NotificationRule") {
          return createNotificationRuleEntity();
        }

        if (entityName === "DailyPlan") {
          return createPlanEntity("/api/daily-plans");
        }

        if (entityName === "WeeklyPlan") {
          return createPlanEntity("/api/weekly-plans");
        }

        if (entityName === "MonthlyPlan") {
          return createPlanEntity("/api/monthly-plans");
        }

        // 已有后端 REST 路由的实体
        if (entityName === "UserPreference") {
          return createStandardEntity("/api/user-preferences", { includeGet: true });
        }
        if (entityName === "UserBehavior") {
          return createStandardEntity("/api/user-behaviors");
        }
        if (entityName === "Relationship") {
          return createStandardEntity("/api/relationships");
        }
        if (entityName === "KnowledgeBase") {
          return createStandardEntity("/api/knowledge-bases");
        }
        if (entityName === "ExternalFeed") {
          return createStandardEntity("/api/external-feeds");
        }
        if (entityName === "Comment") {
          return createStandardEntity("/api/comments");
        }
        if (entityName === "TaskCompletion") {
          return createStandardEntity("/api/task-completions");
        }
        if (entityName === "TaskChangeLog") {
          return createStandardEntity("/api/task-change-logs");
        }
        if (entityName === "MemoryRecord") {
          return createStandardEntity("/api/memory-records");
        }
        if (entityName === "Notification") {
          return createStandardEntity("/api/notifications");
        }

        // 后端暂无独立路由的实体：先给静默空实现，避免前端崩溃
        if (["Device", "UserDataPoint", "Feedback", "TaskDeferralLog", "TaskTemplate"].includes(entityName)) {
          return createMockEntity(entityName);
        }

        if (entityName === "AICreditTransaction") {
          return {
            async list() {
              await ensureStandaloneSession();
              return httpRequest("/api/credits/transactions");
            }
          };
        }

        return {
          async list() {
            unsupported(`entities.${String(entityName)}`, "list");
          },
          async get() {
            unsupported(`entities.${String(entityName)}`, "get");
          },
          async create() {
            unsupported(`entities.${String(entityName)}`, "create");
          },
          async update() {
            unsupported(`entities.${String(entityName)}`, "update");
          },
          async delete() {
            unsupported(`entities.${String(entityName)}`, "delete");
          },
          subscribe() {
            unsupported(`entities.${String(entityName)}`, "subscribe");
          }
        };
      }
    }
  );
}

export const standaloneClient = {
  auth: {
    async login(email, password) {
      const result = await httpRequest("/api/auth/login", {
        method: "POST",
        body: { type: "email", email, password }
      });
      setAccessToken(result.token);
      return result.user;
    },
    async register(payload) {
      const result = await httpRequest("/api/auth/register", {
        method: "POST",
        body: { type: "email", ...payload }
      });
      setAccessToken(result.token);
      return result.user;
    },
    async me() {
      await ensureStandaloneSession();
      const result = await httpRequest("/api/users/me");
      return result;
    },
    async updateMe(payload) {
      await ensureStandaloneSession();
      return httpRequest("/api/users/me", {
        method: "PATCH",
        body: payload
      });
    },
    isAuthenticated() {
      return Boolean(getAccessToken());
    },
    logout(redirectUrl) {
      setAccessToken(null);
      window.location.href = redirectUrl || "/login";
    },
    redirectToLogin(redirectUrl) {
      let safeRedirect = redirectUrl;
      if (safeRedirect) {
        try {
          const url = new URL(safeRedirect, window.location.origin);
          // 不要把登录页本身作为回调，避免 /login?redirect=/login?redirect=... 递归导致 URI 过长
          if (url.pathname === "/login" || url.pathname === "/Login") {
            safeRedirect = "/";
          } else {
            safeRedirect = url.pathname + url.search + url.hash;
          }
        } catch (e) {
          // 非法 URL 时降级到首页
          safeRedirect = "/";
        }
      }
      const target = safeRedirect ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : "/login";
      window.location.href = target;
    },
    async bootstrapDevSession() {
      await ensureStandaloneSession();
      return this.me();
    }
  },
  entities: createEntityProxy(),
  functions: {
    async invoke(name, payload = {}) {
      await ensureStandaloneSession();
      const data = await httpRequest(`/api/functions/${name}`, {
        method: "POST",
        body: payload
      });
      return { data };
    },
    async gemini() {
      unsupported("functions", "gemini");
    }
  },
  integrations: {
    Core: {
      async InvokeLLM(payload) {
        const { data } = await standaloneClient.functions.invoke("invokeKimi", {
          prompt: payload?.prompt,
          system_prompt: payload?.system_prompt,
          response_json_schema: payload?.response_json_schema,
          model: payload?.model,
          temperature: payload?.temperature
        });
        return data;
      },
      async SendEmail() {
        unsupported("integrations.Core", "SendEmail");
      },
      async SendSMS() {
        unsupported("integrations.Core", "SendSMS");
      },
      async UploadFile({ file }) {
        if (!file) {
          throw new Error("UploadFile 缺少 file 参数");
        }
        const formData = new FormData();
        formData.append("file", file);
        const result = await httpRequest("/api/uploads", {
          method: "POST",
          body: formData
        });
        return result;
      },
      async GenerateImage() {
        unsupported("integrations.Core", "GenerateImage");
      },
      async ExtractDataFromUploadedFile() {
        unsupported("integrations.Core", "ExtractDataFromUploadedFile");
      }
    }
  },
  appLogs: {
    async logUserInApp() {
      return null;
    }
  }
};
