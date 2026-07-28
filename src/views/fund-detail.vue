<template>
  <div
    class="fund-detail-shell"
    @touchstart.passive="onSwipeStart"
    @touchend="onSwipeEnd"
    @touchcancel="onSwipeEnd"
  >
    <!-- 双页并排 track：两个槽位始终存在（稳定 key A/B，绝不重建实例）。
         activeSlot 在 left:0（当前页），inactiveSlot 在屏外一侧（切换中的 pending）。
         track 整体 translateX 同时移动两页——旧页滑出、新页从反方向滑入，并排无空窗。
         提交时只翻转 activeSlot（角色交换），不换 key 不改 prop，pane 实例复用已加载数据，无闪烁无回弹。 -->
    <div ref="trackRef" class="pane-track" :style="trackStyle">
      <div class="pane-slot" :style="slotStyle('A')">
        <FundDetailPane key="A" :fund-code="codeOfSlot('A')" class="pane" />
      </div>
      <div class="pane-slot" :style="slotStyle('B')">
        <FundDetailPane key="B" :fund-code="codeOfSlot('B')" class="pane" />
      </div>
    </div>

    <!-- 左右切换悬浮按钮：fixed 固定在视口内容边界，不随页面滑动。
         默认半透明，滑动跟手方向匹配时加深；点击带滑出滑入动画 -->
    <button
      v-if="prevCode"
      class="float-nav float-nav-prev"
      :class="{ 'is-active': prevActive }"
      title="上一个"
      @click="goPrev"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button
      v-if="nextCode"
      class="float-nav float-nav-next"
      :class="{ 'is-active': nextActive }"
      title="下一个"
      @click="goNext"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 基金详情页壳组件 - 管理双页并排滑动切换。
 * 职责：双 pane track 位移、手势状态机、fixed 切换按钮、路由同步。
 * 不含：单只基金展示（在 FundDetailPane 子组件，按 fundCode prop 渲染）。
 *
 * 无黑屏关键：切换时 pending pane 提前挂载于屏外一侧并预加载，track 整体位移使
 * 旧页滑出与新页滑入同时进行，两页始终并排，视口任何一刻都被页面填满。
 */
import { ref, computed, watch, onMounted, onUnmounted, onActivated, onDeactivated, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFundStore } from '@/modules/fund/fund-store'
import { useFundData } from '@/composables/use-fund-data'
import FundDetailPane from '@/components/fund-detail/fund-detail-pane.vue'

const route = useRoute()
const router = useRouter()
const fundStore = useFundStore()

// 排序后的基金码列表（与首页列表顺序一致）
const { sortedFundRows } = useFundData()
const sortedCodes = computed(() => sortedFundRows.value.map(r => r.fundCode))

// ===== 双页状态（稳定槽位 A/B，绝不重建实例）=====
// 两个槽位始终存在，key 固定 'A'/'B'。activeSlot 标识哪个是当前页（left:0），另一个是 pending（屏外）。
// slotCodes 记录每个槽位当前渲染的 code：A 槽初始放 currentCode，B 槽待切换时放目标 code。
const currentCode = ref<string>(route.params.code as string)
const activeSlot = ref<'A' | 'B'>('A')
const slotCodes = ref<{ A: string | null; B: string | null }>({ A: currentCode.value, B: null })

/** 取某槽位要渲染的 code：active 槽渲染 currentCode，inactive 槽渲染切换中的目标 code */
function codeOfSlot(slot: 'A' | 'B'): string {
  return slot === activeSlot.value ? currentCode.value : (slotCodes.value[slot] ?? currentCode.value)
}
/** 取某槽位的 left：active 槽 0，inactive 槽由 swipeDir 定位屏外（切下一个→右 100%，切上一个→左 -100%） */
function slotStyle(slot: 'A' | 'B'): { left: string } {
  if (slot === activeSlot.value) return { left: '0' }
  return { left: swipeDir.value === -1 ? '100%' : '-100%' }
}
/** inactive 槽位当前持有的 code（切换中的 pending），无切换时为 null */
const inactiveCode = computed(() => {
  const inactive: 'A' | 'B' = activeSlot.value === 'A' ? 'B' : 'A'
  return slotCodes.value[inactive]
})

// ===== 上一个/下一个（循环到首尾） =====
const currentIndex = computed(() => sortedCodes.value.indexOf(currentCode.value))
const nextCode = computed(() => {
  const list = sortedCodes.value
  if (list.length < 2) return null
  const i = currentIndex.value
  if (i < 0) return null
  return list[(i + 1) % list.length]
})
const prevCode = computed(() => {
  const list = sortedCodes.value
  if (list.length < 2) return null
  const i = currentIndex.value
  if (i < 0) return null
  return list[(i - 1 + list.length) % list.length]
})

