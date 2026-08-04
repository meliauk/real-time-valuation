/**
 * 图像识别 Composable - 基于 GLM-4V-Flash 视觉模型
 * 将基金持仓截图转为结构化的基金持仓数据
 */

import { ref } from 'vue'
import { useFundStore } from '@/modules/fund/fund-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { recognizeFundFromImage } from '@/modules/ai/glm-vision'
import { matchFundByCatalogName } from '@/modules/fund/catalog/fund-name-match'
import { isValidFundCode } from '@/shared/utils/validation'
import { safeDivide } from '@/shared/utils/safe-math'
import type { RecognizedFund, RecognitionStatus } from '@/modules/ai/ai-types'

const MAX_CONCURRENT = 3
/** 单张图 GLM 识别失败后的最大重试次数（含首次，即最多调用 GLM_MAX_ATTEMPTS 次）。
 *  视觉模型偶发返回空/解析失败或网络抖动（ECONNRESET/超时），重试能显著提高单图识别成功率。 */
const GLM_MAX_ATTEMPTS = 3
/** 重试退避基数（毫秒），第 n 次重试等待 n × 此值 */
const GLM_RETRY_BACKOFF = 600
const FILE_READER_TIMEOUT = 10000
const IMAGE_MAX_SIZE = 1024
const IMAGE_QUALITY = 0.8

