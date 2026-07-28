import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// 💡 修改这里：使用回调函数获取 command 参数
export default defineConfig(({ command }) => {
  const isProd = command === 'build'

  return {
    plugins: [vue()],
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