// ===== 手势状态机 =====
// swipeState: idle 跟手前 / tracking 跟手中（无过渡）/ animating 松手后滑出滑入（有过渡）
const SWIPE_THRESHOLD = 60
const LOCK_AXIS_THRESHOLD = 10
const ANIM_MS = 290 // 略大于过渡时长，确保动画播完再提交

type SwipeState = 'idle' | 'tracking' | 'animating'
const swipeState = ref<SwipeState>('idle')
const swipeOffset = ref(0) // 正=向右拖(切上一个) 负=向左拖(切下一个)
const swipeDir = ref<1 | -1 | 0>(0) // 当前切换方向
let touchStartX = 0
let touchStartY = 0
let axisLocked: null | 'h' | 'v' = null
let animTimer: ReturnType<typeof setTimeout> | null = null

// track 整体位移：仅 animating 有过渡（滑出/滑入/回弹）；tracking 跟手无过渡；
// idle 归位无过渡（提交瞬间 track 瞬归 0，不让新页"再弹出一次"）；
// noTransition 提交时强制无过渡，防止浏览器按旧 transition 把归零位移播成"停靠回弹"
const trackStyle = computed(() => {
  const hasTransition = !noTransition.value && swipeState.value === 'animating'
  return {
    transform: `translateX(${swipeOffset.value}px)`,
    transition: hasTransition ? 'transform 0.28s cubic-bezier(0.32, 0.72, 0.32, 1)' : 'none',
  }
})
// 按钮高亮：仅跟手且方向匹配时加深，松手/动画不保持
const prevActive = computed(() => swipeState.value === 'tracking' && swipeOffset.value > 4)
const nextActive = computed(() => swipeState.value === 'tracking' && swipeOffset.value < -4)

// pane 实际宽度：取 track DOM 的 offsetWidth（= 内容区宽度，桌面端受 max-width:640px 限制）。
// 不能用 window.innerWidth——桌面宽屏下 innerWidth(如1200px) 远大于 pane 宽(640px)，
// track 会滑过头把 pane 推到屏外远处，提交归零时弹回 = "滑过边界弹回"。
const trackRef = ref<HTMLElement | null>(null)
function paneWidth(): number {
  if (trackRef.value) return trackRef.value.offsetWidth
  return typeof window !== 'undefined' ? window.innerWidth : 375
}

function clearAnimTimer() {
  if (animTimer) { clearTimeout(animTimer); animTimer = null }
}

// 安全网：animating 状态的兜底复位。iOS 后台/快速连续滑动时 290ms 的主 setTimeout 可能被节流延迟
// 或漏执行，导致 swipeState 永久卡 'animating' → onSwipeStart/goPrev/goNext 全部被挡，返回按钮与手势失效。
// 正常路径 commitSwitch 在 ANIM_MS(290ms) 复位并清掉安全网；若主 timer 漏执行，安全网在 1.5 倍时长后强制复位。
let safetyTimer: ReturnType<typeof setTimeout> | null = null
function armSafetyNet() {
  clearSafetyNet()
  safetyTimer = setTimeout(() => {
    safetyTimer = null
    if (swipeState.value === 'animating') {
      swipeState.value = 'idle'
      swipeOffset.value = 0
      swipeDir.value = 0
    }
  }, ANIM_MS * 1.5)
}
function clearSafetyNet() {
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
}

/** 开始一次切换：把目标 code 放到 inactive 槽位（屏外），pane 实例复用、不重建。
 *  立即开始预加载（pane 的 watch(fundCode) 触发 loadData），与滑出动画并行。 */
function beginSwitch(targetCode: string, dir: 1 | -1) {
  swipeDir.value = dir
  const inactive: 'A' | 'B' = activeSlot.value === 'A' ? 'B' : 'A'
  slotCodes.value = { ...slotCodes.value, [inactive]: targetCode }
}

/** 提交切换：翻转 activeSlot（角色交换），原 inactive 升为新 active（复用其已加载数据）。
 *  不换 key、不改 pane 实例、不改 fundCode prop → 无 loadData 重触发 → 无闪烁。
 *  防"停靠回弹"：浏览器对同帧内 transition 变化 + transform 变化会按旧 transition 播过渡。
 *  解法：先把 noTransition 置 true（track 强制 transition:none），nextTick 让浏览器应用该 style，
 *  再翻转槽位 + 归零位移——此时 transition:none 已生效，位移瞬间到位无过渡。
 *  翻转与归零同帧发生：B(left:100%→0) + track(-viewportWidth→0) 互相抵消，B 视觉位置不变（仍在视口内）。 */
const noTransition = ref(false)

