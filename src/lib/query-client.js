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
	// 约定相关
	['tasks'],
	['tasks-memory-ctx'],
	['tasks-for-location'],
	['tasks-dependency-search'],
	['archived-tasks'],
	['task-templates'],
	// 子约定/依赖/历史（动态 key 前缀）
	['subtasks'],
	['subtasks-multi'],
	['dependencies'],
	['task-change-logs'],
	['task-completions'],
	['attach-parent-candidates'],
	['sentinel-task'],
	// 执行/通知/评论
	['task-executions'],
	['notifications'],
	['notificationRules'],
	['all-comments'],
	['comments-timeline'],
	// 心签/笔记/知识库
	['notes'],
	['knowledge-base'],
	// 关系/用户/行为
	['relationships'],
	['relationships-timeline'],
	['relationships-account'],
	['relationships-memory-ctx'],
	['mi-relationships'],
	['users'],
	['team-users-timeline'],
	['recentBehaviors'],
	['recentBehaviors_planner'],
	['userBehaviors'],
	['behaviors-memory-ctx'],
	// 计划（动态 key 前缀也会命中）
	['dailyPlan'],
	['dailyPlanWindow'],
	['weeklyPlan'],
	['monthlyPlan'],
	['daily-plans'],
	['weekly-plans'],
	['monthly-plans'],
	// 位置/偏好/设备/积分
	['saved-locations'],
	['user-preferences'],
	['user-preference-routine'],
	['my-devices'],
	['credit-history'],
	['memories'],
].forEach((key) => {
	queryClientInstance.setQueryDefaults(key, { select: asArray });
});