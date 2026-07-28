/**
 * Vue 单文件组件类型声明
 * 让 TypeScript 识别 .vue 文件为组件模块。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/**
 * Vite 环境变量类型声明
 */
/// <reference types="vite/client" />
