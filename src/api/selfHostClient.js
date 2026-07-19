const DEFAULT_BASE_URL = "http://localhost:8787";

const rawMode = import.meta.env.VITE_BACKEND_MODE || "";
export const isSelfHostedBackendEnabled =
  rawMode === "self-host" || !!import.meta.env.VITE_SELF_HOST_BACKEND_URL;

export const selfHostedBackendUrl = (
  import.meta.env.VITE_SELF_HOST_BACKEND_URL || DEFAULT_BASE_URL
).replace(/\/+$/, "");

async function request(path, { method = "GET", body, headers } = {}) {
  const response = await fetch(`${selfHostedBackendUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(
      payload?.error || payload?.message || `HTTP ${response.status}`
    );
    error.status = response.status;
    error.response = {
      status: response.status,
      data: payload || {},
    };
    throw error;
  }

  return payload;
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "object") {
      search.set(key, JSON.stringify(value));
      return;
    }
    search.set(key, String(value));
  });
  const output = search.toString();
  return output ? `?${output}` : "";
}

function withInvokeEnvelope(data) {
  return { data };
}

function makeEntityApi(entityName) {
  return {
    list(sort, limit) {
      return request(
        `/api/entities/${entityName}${toQuery({
          sort,
          limit,
        })}`
      );
    },
    filter(filter, sort, limit) {
      return request(
        `/api/entities/${entityName}${toQuery({
          filter,
          sort,
          limit,
        })}`
      );
    },
    get(id) {
      return request(`/api/entities/${entityName}/${id}`);
    },
    create(data) {
      return request(`/api/entities/${entityName}`, {
        method: "POST",
        body: data,
      });
    },
    update(id, data) {
      return request(`/api/entities/${entityName}/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    delete(id) {
      return request(`/api/entities/${entityName}/${id}`, {
        method: "DELETE",
      });
    },
    bulkCreate(items) {
      return request(`/api/entities/${entityName}/bulk-create`, {
        method: "POST",
        body: { items },
      });
    },
    bulkUpdate(items) {
      return request(`/api/entities/${entityName}/bulk-update`, {
        method: "POST",
        body: { items },
      });
    },
    subscribe() {
      return () => {};
    },
  };
}

const entities = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!prop) return undefined;
      if (prop === "Query") {
        return {
          async raw(entityName, params) {
            return request(
              `/api/entities/${entityName}${toQuery(params || {})}`
            );
          },
        };
      }
      return makeEntityApi(String(prop));
    },
  }
);

async function fileToPayload(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    data_url: dataUrl,
  };
}

const auth = {
  me() {
    return request("/api/auth/me");
  },
  updateMe(patch) {
    return request("/api/auth/me", {
      method: "PATCH",
      body: patch,
    });
  },
  logout(redirectUrl) {
    request("/api/auth/logout", {
      method: "POST",
      body: { redirectUrl: redirectUrl || null },
    }).catch(() => {});
    if (redirectUrl && typeof window !== "undefined") {
      window.location.href = redirectUrl;
    }
  },
  redirectToLogin(redirectUrl) {
    if (typeof window !== "undefined") {
      window.location.href = redirectUrl || window.location.href;
    }
  },
};

const functions = new Proxy(
  {
    invoke(name, payload = {}) {
      return request(`/api/functions/${name}`, {
        method: "POST",
        body: payload,
      }).then(withInvokeEnvelope);
    },
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (!prop) return undefined;
      return async (payload = {}) => {
        const data = await request(`/api/functions/${String(prop)}`, {
          method: "POST",
          body: payload,
        });
        return data;
      };
    },
  }
);

const integrations = {
  Core: {
    async InvokeLLM(payload) {
      return request("/api/integrations/invoke-llm", {
        method: "POST",
        body: payload,
      });
    },
    async SendEmail(payload) {
      return request("/api/integrations/send-email", {
        method: "POST",
        body: payload,
      });
    },
    async SendSMS(payload) {
      return request("/api/integrations/send-sms", {
        method: "POST",
        body: payload,
      });
    },
    async UploadFile({ file }) {
      const payload = await fileToPayload(file);
      return request("/api/integrations/upload-file", {
        method: "POST",
        body: payload,
      });
    },
    async GenerateImage(payload) {
      return request("/api/integrations/generate-image", {
        method: "POST",
        body: payload,
      });
    },
    async ExtractDataFromUploadedFile(payload) {
      return request("/api/integrations/extract-data-from-uploaded-file", {
        method: "POST",
        body: payload,
      });
    },
  },
};

export const selfHostedBase44Client = {
  auth,
  entities,
  functions,
  integrations,
};
