import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import Account from './pages/Account';
import Teams from './pages/Teams';
import Trash from './pages/Trash';
import Notes from './pages/Notes';
import Dashboard from './pages/Dashboard';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Tasks": Tasks,
    "Calendar": Calendar,
    "Account": Account,
    "Teams": Teams,
    "Trash": Trash,
    "Notes": Notes,
    "Dashboard": Dashboard,
}

export const pagesConfig = {
    mainPage: "Tasks",
    Pages: PAGES,
    Layout: __Layout,
};