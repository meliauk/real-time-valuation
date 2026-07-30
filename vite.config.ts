import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { execSync } from 'child_process'

/** 构建版本号：git 短哈希 + 构建时间戳，每次构建唯一。
 *  - 注入到 JS 产物（__APP_VERSION__），作为"当前运行的版本"。
 *  - 写入 dist/version.json，作为"线上已部署的版本"。
 *  运行时比对二者不一致即强制刷新——解决 GitHub Pages 缓存 index.html 导致更新后用户仍读旧版的问题。 */
function buildVersion(): string {
  let gitHash = ''
  try {
    gitHash = execSync('git rev-parse --short HEAD').toString().trim()
  } catch { /* 非 git 环境（如 CI 克隆）兜底，不影响构建 */ }
  return `${gitHash || 'nogit'}-${Date.now()}`
}

/** Vite 插件：注入 __APP_VERSION__ + 生成 dist/version.json。
 *  version.json 不带 hash 文件名（静态固定名），靠客户端 fetch 时加 ?v=<时间戳> 查询串绕过缓存，
 *  确保每次取到的是线上最新版本（GitHub Pages 对不同 URL 不命中缓存）。 */
function versionPlugin(version: string) {
  return {
    name: 'app-version',
    config() {
      // 构建时常量注入 JS（Date.now() 此处是构建期求值，非运行期，安全）
      return { define: { __APP_VERSION__: JSON.stringify(version) } }
    },
    generateBundle() {
      // 产物阶段写入 version.json（与 index.html 同级，部署到站点根/base 下）
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) })
    },
  }
}

// 💡 修改这里：使用回调函数获取 command 参数
export default defineConfig(({ command }) => {
  const isProd = command === 'build'
  const APP_VERSION = buildVersion()

  return {
    plugins: [vue(), versionPlugin(APP_VERSION)],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    
    // 💡 100% 准确地判断打包环境，并请确保这里的仓库名填对
    base: isProd ? '/real-time-valuation/' : '/',

    server: {
      host: '127.0.0.1',
      port: 18595,
      proxy: {
        '/api/glm': {
          target: 'https://open.bigmodel.cn',
          changeOrigin: true,
          secure: false,
          timeout: 60000,
          rewrite: (path) => path.replace(/^\/api\/glm/, '/api/paas/v4'),
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              const msg = `GLM proxy 错误: ${err.message}`
              console.error(`[vite] ${msg}`)
              if (res && !res.headersSent && typeof res.writeHead === 'function' && typeof res.end === 'function') {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: { code: 'PROXY_ERR', message: msg } }))
              }
            })
          },
        },
      },
    },
    build: {
      target: 'es2020',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'element-plus': ['element-plus'],
            'echarts': ['echarts', 'vue-echarts'],
            'vendor': ['vue', 'vue-router', 'pinia'],
          },
        },
      },
    },
    worker: {
      format: 'es',
    },
  }
})
