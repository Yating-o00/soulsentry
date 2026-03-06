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
import { useTranslation } from '@/components/TranslationContext';

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
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/60 safe-area-inset-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around h-[68px] px-1 pb-safe">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = item.path && location.pathname === item.path;

            if (item.isCenter) {
              return (
                <button
                  key={index}
                  onClick={item.action}
                  className="relative -mt-7 touch-manipulation no-min-size"
                >
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] shadow-lg shadow-[#384877]/30 flex items-center justify-center active:shadow-xl transition-all"
                  >
                    <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </motion.div>
                </button>
              );
            }

            if (item.path) {
              return (
                <Link
                  key={index}
                  to={item.path}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] relative touch-manipulation"
                >
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    className="flex flex-col items-center gap-0.5"
                  >
                    <div className={`p-1.5 rounded-xl transition-all duration-200 ${
                      isActive ? 'bg-[#384877]/10' : ''
                    }`}>
                      <Icon 
                        className={`w-5 h-5 transition-all duration-200 ${
                          isActive ? 'text-[#384877]' : 'text-slate-400'
                        }`} 
                      />
                    </div>
                    <span 
                      className={`text-[10px] font-medium transition-colors leading-tight ${
                        isActive ? 'text-[#384877] font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {item.label}
                    </span>
                  </motion.div>
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
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="md:hidden fixed bottom-24 inset-x-4 z-50"
            >
              <div className="bg-white rounded-3xl shadow-2xl p-3 flex gap-3">
                {quickActions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                      onClick={action.action}
                      className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl bg-gradient-to-br ${action.color} text-white shadow-lg active:scale-[0.97] transition-transform`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="font-semibold text-sm">{action.label}</span>
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