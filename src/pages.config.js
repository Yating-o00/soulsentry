import Account from './pages/Account';
import Dashboard from './pages/Dashboard';
import GeminiTest from './pages/GeminiTest';
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
import Home from './pages/Home';
import Welcome from './pages/Welcome';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Account": Account,
    "Dashboard": Dashboard,
    "GeminiTest": GeminiTest,
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
    "Home": Home,
    "Welcome": Welcome,
}

export const pagesConfig = {
    mainPage: "Tasks",
    Pages: PAGES,
    Layout: __Layout,
};