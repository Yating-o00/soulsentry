// iOS Safari 隐私模式 / iOS 26 防跟踪保护下,直接访问 window.localStorage 会抛
// SecurityError,导致顶层模块加载失败 → 整页白屏。
// 所有 storage 访问都通过 safeStorage 包裹,失败时降级为内存 Map。
const isNode = typeof window === 'undefined';

const memoryStore = new Map();
const safeStorage = {
	getItem(key) {
		try {
			if (!isNode && window.localStorage) return window.localStorage.getItem(key);
		} catch (e) { /* iOS Safari privacy mode */ }
		return memoryStore.has(key) ? memoryStore.get(key) : null;
	},
	setItem(key, value) {
		try {
			if (!isNode && window.localStorage) {
				window.localStorage.setItem(key, value);
				return;
			}
		} catch (e) { /* iOS Safari privacy mode */ }
		memoryStore.set(key, value);
	}
};

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	let urlParams;
	try {
		urlParams = new URLSearchParams(window.location.search);
	} catch (e) {
		urlParams = new URLSearchParams('');
	}
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		try {
			urlParams.delete(paramName);
			const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
				}${window.location.hash}`;
			window.history.replaceState({}, document.title, newUrl);
		} catch (e) { /* ignore */ }
	}
	if (searchParam) {
		safeStorage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		safeStorage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = safeStorage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getAppParams = () => {
	let fromUrlDefault;
	try { fromUrlDefault = window.location.href; } catch (e) { fromUrlDefault = ''; }
	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID }),
		serverUrl: getAppParamValue("server_url", { defaultValue: import.meta.env.VITE_BASE44_BACKEND_URL }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: fromUrlDefault }),
		functionsVersion: getAppParamValue("functions_version"),
	}
}


export const appParams = {
	...getAppParams()
}