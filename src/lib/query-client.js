import { QueryClient } from '@tanstack/react-query';

function asArray(data) {
	return Array.isArray(data) ? data : [];
}

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

// 统一兜底：所有 list/filter 型查询返回必须是数组，防止 iOS 16 等环境因缓存/返回异常导致 .map/.filter 白屏
[
	['tasks'],
	['notes'],
	['daily-plans'],
	['weekly-plans'],
	['monthly-plans'],
	['task-executions'],
	['saved-locations'],
	['notification-rules'],
	['user-preferences'],
	['user-behaviors'],
	['relationships'],
	['knowledge-bases'],
	['external-feeds'],
	['comments'],
	['notifications'],
	['archived-tasks'],
].forEach((key) => {
	queryClientInstance.setQueryDefaults(key, { select: asArray });
});