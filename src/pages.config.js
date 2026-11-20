/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import React from 'react';

const Account = React.lazy(() => import('./pages/Account'));
const AdminStats = React.lazy(() => import('./pages/AdminStats.jsx'));
const AgentIntro = React.lazy(() => import('./pages/AgentIntro.jsx'));
const BuddyClaim = React.lazy(() => import('./pages/BuddyClaim.jsx'));
const BuddySpace = React.lazy(() => import('./pages/BuddySpace.jsx'));
const BuddyStore = React.lazy(() => import('./pages/BuddyStore.jsx'));
const CollabSpace = React.lazy(() => import('./pages/CollabSpace.jsx'));
const Onboarding = React.lazy(() => import('./pages/Onboarding.jsx'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const HeartSign = React.lazy(() => import('./pages/HeartSign.jsx'));
const KnowledgeBase = React.lazy(() => import('./pages/KnowledgeBase'));
const LockScreenTodo = React.lazy(() => import('./pages/LockScreenTodo.jsx'));
const Notes = React.lazy(() => import('./pages/Notes'));
const NotificationSettings = React.lazy(() => import('./pages/NotificationSettings'));
const Notifications = React.lazy(() => import('./pages/Notifications'));
const Pricing = React.lazy(() => import('./pages/Pricing'));
const Share = React.lazy(() => import('./pages/Share'));
const Tasks = React.lazy(() => import('./pages/Tasks'));
const Teams = React.lazy(() => import('./pages/Teams'));
const Trash = React.lazy(() => import('./pages/Trash'));
import __Layout from './Layout.jsx';


export const PAGES = {
    "Account": Account,
    "AdminStats": AdminStats,
    "AgentIntro": AgentIntro,
    "BuddyClaim": BuddyClaim,
    "BuddySpace": BuddySpace,
    "BuddyStore": BuddyStore,
    "CollabSpace": CollabSpace,
    "Onboarding": Onboarding,
    "Dashboard": Dashboard,
    "HeartSign": HeartSign,
    "KnowledgeBase": KnowledgeBase,
    "LockScreenTodo": LockScreenTodo,
    "Notes": Notes,
    "NotificationSettings": NotificationSettings,
    "Notifications": Notifications,
    "Pricing": Pricing,
    "Share": Share,
    "Tasks": Tasks,
    "Teams": Teams,
    "Trash": Trash,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};