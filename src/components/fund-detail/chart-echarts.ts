/**
 * echarts 图表组件（"重"模块）——只允许被动态 import（见 chart-lib.ts）
 *
 * ⚠️ 这里必须保持**静态具名 import**：只有静态具名 import 才能让 rollup 把 echarts 按需 tree-shake，
 *    只打进 LineChart + 用到的几个组件/渲染器（约 518KB）。
 *    若改成在 dynamic import 结果上取命名空间（`const charts = await import('echarts/charts')` 后
 *    再 `charts.LineChart`），rollup 无法摇掉未使用的导出，echarts chunk 会从 ~518KB 膨胀到 ~1MB。
 *    所以"按需加载"的边界放在本模块的 import（动态）上，而不是放在 echarts 子模块的 import 上。
 */

import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

export default VChart
