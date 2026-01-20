import React, { createContext, useContext, useState, useEffect } from 'react';

const TranslationContext = createContext();

const translations = {
  zh: {
    // Navigation
    'today': '今日',
    'tasks': '约定',
    'notes': '心签',
    'teams': '团队',
    'myAccount': '我的账户',
    'notifications': '消息通知',
    'feedback': '反馈与联系',
    'trash': '回收站',
    'soulSentry': '心灵存放站',
    'tagline': '坚定守护，适时轻唤',
    
    // Tasks Page
    'allTasks': '全部约定',
    'yourMomentsMatter': '你的点滴都是最重要的事',
    'searchTasks': '搜索约定...',
    'all': '全部',
    'pending': '进行中',
    'completed': '已完成',
    'overdue': '已过期',
    'blocked': '阻塞中',
    'noTasksFound': '未找到约定',
    'adjustFilters': '试试调整筛选条件或创建新约定',
    'items': '个约定',
    
    // Quick Add
    'quickCreate': '快速创建',
    'smartParsing': '智能解析',
    'aiAssistant': 'AI 助手',
    'smartCreate': '智能创建约定',
    'manualCreate': '手动创建',
    'clickToInput': '点击输入详情',
    'voiceCreate': '语音创建',
    'aiRecognition': 'AI 识别',
    'createTask': '创建约定',
    'saveChanges': '保存修改',
    'cancel': '取消',
    'addSubtask': '添加子约定',
    'aiGenerateSubtasks': 'AI 生成子约定',
    'generating': '生成中...',
    'loadFromTemplate': '从模板加载',
    'teamAssignment': '团队分配',
    'dependencies': '依赖约定',
    'advancedSettings': '高级设置',
    'expand': '展开',
    'collapse': '收起',
    
    // Task Fields
    'taskTitle': '输入约定标题...',
    'description': '添加详细描述（可选）',
    'taskDate': '约定日期',
    'selectDate': '点击选择日期',
    'reminderTime': '提醒时间',
    'category': '类别',
    'priority': '优先级',
    'repeat': '重复',
    'noRepeat': '不重复',
    'daily': '每天',
    'weekly': '每周',
    'monthly': '每月',
    'custom': '自定义',
    'allDay': '全天',
    'setTimeRange': '设为时间段',
    'changeToSinglePoint': '改为单点',
    'aiSmartRecommend': 'AI 智能推荐',
    'recommended': '推荐',
    'applySuggestion': '应用建议',
    
    // Categories
    'work': '工作',
    'personal': '个人',
    'health': '健康',
    'study': '学习',
    'family': '家庭',
    'shopping': '购物',
    'finance': '财务',
    'other': '其他',
    
    // Priority
    'low': '低',
    'medium': '中',
    'high': '高',
    'urgent': '紧急',
    
    // Actions
    'edit': '编辑',
    'delete': '删除',
    'share': '分享',
    'complete': '完成',
    'restore': '恢复',
    'markComplete': '标记完成',
    'markIncomplete': '标记未完成',
    'changePriority': '修改优先级',
    'snooze': '推迟',
    'viewDetails': '查看详情',
    'translate': '翻译',
    'aiAnalysis': 'AI 分析',
    'analyzing': '分析中...',
    'translating': '翻译中...',
    
    // Status
    'todo': '待办',
    'inProgress': '进行中',
    'done': '完成',
    'snoozed': '已推迟',
    'cancelled': '已取消',
    
    // View Modes
    'listView': '列表视图',
    'ganttView': '甘特图视图',
    'kanbanView': '看板视图',
    
    // Time Related
    'today': '今天',
    'tomorrow': '明天',
    'thisWeek': '本周',
    'nextWeek': '下周',
    'thisMonth': '本月',
    'dueDate': '截止日期',
    'startTime': '开始时间',
    'endTime': '结束时间',
    
    // Dashboard
    'overview': '概览',
    'upcomingTasks': '即将到来',
    'overdueTasks': '已过期',
    'completedToday': '今日完成',
    'totalTasks': '全部约定',
    'calendar': '日历',
    'insights': '洞察',
    
    // Notes
    'allNotes': '全部心签',
    'searchNotes': '搜索心签...',
    'createNote': '创建心签',
    'editNote': '编辑心签',
    'noNotes': '暂无心签',
    'startWriting': '开始记录你的想法',
    
    // Common
    'save': '保存',
    'discard': '放弃',
    'confirm': '确认',
    'back': '返回',
    'next': '下一步',
    'previous': '上一步',
    'close': '关闭',
    'loading': '加载中...',
    'success': '成功',
    'error': '错误',
    'warning': '警告',
    'info': '提示',
  },
  en: {
    // Navigation
    'today': 'Today',
    'tasks': 'Tasks',
    'notes': 'Notes',
    'teams': 'Teams',
    'myAccount': 'My Account',
    'notifications': 'Notifications',
    'feedback': 'Feedback & Contact',
    'trash': 'Trash',
    'soulSentry': 'Soul Sentry',
    'tagline': 'Your steadfast companion for mindful living',
    
    // Tasks Page
    'allTasks': 'All Tasks',
    'yourMomentsMatter': 'Every moment of yours matters',
    'searchTasks': 'Search tasks...',
    'all': 'All',
    'pending': 'Active',
    'completed': 'Done',
    'overdue': 'Overdue',
    'blocked': 'Blocked',
    'noTasksFound': 'No tasks found',
    'adjustFilters': 'Try adjusting your filters or create a new task',
    'items': ' tasks',
    
    // Quick Add
    'quickCreate': 'Quick Add',
    'smartParsing': 'Smart Parse',
    'aiAssistant': 'AI Assistant',
    'smartCreate': 'Intelligent task creation',
    'manualCreate': 'Manual Input',
    'clickToInput': 'Tap to enter details',
    'voiceCreate': 'Voice Input',
    'aiRecognition': 'AI Recognition',
    'createTask': 'Create Task',
    'saveChanges': 'Save Changes',
    'cancel': 'Cancel',
    'addSubtask': 'Add Subtask',
    'aiGenerateSubtasks': 'AI Generate Subtasks',
    'generating': 'Generating...',
    'loadFromTemplate': 'Load Template',
    'teamAssignment': 'Assign to Team',
    'dependencies': 'Dependencies',
    'advancedSettings': 'Advanced Settings',
    'expand': 'Expand',
    'collapse': 'Collapse',
    
    // Task Fields
    'taskTitle': 'Enter task title...',
    'description': 'Add description (optional)',
    'taskDate': 'Date',
    'selectDate': 'Select date',
    'reminderTime': 'Time',
    'category': 'Category',
    'priority': 'Priority',
    'repeat': 'Repeat',
    'noRepeat': 'None',
    'daily': 'Daily',
    'weekly': 'Weekly',
    'monthly': 'Monthly',
    'custom': 'Custom',
    'allDay': 'All Day',
    'setTimeRange': 'Set time range',
    'changeToSinglePoint': 'Single point',
    'aiSmartRecommend': 'AI Smart Suggestions',
    'recommended': 'Recommended',
    'applySuggestion': 'Apply',
    
    // Categories
    'work': 'Work',
    'personal': 'Personal',
    'health': 'Health',
    'study': 'Study',
    'family': 'Family',
    'shopping': 'Shopping',
    'finance': 'Finance',
    'other': 'Other',
    
    // Priority
    'low': 'Low',
    'medium': 'Medium',
    'high': 'High',
    'urgent': 'Urgent',
    
    // Actions
    'edit': 'Edit',
    'delete': 'Delete',
    'share': 'Share',
    'complete': 'Complete',
    'restore': 'Restore',
    'markComplete': 'Mark as Done',
    'markIncomplete': 'Mark as Active',
    'changePriority': 'Change Priority',
    'snooze': 'Snooze',
    'viewDetails': 'View Details',
    'translate': 'Translate',
    'aiAnalysis': 'AI Analysis',
    'analyzing': 'Analyzing...',
    'translating': 'Translating...',
    
    // Status
    'todo': 'To Do',
    'inProgress': 'Active',
    'done': 'Done',
    'snoozed': 'Snoozed',
    'cancelled': 'Cancelled',
    
    // View Modes
    'listView': 'List',
    'ganttView': 'Gantt Chart',
    'kanbanView': 'Board',
    
    // Time Related
    'today': 'Today',
    'tomorrow': 'Tomorrow',
    'thisWeek': 'This Week',
    'nextWeek': 'Next Week',
    'thisMonth': 'This Month',
    'dueDate': 'Due Date',
    'startTime': 'Start',
    'endTime': 'End',
    
    // Dashboard
    'overview': 'Overview',
    'upcomingTasks': 'Upcoming',
    'overdueTasks': 'Overdue',
    'completedToday': 'Done Today',
    'totalTasks': 'All Tasks',
    'calendar': 'Calendar',
    'insights': 'Insights',
    
    // Notes
    'allNotes': 'All Notes',
    'searchNotes': 'Search notes...',
    'createNote': 'New Note',
    'editNote': 'Edit Note',
    'noNotes': 'No notes yet',
    'startWriting': 'Start capturing your thoughts',
    
    // Common
    'save': 'Save',
    'discard': 'Discard',
    'confirm': 'Confirm',
    'back': 'Back',
    'next': 'Next',
    'previous': 'Previous',
    'close': 'Close',
    'loading': 'Loading...',
    'success': 'Success',
    'error': 'Error',
    'warning': 'Warning',
    'info': 'Info',
  }
};

export function TranslationProvider({ children }) {
  const [language, setLanguage] = useState('zh');

  useEffect(() => {
    // 初始化时读取语言设置
    try {
      var savedLang = localStorage.getItem('app_language');
      if (savedLang) {
        setLanguage(savedLang);
      }
    } catch (e) {
      // Safari 隐私模式可能阻止 localStorage
      console.warn('localStorage not available');
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('app_language', language);
      document.documentElement.lang = language;
    } catch (e) {
      // 忽略存储错误
    }
  }, [language]);

  const t = (key) => {
    return translations[language][key] || key;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'zh' ? 'en' : 'zh');
  };

  return (
    <TranslationContext.Provider value={{ language, t, toggleLanguage }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within TranslationProvider');
  }
  return context;
}