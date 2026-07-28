/**
 * 任务管理 Store - 管理定时任务（估值刷新、收盘提醒等）
 * 职责：任务 CRUD、状态流转、调度器管理
 * 不包含：估值获取（fund.ts）、持仓（holding.ts）、缓存（cache.ts）
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ScheduledTask } from '@/modules/reserved/task-types'
import { TaskType, TaskStatus, TaskRepeatMode } from '@/modules/reserved/task-types'
import { createTask, updateTaskStatus, markTaskExecuted, cancelTask, removeFinishedTasks, getActiveTasks, loadTasks, saveTasks, TaskScheduler } from '@/shared/utils/task-manager'

export const useTaskStore = defineStore('task', () => {
  // ===== 基础状态 =====

  /** 所有任务列表 */
  const tasks = ref<ScheduledTask[]>([])

  /** 任务调度器实例 */
  const scheduler = ref<TaskScheduler | null>(null)

  // ===== 计算属性 =====

  /** 活跃任务列表 */
  const activeTasks = computed(() => getActiveTasks(tasks.value))

  /** 待执行任务数量 */
  const pendingCount = computed(() => tasks.value.filter(t => t.status === TaskStatus.Pending).length)

  /** 已完成任务数量 */
  const completedCount = computed(() => tasks.value.filter(t => t.status === TaskStatus.Completed).length)

  /** 指定基金的活跃任务 */
  function getTasksByFund(fundCode: string): ScheduledTask[] {
    return tasks.value.filter(t => t.fundCode === fundCode)
  }

  // ===== 任务操作 =====

  /** 创建新任务并添加到列表 */
  function addTask(
    fundCode: string,
    fundName: string,
    type: TaskType,
    scheduledTime: string,
    repeatMode: TaskRepeatMode = TaskRepeatMode.Once,
    note?: string,
  ): ScheduledTask {
    const task = createTask(fundCode, fundName, type, scheduledTime, repeatMode, note)
    tasks.value.push(task)
    persistTasks()
    return task
  }

  /** 更新任务状态 */
  function updateStatus(taskId: string, status: TaskStatus): void {
    tasks.value = updateTaskStatus(tasks.value, taskId, status)
    persistTasks()
  }

  /** 标记任务已执行 */
  function markExecuted(taskId: string): void {
    tasks.value = markTaskExecuted(tasks.value, taskId)
    persistTasks()
  }

  /** 取消任务 */
  function cancelTaskById(taskId: string): void {
    tasks.value = cancelTask(tasks.value, taskId)
    persistTasks()
  }

  /** 清理已完成/已取消的任务 */
  function clearFinishedTasks(): void {
    tasks.value = removeFinishedTasks(tasks.value)
    persistTasks()
  }

  // ===== 调度器管理 =====

  /** 启动任务调度器 */
  function startScheduler(onExecute: (task: ScheduledTask) => void): void {
    if (scheduler.value) return
    scheduler.value = new TaskScheduler(onExecute)
    scheduler.value.start()
  }

  /** 停止任务调度器 */
  function stopScheduler(): void {
    if (scheduler.value) {
      scheduler.value.stop()
      scheduler.value = null
    }
  }

  /** 调度器是否运行中 */
  function isSchedulerRunning(): boolean {
    return scheduler.value?.isRunning() ?? false
  }

  // ===== 数据持久化 =====

  /** 从 localStorage 恢复任务 */
  function restoreTasks(): void {
    tasks.value = loadTasks()
  }

  /** 持久化任务列表 */
  function persistTasks(): void {
    saveTasks(tasks.value)
  }

  return {
    tasks,
    activeTasks,
    pendingCount,
    completedCount,
    getTasksByFund,
    addTask,
    updateStatus,
    markExecuted,
    cancelTaskById,
    clearFinishedTasks,
    startScheduler,
    stopScheduler,
    isSchedulerRunning,
    restoreTasks,
  }
})