function commitSwitch() {
  clearAnimTimer()
  const newActive: 'A' | 'B' = activeSlot.value === 'A' ? 'B' : 'A'
  const newCode = slotCodes.value[newActive]!
  // 1. 先强制 track 无过渡
  noTransition.value = true
  nextTick(() => {
    // 2. transition:none 已应用到 track DOM，安全翻转槽位 + 归零位移（无过渡，瞬间到位）
    swipeState.value = 'idle'
    clearSafetyNet()
    activeSlot.value = newActive
    currentCode.value = newCode
    const oldActive: 'A' | 'B' = activeSlot.value === 'A' ? 'B' : 'A'
    slotCodes.value = { ...slotCodes.value, [oldActive]: null }
    swipeDir.value = 0
    swipeOffset.value = 0
    // 路由同步：用 newCode（与 currentCode 同帧同值）。replace 后 route 异步更新成 newCode，
    // 触发 watch(route.params.code)，此时 code===currentCode → 自然 return，无需 internalNav 守卫。
    // ⚠️ 原在 nextTick 外用 currentCode.value（此时仍是旧值），导致 router.replace 用旧 code、
    //    route.params.code 不变，currentCode 与路由持续错位、history 栈被污染，返回按钮跳错页。
    if (route.params.code !== newCode) {
      router.replace({ name: 'FundDetail', params: { code: newCode } })
    }
    // 3. 下一帧恢复过渡（供下次 animating 用）
    nextTick(() => { noTransition.value = false })
  })
}

/** 取消切换：回弹归位，清掉 inactive 槽位的 pending code */
function cancelSwitch() {
  clearAnimTimer()
  swipeState.value = 'animating'
  swipeOffset.value = 0
  armSafetyNet()
  animTimer = setTimeout(() => {
    const inactive: 'A' | 'B' = activeSlot.value === 'A' ? 'B' : 'A'
    slotCodes.value = { ...slotCodes.value, [inactive]: null }
    swipeDir.value = 0
    swipeState.value = 'idle'
    clearSafetyNet()
  }, ANIM_MS)
}

function onSwipeStart(e: TouchEvent) {
  if (e.touches.length !== 1) return
  if (swipeState.value === 'animating') return
  const t = e.touches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
  axisLocked = null
  swipeOffset.value = 0
  swipeState.value = 'tracking'
}
function onSwipeMove(e: TouchEvent) {
  if (swipeState.value !== 'tracking') return
  const t = e.touches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  if (axisLocked === null) {
    if (Math.abs(dx) < LOCK_AXIS_THRESHOLD && Math.abs(dy) < LOCK_AXIS_THRESHOLD) return
    axisLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    // 锁定横向且确定方向时，把目标 code 放到 inactive 槽预加载
    if (axisLocked === 'h') {
      const dir: 1 | -1 = dx > 0 ? 1 : -1
      const target = dir > 0 ? prevCode.value : nextCode.value
      if (target && !inactiveCode.value) beginSwitch(target, dir)
    }
  }
  if (axisLocked !== 'h') return
  e.preventDefault() // 横向锁定：阻止页面滚动，真正接管手势
  // 边界橡皮筋：无可切换方向时给 0.3 阻尼
  const hasPending = swipeDir.value !== 0
  const damping = hasPending ? 1 : 0.3
  swipeOffset.value = dx * damping
}
function onSwipeEnd() {
  if (swipeState.value !== 'tracking') return
  // 未锁定横轴（纯点击/轻触未移动）：直接回 idle，不进 animating，让 click 正常触发按钮切换
  if (axisLocked !== 'h') {
    swipeState.value = 'idle'
    return
  }
  const offset = swipeOffset.value
  const hasPending = inactiveCode.value !== null
  if (hasPending && Math.abs(offset) >= SWIPE_THRESHOLD) {
    // 过阈值：滑出（current 滑出、pending 滑入），动画结束提交
    const dir: 1 | -1 = offset > 0 ? 1 : -1
    swipeState.value = 'animating'
    swipeOffset.value = dir * paneWidth()
    armSafetyNet()
    animTimer = setTimeout(commitSwitch, ANIM_MS)
  } else if (hasPending) {
    // 有 pending 但未过阈值：回弹，pending 滑回屏外后清掉
    cancelSwitch()
  } else {
    // 无 pending（边界阻尼滑动）：回弹
    swipeState.value = 'animating'
    swipeOffset.value = 0
    armSafetyNet()
    animTimer = setTimeout(() => { swipeState.value = 'idle'; clearSafetyNet() }, ANIM_MS)
  }
}

/** 按钮点击切换：完整滑出滑入动画 */
function goPrev() {
  if (prevCode.value && swipeState.value !== 'animating') animateSwitchByButton(prevCode.value, 1)
}
function goNext() {
  if (nextCode.value && swipeState.value !== 'animating') animateSwitchByButton(nextCode.value, -1)
}
function animateSwitchByButton(targetCode: string, dir: 1 | -1) {
  beginSwitch(targetCode, dir)
  swipeState.value = 'animating'
  swipeOffset.value = dir * paneWidth()
  armSafetyNet()
  animTimer = setTimeout(commitSwitch, ANIM_MS)
}

