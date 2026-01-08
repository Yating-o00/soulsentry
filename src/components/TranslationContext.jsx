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
    
    // Status
    'todo': '待办',
    'inProgress': '进行中',
    'done': '完成',
    'snoozed': '已推迟',
  },
  en: {
    // Navigation
    'today': 'Today',
    'tasks': 'Tasks',
    'notes': 'Notes',
    'teams': 'Teams',
    'myAccount': 'My Account',
    'notifications': 'Notifications',
    'feedback': 'Feedback',
    'trash': 'Trash',
    'soulSentry': 'Soul Sentry',
    'tagline': 'Steadfast guardian, timely reminder',
    
    // Tasks Page
    'allTasks': 'All Tasks',
    'yourMomentsMatter': 'Every moment matters',
    'searchTasks': 'Search tasks...',
    'all': 'All',
    'pending': 'Pending',
    'completed': 'Completed',
    'overdue': 'Overdue',
    'blocked': 'Blocked',
    'noTasksFound': 'No tasks found',
    'adjustFilters': 'Try adjusting filters or create a new task',
    
    // Quick Add
    'quickCreate': 'Quick Create',
    'smartParsing': 'Smart Parse',
    'aiAssistant': 'AI Assistant',
    'smartCreate': 'Smart task creation',
    'manualCreate': 'Manual Create',
    'clickToInput': 'Click to input',
    'voiceCreate': 'Voice Create',
    'aiRecognition': 'AI Recognition',
    'createTask': 'Create Task',
    'saveChanges': 'Save Changes',
    'cancel': 'Cancel',
    
    // Task Fields
    'taskTitle': 'Enter task title...',
    'description': 'Add description (optional)',
    'taskDate': 'Task Date',
    'selectDate': 'Select date',
    'reminderTime': 'Reminder Time',
    'category': 'Category',
    'priority': 'Priority',
    'repeat': 'Repeat',
    'noRepeat': 'No Repeat',
    'daily': 'Daily',
    'weekly': 'Weekly',
    'monthly': 'Monthly',
    'custom': 'Custom',
    
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
    'markComplete': 'Mark Complete',
    'markIncomplete': 'Mark Incomplete',
    
    // Status
    'todo': 'To Do',
    'inProgress': 'In Progress',
    'done': 'Done',
    'snoozed': 'Snoozed',
  }
};

export function TranslationProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('app_language') || 'zh';
    }
    return 'zh';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_language', language);
      document.documentElement.lang = language;
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