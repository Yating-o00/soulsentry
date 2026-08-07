const path = require("path");

const isDev = process.env.NODE_ENV === "development";

module.exports = {
  projectName: "soulsentry-weapp",
  date: "2026-8-7",
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2
  },
  sourceRoot: "src",
  outputRoot: "dist",
  plugins: [],
  defineConstants: {
    "process.env.TARO_APP_API": JSON.stringify(
      isDev
        ? "https://www.xinzhan-soulsentry.cn/api"
        : "https://www.xinzhan-soulsentry.cn/api"
    )
  },
  alias: {
    "@": path.resolve(__dirname, "..", "src")
  },
  copy: {
    patterns: [],
    options: {}
  },
  framework: "react",
  compiler: "webpack5",
  cache: {
    enable: false
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {}
      },
      url: {
        enable: true,
        config: {
          limit: 1024
        }
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: "module",
          generateScopedName: "[name]__[local]___[hash:base64:5]"
        }
      }
    }
  },
  h5: {
    publicPath: "/",
    staticDirectory: "static",
    esnextModules: ["taro-ui"],
    postcss: {
      autoprefixer: {
        enable: true,
        config: {}
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: "module",
          generateScopedName: "[name]__[local]___[hash:base64:5]"
        }
      }
    }
  }
};