// document 级 non-passive touchmove：capture 阶段先于 echarts 拿到事件，横向锁定时 preventDefault
function onTouchMoveCapture(e: TouchEvent) { onSwipeMove(e) }

// keep-alive 兼容：App.vue 用 <keep-alive :max="3"> 包裹路由出口，详情页离开走 onDeactivated
// 而非 onUnmounted。若只在 onUnmounted 摘监听器，停用后该全局 touchmove 仍挂在 document 上，
// capture 阶段抢先拦截首页触摸并 preventDefault，导致首页滑动混乱、与详情页手势冲突。
// 因此 onActivated/onDeactivated 与 onMounted/onUnmounted 双注册：挂载+激活时装、卸载+停用时拆。
function addDocListener() {
  document.addEventListener('touchmove', onTouchMoveCapture, { passive: false, capture: true })
}
function removeDocListener() {
  document.removeEventListener('touchmove', onTouchMoveCapture, { capture: true })
}

/** 复位手势状态机：停用/卸载前调用，清掉位移、方向、计时器与 pending 槽位，避免残留监听读到非 idle 状态 */
function resetGesture() {
  clearAnimTimer()
  clearSafetyNet()
  swipeState.value = 'idle'
  swipeOffset.value = 0
  swipeDir.value = 0
  axisLocked = null
  // 清掉 inactive 槽位的 pending code，防止下次激活时残留屏外 pane
  const inactive: 'A' | 'B' = activeSlot.value === 'A' ? 'B' : 'A'
  slotCodes.value = { ...slotCodes.value, [inactive]: null }
}

onMounted(addDocListener)
onActivated(addDocListener)
onDeactivated(() => {
  removeDocListener()
  resetGesture()
})
onUnmounted(() => {
  removeDocListener()
  resetGesture()
})

// 路由同步：外部导航（首页点别的基金/前进后退）更新当前页（无动画，直接换内容）
// 去掉 internalNav boolean 守卫：commitSwitch 内部 replace 时，currentCode 已先于 route 更新成 newCode，
// route 随后跟上触发本 watch，此时 code===currentCode → 自然 return，无需守卫。
// boolean 守卫在快速连续滑动时会被前一次滑动的 route 更新误吞，导致 currentCode 错位、栈污染。
watch(() => route.params.code, (code) => {
  if (typeof code !== 'string' || !code) return
  if (code === currentCode.value) return   // 内部 replace 跟上的 route 更新，忽略
  // 外部导航：更新当前页，清掉 inactive 槽位残留 code，重置手势
  currentCode.value = code
  const inactive: 'A' | 'B' = activeSlot.value === 'A' ? 'B' : 'A'
  slotCodes.value = { A: activeSlot.value === 'A' ? code : slotCodes.value.A, B: activeSlot.value === 'B' ? code : null }
  void inactive
  swipeDir.value = 0
  swipeOffset.value = 0
  swipeState.value = 'idle'
  clearAnimTimer()
  clearSafetyNet()
})
</script>

<style scoped>
.fund-detail-shell {
  position: relative;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-base);
}
/* track：占满 shell，整体 translateX 同时移动两页 */
.pane-track {
  position: relative;
  width: 100%;
  height: 100%;
  will-change: transform;
}
/* 槽位：absolute 全宽，两个槽位并排（current 在 left:0，pending 由 swipeDir 定位屏外） */
.pane-slot {
  position: absolute;
  top: 0;
  width: 100%;
  height: 100%;
}
.pane-slot-current { left: 0; }
.pane-slot-pending { /* left 由 pendingSlotStyle 动态控制（100% 或 -100%） */ }
.pane {
  width: 100%;
  height: 100%;
}

/* 左右切换悬浮按钮：fixed 固定视口内容边界，不随页面位移。
   贴 640px 居中内容边界，窄屏(<640px)退化为贴 padding 边 */
.float-nav {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 50;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 52px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  background: rgba(128, 128, 128, 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s ease, color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}
/* 贴内容边界：max( padding边, 50vw - 320px + padding ) */
.float-nav-prev {
  left: max(var(--spacing-md), calc(50vw - 320px + var(--spacing-md)));
}
.float-nav-next {
  right: max(var(--spacing-md), calc(50vw - 320px + var(--spacing-md)));
}
.float-nav:hover {
  opacity: 0.85;
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-glow);
}
.float-nav:active { transform: translateY(-50%) scale(0.92); }
.float-nav.is-active {
  opacity: 1;
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-glow);
}
</style>
