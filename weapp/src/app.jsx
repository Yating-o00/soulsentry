import { useLaunch } from "@tarojs/taro";
import "taro-ui/dist/style/index.scss";
import "./app.scss";

function App({ children }) {
  useLaunch(() => {
    console.log("SoulSentry WeApp launched");
  });

  return children;
}

export default App;
