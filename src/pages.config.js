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
import Account from './pages/Account';
import Dashboard from './pages/Dashboard';
import GeminiTest from './pages/GeminiTest';
import Home from './pages/Home';
import Knowledge from './pages/Knowledge';
import KnowledgeBase from './pages/KnowledgeBase';
import Notes from './pages/Notes';
import NotificationSettings from './pages/NotificationSettings';
import Notifications from './pages/Notifications';
import Pricing from './pages/Pricing';
import Tasks from './pages/Tasks';
import Teams from './pages/Teams';
import Templates from './pages/Templates';
import Trash from './pages/Trash';
import Welcome from './pages/Welcome';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Account": Account,
    "Dashboard": Dashboard,
    "GeminiTest": GeminiTest,
    "Home": Home,
    "Knowledge": Knowledge,
    "KnowledgeBase": KnowledgeBase,
    "Notes": Notes,
    "NotificationSettings": NotificationSettings,
    "Notifications": Notifications,
    "Pricing": Pricing,
    "Tasks": Tasks,
    "Teams": Teams,
    "Templates": Templates,
    "Trash": Trash,
    "Welcome": Welcome,
}

export const pagesConfig = {
    mainPage: "Tasks",
    Pages: PAGES,
    Layout: __Layout,
};