export function useImageRecognition() {
  const fundStore = useFundStore()
  const holdingStore = useHoldingStore()

  const recognizedFunds = ref<RecognizedFund[]>([])
  const status = ref<RecognitionStatus>('idle')
  const progress = ref({ done: 0, total: 0 })
  const errorMessage = ref('')

  const abortControllers = ref<AbortController[]>([])

  /** 将图片文件压缩并转为 base64 Data URL */
  function readFileAsBase64(file: File, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }

      const img = new Image()
      const url = URL.createObjectURL(file)

      const timer = setTimeout(() => {
        URL.revokeObjectURL(url)
        reject(new Error('文件读取超时'))
      }, FILE_READER_TIMEOUT)

      img.onload = () => {
        URL.revokeObjectURL(url)
        clearTimeout(timer)

        try {
          // 缩放到最大边不超过 IMAGE_MAX_SIZE
          let { width, height } = img
          if (Math.max(width, height) > IMAGE_MAX_SIZE) {
            const ratio = IMAGE_MAX_SIZE / Math.max(width, height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, width, height)

          // 压缩为 JPEG，quality 由 IMAGE_QUALITY 控制
          const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY)
          resolve(dataUrl)
        } catch (e) {
          reject(new Error('图片处理失败'))
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        clearTimeout(timer)
        reject(new Error('图片加载失败'))
      }

      if (signal) {
        signal.addEventListener('abort', () => {
          URL.revokeObjectURL(url)
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      }

      img.src = url
    })
  }

  /** 批量识别图片中的基金信息 */
  async function recognizeImages(files: File[]): Promise<void> {
    if (files.length === 0) return

    status.value = 'reading'
    progress.value = { done: 0, total: files.length }
    errorMessage.value = ''
    recognizedFunds.value = []

    // 为每个文件创建 AbortController
    abortControllers.value = files.map(() => new AbortController())

    const allFunds: RecognizedFund[] = []
    let firstError: string | null = null
    let queueIndex = 0

    async function processNext(): Promise<void> {
      while (queueIndex < files.length) {
        const i = queueIndex++
        const file = files[i]
        const controller = abortControllers.value[i]

        try {
          status.value = 'recognizing'
          const base64 = await readFileAsBase64(file, controller.signal)
          // 单图识别带重试：视觉模型偶发返回空/解析失败或网络抖动，重试提高单图成功率
          let funds: RecognizedFund[] = []
          let lastErr: unknown = null
          for (let attempt = 1; attempt <= GLM_MAX_ATTEMPTS; attempt++) {
            if (controller.signal.aborted) break
            try {
              funds = await recognizeFundFromImage(base64, controller.signal)
              break
            } catch (e) {
              lastErr = e
              // 用户取消则不重试
              if (e instanceof DOMException && e.name === 'AbortError') break
              // 还有重试机会 → 退避后重试
              if (attempt < GLM_MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, attempt * GLM_RETRY_BACKOFF))
              }
            }
          }
          if (controller.signal.aborted) return
          if (funds.length === 0 && lastErr) {
            // 重试用尽仍失败 → 记录错误，该图无结果
            const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
            if (!firstError) firstError = msg
          }
          allFunds.push(...funds)
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return
          // 记录第一个错误，用于展示给用户
          const msg = e instanceof Error ? e.message : String(e)
          if (!firstError) firstError = msg
        } finally {
          progress.value.done++
        }
      }
    }

    // 限制并发
    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT, files.length) },
      () => processNext(),
    )

    await Promise.allSettled(workers)

    // 先补码、再去重：补码前 fundCode 可能是 "QDII" 这类非6位占位（支付宝截图本身不含代码），
    // 若先按 fundCode 去重会把多只 QDII 基金错误合并成一条。故先用 fundName 补齐真实代码再去重。
    for (const fund of allFunds) {
      if (!isValidFundCode(fund.fundCode) && fund.fundName) {
        try {
          const m = await matchFundByCatalogName(fund.fundName)
          if (m) {
            fund.fundCode = m.fundCode
            if (!fund.fundName) fund.fundName = m.matchedName
          }
        } catch {
          // 目录加载/匹配失败保持原样
        }
      }
    }

    // 去重（按补码后的真实 fundCode）
    const seen = new Map<string, RecognizedFund>()
    for (const f of allFunds) {
      const existing = seen.get(f.fundCode)
      if (!existing) {
        seen.set(f.fundCode, f)
      } else {
        // 合并：如果现有记录缺少字段，用新记录补充
        seen.set(f.fundCode, {
          ...existing,
          holdingAmount: existing.holdingAmount ?? f.holdingAmount,
          accumulatedProfit: existing.accumulatedProfit ?? f.accumulatedProfit,
          fundName: existing.fundName || f.fundName,
        })
      }
    }

    const results = Array.from(seen.values())

    // 过滤掉仍然无效的（补码后仍非6位）
    recognizedFunds.value = results.filter(f => isValidFundCode(f.fundCode))

    if (recognizedFunds.value.length === 0 && files.length > 0) {
      errorMessage.value = firstError || '未识别到有效的基金信息'
      status.value = 'error'
    } else {
      status.value = 'done'
    }
  }

  /** 取消所有进行中的识别请求 */
  function cancelRecognition(): void {
    for (const c of abortControllers.value) {
      c.abort()
    }
    abortControllers.value = []
    status.value = 'idle'
  }

  /** 将识别结果导入 store */
  async function importRecognized(): Promise<number> {
    let imported = 0
    for (const fund of recognizedFunds.value) {
      const isNew = !fundStore.fundCodes.includes(fund.fundCode)
      if (isNew) {
        fundStore.addFund(fund.fundCode, fund.fundName)
      }

      const hasHolding = fund.holdingAmount != null || fund.accumulatedProfit != null
      if (hasHolding) {
        // 封闭式派生模型：将识别的持有金额/累计盈亏转换为份额+成本价
        const recognizedAmount = fund.holdingAmount ?? 0
        const recognizedProfit = fund.accumulatedProfit ?? 0
        const costBasis = recognizedAmount - recognizedProfit // 投入本金 = 持有金额 - 累计盈亏
        const existing = holdingStore.activeHoldings.find(h => h.fundCode === fund.fundCode)
        if (existing) {
          // 已有持仓：重置确认日期，让 syncYesterdayAmounts 重新按今日涨跌幅迁移昨日金额
          existing.lastConfirmedDate = undefined
          existing.confirmedBaseAmount = undefined
          holdingStore.persistHoldings()
        } else {
          // 新持仓：根据识别的金额反算份额和成本价
          // 份额 = 持有金额（以1为参考净值），成本价 = 投入本金 / 份额
          const shares = recognizedAmount > 0 ? recognizedAmount : 1
          const costPrice = shares > 0 ? safeDivide(costBasis, shares) : 0
          holdingStore.addHoldingDirect(fund.fundCode, shares, costPrice, recognizedAmount, recognizedProfit)
        }
      }

      if (isNew) {
        await fundStore.fetchValuation(fund.fundCode)
      }

      imported++
    }
    return imported
  }

  /** 重置识别状态 */
  function resetRecognition(): void {
    recognizedFunds.value = []
    status.value = 'idle'
    progress.value = { done: 0, total: 0 }
    errorMessage.value = ''
    abortControllers.value = []
  }

  return {
    recognizedFunds,
    status,
    progress,
    errorMessage,
    recognizeImages,
    cancelRecognition,
    importRecognized,
    resetRecognition,
  }
}
