import { useLaunch } from "@tarojs/taro";
import "taro-ui/dist/style/index.scss";
import "./app.scss";
import NotificationManager from "./components/NotificationManager";

function App({ children }) {
  useLaunch(() => {
    console.log("SoulSentry WeApp launched");
  });

  return (
    <>
      {children}
      <NotificationManager />
    </>
  );
}

export default App;
