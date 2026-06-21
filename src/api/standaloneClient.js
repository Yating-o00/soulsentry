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

function createDailyPlanEntity() {
  return {
    async list(sort = "-plan_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/daily-plans?sort=${encodeURIComponent(sort)}&limit=${limit}`);
    },
    async filter(filters = {}, sort = "-plan_date", limit = 100) {
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
      return httpRequest(`/api/daily-plans?${params.toString()}`);
    },
    async get(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/daily-plans/${id}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest("/api/daily-plans", {
        method: "POST",
        body: data
      });
    },
    async update(id, data) {
      await ensureStandaloneSession();
      return httpRequest(`/api/daily-plans/${id}`, {
        method: "PATCH",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/daily-plans/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported("entities.DailyPlan", "subscribe");
    }
  };
}

function createUserEntity() {
  return {
    async list(sort = "created_date", limit = 100) {
      await ensureStandaloneSession();
      const params = new URLSearchParams();
      params.set("sort", sort);
      params.set("limit", String(limit));
      return httpRequest(`/api/users?${params.toString()}`);
    },
    async get(id) {
      await ensureStandaloneSession();
      const users = await httpRequest("/api/users");
      return (users || []).find((item) => item.id === id) || null;
    },
    subscribe() {
      unsupported("entities.User", "subscribe");
    }
  };
}

function createCommentEntity() {
  return {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/comments?sort=${encodeURIComponent(sort)}&limit=${limit}`);
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
      return httpRequest(`/api/comments?${params.toString()}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest("/api/comments", {
        method: "POST",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/comments/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported("entities.Comment", "subscribe");
    }
  };
}

function createTaskCompletionEntity() {
  return {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/task-completions?sort=${encodeURIComponent(sort)}&limit=${limit}`);
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
      return httpRequest(`/api/task-completions?${params.toString()}`);
    },
    async create(data) {
      await ensureStandaloneSession();
      return httpRequest("/api/task-completions", {
        method: "POST",
        body: data
      });
    },
    async delete(id) {
      await ensureStandaloneSession();
      return httpRequest(`/api/task-completions/${id}`, {
        method: "DELETE"
      });
    },
    subscribe() {
      unsupported("entities.TaskCompletion", "subscribe");
    }
  };
}

function createTaskChangeLogEntity() {
  return {
    async list(sort = "-created_date", limit = 100) {
      await ensureStandaloneSession();
      return httpRequest(`/api/task-change-logs?sort=${encodeURIComponent(sort)}&limit=${limit}`);
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
      return httpRequest(`/api/task-change-logs?${params.toString()}`);
    },
    subscribe() {
      unsupported("entities.TaskChangeLog", "subscribe");
    }
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

        if (entityName === "DailyPlan") {
          return createDailyPlanEntity();
        }

        if (entityName === "User") {
          return createUserEntity();
        }

        if (entityName === "Comment") {
          return createCommentEntity();
        }

        if (entityName === "TaskCompletion") {
          return createTaskCompletionEntity();
        }

        if (entityName === "TaskChangeLog") {
          return createTaskChangeLogEntity();
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
        body: { email, password }
      });
      setAccessToken(result.token);
      return result.user;
    },
    async register(payload) {
      const result = await httpRequest("/api/auth/register", {
        method: "POST",
        body: payload
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
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    },
    redirectToLogin(redirectUrl) {
      const target = redirectUrl ? `/?redirect=${encodeURIComponent(redirectUrl)}` : "/";
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
      async UploadFile() {
        unsupported("integrations.Core", "UploadFile");
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
