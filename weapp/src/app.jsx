import Taro, { useLaunch } from "@tarojs/taro";
import "taro-ui/dist/style/index.scss";
import "./app.scss";
import NotificationManager from "./components/NotificationManager";
import { getToken } from "./utils/auth";
import { post } from "./utils/api";

async function bindWechatOpenidIfNeeded() {
  if (process.env.TARO_ENV !== "weapp") return;
  if (!getToken()) return;
  try {
    const { code } = await Taro.login();
    if (code) {
      await post("/auth/wechat/bind-openid", { code });
    }
  } catch (err) {
    console.error("[app] bindWechatOpenidIfNeeded failed", err);
  }
}

function App({ children }) {
  useLaunch(() => {
    console.log("SoulSentry WeApp launched");
    bindWechatOpenidIfNeeded();
  });

  return (
    <>
      {children}
      <NotificationManager />
    </>
  );
}

export default App;
