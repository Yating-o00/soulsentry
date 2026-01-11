import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  LayoutDashboard, 
  ListTodo, 
  StickyNote, 
  Bell, 
  User,
  Plus,
  Brain
} from 'lucide-react';
import { useTranslation } from '../TranslationContext';

export default function MobileNavigation() {
  const location = useLocation();
  const { t } = useTranslation();
  const [showQuickActions, setShowQuickActions] = useState(false);

  const navItems = [
    { 
      icon: LayoutDashboard, 
      label: t('today'), 
      path: createPageUrl('Dashboard') 
    },
    { 
      icon: ListTodo, 
      label: t('tasks'), 
      path: createPageUrl('Tasks') 
    },
    { 
      icon: Plus, 
      label: '创建', 
      action: () => setShowQuickActions(true),
      isCenter: true 
    },
    { 
      icon: StickyNote, 
      label: t('notes'), 
      path: createPageUrl('Notes') 
    },
    { 
      icon: Brain, 
      label: '知识库', 
      path: createPageUrl('KnowledgeBase') 
    }
  ];

  const quickActions = [
    { 
      icon: ListTodo, 
      label: '新建约定', 
      color: 'from-blue-500 to-blue-600',
      action: () => {
        window.dispatchEvent(new CustomEvent('mobile-create-task'));
        setShowQuickActions(false);
      }
    },
    { 
      icon: StickyNote, 
      label: '新建心签', 
      color: 'from-purple-500 to-purple-600',
      action: () => {
        window.dispatchEvent(new CustomEvent('mobile-create-note'));
        setShowQuickActions(false);
      }
    }
  ];

  return (
    <>
      {/* 底部导航栏 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 safe-area-inset-bottom shadow-2xl">
        <div className="flex items-center justify-around h-16 px-1">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = item.path && location.pathname === item.path;

            if (item.isCenter) {
              return (
                <button
                  key={index}
                  onClick={item.action}
                  className="relative -mt-8 touch-manipulation"
                >
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 shadow-xl flex items-center justify-center active:shadow-2xl transition-shadow"
                  >
                    <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
                  </motion.div>
                </button>
              );
            }

            if (item.path) {
              return (
                <Link
                  key={index}
                  to={item.path}
                  className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] relative touch-manipulation"
                >
                  <Icon 
                    className={`w-6 h-6 transition-all ${
                      isActive ? 'text-[#384877] scale-110' : 'text-slate-400'
                    }`} 
                  />
                  <span 
                    className={`text-[11px] font-medium transition-colors leading-tight ${
                      isActive ? 'text-[#384877] font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-[#384877]"
                    />
                  )}
                </Link>
              );
            }

            return null;
          })}
        </div>
      </nav>

      {/* 快速操作菜单 */}
      <AnimatePresence>
        {showQuickActions && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQuickActions(false)}
              className="md:hidden fixed inset-0 z-50 bg-black/50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 100 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 100 }}
              className="md:hidden fixed bottom-20 inset-x-4 z-50"
            >
              <div className="bg-white rounded-2xl shadow-2xl p-4 space-y-3">
                {quickActions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={action.action}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r ${action.color} text-white shadow-lg active:scale-95 transition-transform`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="font-semibold text-lg">{action.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}