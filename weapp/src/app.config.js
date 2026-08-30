export default {
  pages: [
    "pages/index/index",
    "pages/login/index",
    "pages/flow/index",
    "pages/tasks/index",
    "pages/task-detail/index",
    "pages/task-create/index",
    "pages/notes/index",
    "pages/note-detail/index",
    "pages/note-create/index",
    "pages/share/index",
    "pages/account/index",
    "pages/webview/index"
  ],
  lazyCodeLoading: "requiredComponents",
  plugins: {
    WechatSI: {
      version: "0.3.5",
      provider: "wx069ba97219f66d99"
    }
  },
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#384877",
    navigationBarTitleText: "SoulSentry",
    navigationBarTextStyle: "white"
  },
  tabBar: {
    color: "#999999",
    selectedColor: "#384877",
    backgroundColor: "#ffffff",
    borderStyle: "black",
    list: [
      {
        pagePath: "pages/flow/index",
        text: "心流"
      },
      {
        pagePath: "pages/tasks/index",
        text: "约定"
      },
      {
        pagePath: "pages/notes/index",
        text: "心签"
      },
      {
        pagePath: "pages/account/index",
        text: "我的"
      }
    ]
  }
};
