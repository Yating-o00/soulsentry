import React from "react";
import {
  ArrowDown, ArrowUp, Backpack, BadgeCheck, BarChart3, BookOpen, Bookmark, Bot, Brain,
  Briefcase, CalendarCheck, CalendarDays, CheckCircle2, ChefHat, Circle, ClipboardList, CloudSun,
  Dumbbell, FolderOpen, Footprints, Fuel, Gauge, HeartPulse, LayoutGrid, Library, Lightbulb,
  ListChecks, MapPin, MessagesSquare, Moon, NotebookPen, PenLine, Sparkles, StickyNote, Sun,
  Target, Trophy, UserCircle, Users, Utensils, Wallet,
} from "lucide-react";

// 搭子模块图标：内置板块沿用原来的识别方式，新专业模块使用语义图标。
const MODULE_ICONS = {
  sun: Sun,
  lightbulb: Lightbulb,
  users: Users,
  "bar-chart": BarChart3,
  "user-circle": UserCircle,
  "map-pin": MapPin,
  "list-checks": ListChecks,
  sparkles: Sparkles,
  "book-open": BookOpen,
  library: Library,
  "sticky-note": StickyNote,
  "check-circle": CheckCircle2,
  "calendar-check": CalendarCheck,
  "calendar-days": CalendarDays,
  "clipboard-list": ClipboardList,
  "heart-pulse": HeartPulse,
  backpack: Backpack,
  "folder-open": FolderOpen,
  wallet: Wallet,
  "badge-check": BadgeCheck,
  "notebook-pen": NotebookPen,
  "cloud-sun": CloudSun,
  trophy: Trophy,
  footprints: Footprints,
  fuel: Fuel,
  gauge: Gauge,
  bookmark: Bookmark,
  target: Target,
  moon: Moon,
  "pen-line": PenLine,
  "layout-grid": LayoutGrid,
  "chef-hat": ChefHat,
  "dumbbell": Dumbbell,
  "briefcase": Briefcase,
  "messages-square": MessagesSquare,
  "bot": Bot,
  "brain": Brain,
  "utensils": Utensils,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
};

const TYPE_ICONS = {
  chat: Sparkles,
  collab: Users,
  profile: UserCircle,
  checklist: ListChecks,
  notes: StickyNote,
  tracker: Gauge,
  assistant: Sparkles,
};

/** 统一渲染搭子模块图标，避免每个页面各维护一套映射。 */
export default function BuddyModuleIcon({ module, className = "h-4 w-4", strokeWidth, ...rest }) {
  const Icon = MODULE_ICONS[module?.icon] || TYPE_ICONS[module?.type] || Circle;
  return <Icon className={className} strokeWidth={strokeWidth} {...rest} />;
}
