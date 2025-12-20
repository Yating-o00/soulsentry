import Tasks from './pages/Tasks';
import Account from './pages/Account';
import Teams from './pages/Teams';
import Trash from './pages/Trash';
import Notes from './pages/Notes';
import Dashboard from './pages/Dashboard';
import NotificationSettings from './pages/NotificationSettings';
import Templates from './pages/Templates';
import Notifications from './pages/Notifications';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Tasks": Tasks,
    "Account": Account,
    "Teams": Teams,
    "Trash": Trash,
    "Notes": Notes,
    "Dashboard": Dashboard,
    "NotificationSettings": NotificationSettings,
    "Templates": Templates,
    "Notifications": Notifications,
}

export const pagesConfig = {
    mainPage: "Tasks",
    Pages: PAGES,
    Layout: __Layout,
};