/**
 * 计划任务管理器 - 定时估值刷新/收盘提醒/净值更新的 CRUD 与调度
 * 数据持久化到 localStorage，调度逻辑基于 setInterval
 */

import type { ScheduledTask } from '@/modules/reserved/task-types'
import { TaskType, TaskStatus, TaskRepeatMode } from '@/modules/reserved/task-types'
import { STORAGE_KEYS } from '@/config/constants'
import { generateId } from '@/shared/utils/validation'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'

/** 从 localStorage 读取所有任务 */
export function loadTasks(): ScheduledTask[] {
  const tasks = loadJSON<ScheduledTask[]>(STORAGE_KEYS.TASKS, [])
  return Array.isArray(tasks) ? tasks.filter(t => t.fundCode && t.id) : []
}

/** 将任务列表持久化到 localStorage */
export function saveTasks(tasks: ScheduledTask[]): void {
  saveJSON(STORAGE_KEYS.TASKS, tasks)
}

/** 创建新任务 */
export function createTask(
  fundCode: string,
  fundName: string,
  type: TaskType,
  scheduledTime: string,
  repeatMode: TaskRepeatMode = TaskRepeatMode.Once,
  note?: string,
): ScheduledTask {
  return {
    id: generateId(),
    fundCode,
    fundName,
    type,
    status: TaskStatus.Pending,
    scheduledTime,
    repeatMode,
    createdAt: Date.now(),
    executionCount: 0,
    lastExecutedAt: null,
    note,
  }
}

/** 更新任务状态 */
export function updateTaskStatus(tasks: ScheduledTask[], taskId: string, status: TaskStatus): ScheduledTask[] {
  return tasks.map(t => t.id === taskId ? { ...t, status } : t)
}

/** 标记任务已执行 - 增加执行计数，更新最后执行时间 */
export function markTaskExecuted(tasks: ScheduledTask[], taskId: string): ScheduledTask[] {
  return tasks.map(t => {
    if (t.id !== taskId) return t
    const newCount = t.executionCount + 1
    // 一次性任务执行后自动标记完成
    const newStatus = t.repeatMode === TaskRepeatMode.Once ? TaskStatus.Completed : TaskStatus.Pending
    return {
      ...t,
      executionCount: newCount,
      lastExecutedAt: Date.now(),
      status: newStatus,
    }
  })
}

/** 取消任务 - 将状态改为已取消 */
export function cancelTask(tasks: ScheduledTask[], taskId: string): ScheduledTask[] {
  return updateTaskStatus(tasks, taskId, TaskStatus.Cancelled)
}

/** 删除已完成或已取消的任务 */
export function removeFinishedTasks(tasks: ScheduledTask[]): ScheduledTask[] {
  return tasks.filter(t => t.status !== TaskStatus.Completed && t.status !== TaskStatus.Cancelled)
}

/** 获取活跃任务（待执行 + 执行中） */
export function getActiveTasks(tasks: ScheduledTask[]): ScheduledTask[] {
  return tasks.filter(t => t.status === TaskStatus.Pending || t.status === TaskStatus.Running)
}

/** 任务调度器 - 基于 setInterval 定时检查并执行到期任务 */
export class TaskScheduler {
  private timerId: number | null = null
  private onExecute: (task: ScheduledTask) => void
  private intervalMs: number

  constructor(onExecute: (task: ScheduledTask) => void, intervalMs: number = 60000) {
    this.onExecute = onExecute
    this.intervalMs = intervalMs
  }

  /** 启动调度器 */
  start(): void {
    if (this.timerId) return
    this.timerId = window.setInterval(() => {
      this.checkAndExecute()
    }, this.intervalMs)
  }

  /** 停止调度器 */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  /** 检查到期任务并执行回调 */
  private checkAndExecute(): void {
    const tasks = loadTasks()
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

    const activeTasks = getActiveTasks(tasks)
    for (const task of activeTasks) {
      if (task.scheduledTime === currentTime) {
        this.onExecute(task)
      }
    }
  }

  /** 调度器是否运行中 */
  isRunning(): boolean {
    return this.timerId !== null
  }
}
