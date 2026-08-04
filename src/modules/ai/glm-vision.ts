/**
 * GLM 视觉模型识别
 *
 * 调用智谱 GLM-4V-Flash 视觉模型，从持仓截图中识别基金数据
 * （代码/名称/持仓金额/累计盈亏/收益率）。
 *
 * 输入：图片 base64（data URL 或纯 base64）。
 * 输出：RecognizedFund[]（识别出的多只基金）。
 *
 * ⚠️ CORS：智谱 API 实测放行浏览器 CORS，可直连 open.bigmodel.cn，本地与 GitHub Pages 均可用。
 *   不走 vite 代理——代理转发偶发 ECONNRESET（智谱对代理连接重置），GitHub Pages 无代理相对路径会 405。
 *   若个别环境浏览器拦截直连，可临时把 API_URLS.GLM_API 改回 '/api/glm/chat/completions' 走 vite 代理（仅本地 dev）。
 *   API Key 通过 VITE_GLM_API_KEY 环境变量注入。
 */

import type { RecognizedFund } from './ai-types'
import { API_URLS, GLM_CONFIG } from '@/config/constants'
/**
 * GLM 识别 prompt。
 * 主要针对支付宝基金持仓截图（其他持仓 App 截图也支持）。
 * 只识别4个字段：基金名称、基金代码、持有金额、累计收益。
 *   - 持有金额/累计收益用于持仓编辑（填入持仓记录），收益率等不识别（系统自算）。
 */
const RECOGNITION_PROMPT = `你是一个基金持仓截图识别助手，主要识别支付宝基金持仓截图（其他持仓App截图同样适用）。请识别图中所有基金的信息，返回一个JSON数组，每个元素只包含以下字段：

- fundCode: 基金代码（6位纯数字，支付宝截图通常在基金名称下方或详情里）
- fundName: 基金名称（完整名称，如"易方达蓝筹精选混合"）
- holdingAmount: 持有金额/持仓金额（数值，单位元，如15234.56转为数字15234.56）
- accumulatedProfit: 累计收益/累计盈亏（数值，单位元，亏损为负数，如-123.45）

注意：
1. 只识别上述4个字段，不要识别收益率/涨跌幅/当日收益等（这些系统会自行计算）
2. "持有金额"/"持仓金额"等不同叫法统一映射为 holdingAmount
3. "累计收益"/"累计盈亏"等统一映射为 accumulatedProfit
4. accumulatedProfit 亏损必须为负数（如 -123.45）
5. 只返回JSON数组，不要返回任何其他文字说明
6. 如果某个字段无法识别，则该字段不包含在结果中
7. 确保fundCode是6位纯数字，无法确认6位代码的不要返回`

interface GLMResponse {
  choices: Array<{
    message: { content: string }
  }>
}

/** 读取错误响应体，提取智谱返回的可读错误信息。
 *  智谱错误体形如 { error: { code, message } }；非 JSON 时回退到纯文本 / statusText。 */
async function readErrorBody(resp: Response): Promise<string> {
  try {
    const text = await resp.text()
    if (!text) return resp.statusText
    try {
      const json = JSON.parse(text)
      const msg = json?.error?.message ?? json?.message ?? json?.msg
      const code = json?.error?.code ?? json?.code
      return [code && `code=${code}`, msg || text].filter(Boolean).join(' ')
    } catch {
      return text
    }
  } catch {
    return resp.statusText
  }
}

/**
 * 识别基金持仓截图。
 * @param imageBase64 图片 base64（data URL 或纯 base64）
 * @param signal 可选 AbortSignal（取消识别）
 * @returns 识别出的基金列表，fundCode 非6位数字的过滤掉
 */
export async function recognizeFundFromImage(
  imageBase64: string,
  signal?: AbortSignal,
): Promise<RecognizedFund[]> {
  const apiKey = GLM_CONFIG.API_KEY
  if (!apiKey) {
    throw new Error('未配置 GLM API Key')
  }

  const requestBody = {
    model: GLM_CONFIG.MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: RECOGNITION_PROMPT },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      },
    ],
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), GLM_CONFIG.TIMEOUT)
  // 外部 signal 取消时也中止
  signal?.addEventListener('abort', () => ctrl.abort())

  let response: GLMResponse
  try {
    const resp = await fetch(API_URLS.GLM_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) {
      // 透出服务端真实错误体（智谱返回 JSON 错误：{ error: { code, message } }）。
      // 但 vite proxy 转发失败（ECONNRESET 等）时上游无响应，proxy 自返 500 且无 body ——
      // 这种情况不是智谱业务错误，而是 proxy→智谱网络层失败，需用专属文案区分，避免误判成智谱 500。
      const errBody = await readErrorBody(resp)
      if (resp.status === 500 && !errBody) {
        throw new Error('GLM 代理转发失败 (500)：vite proxy → open.bigmodel.cn 连接被重置或网络拦截，请检查网络/代理（非智谱服务端错误）')
      }
      throw new Error(`GLM API 错误 (${resp.status}): ${errBody || resp.statusText}`)
    }
    response = await resp.json() as GLMResponse
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('GLM 识别超时或已取消')
    }
    // 已是带服务端错误信息的 GLM API 错误，直接透传，不再追加 CORS 误导提示
    if (e instanceof Error && e.message.startsWith('GLM API 错误')) {
      throw e
    }
    // 仅真正的网络/连接层失败才提示 CORS 代理
    throw new Error(`GLM 请求失败：${(e as Error).message}（可能需配置 CORS 代理）`)
  }

  const content = response.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('GLM API 返回内容为空')
  }

  const funds = parseFundsFromContent(content)
  return funds
    .filter(f => f.fundCode && /^\d{6}$/.test(String(f.fundCode)))
    .map(f => ({
      fundCode: String(f.fundCode),
      fundName: f.fundName || '',
      holdingAmount: f.holdingAmount != null ? Number(f.holdingAmount) : undefined,
      accumulatedProfit: f.accumulatedProfit != null ? Number(f.accumulatedProfit) : undefined,
    }))
}

/** 从模型返回内容中解析基金 JSON 数组。
 *  模型可能将数组包裹在 ```json 代码块里，或前后附带说明文字。
 *  优先剥代码块，再用平衡括号扫描定位数组，避免贪婪正则误吞后续文本。 */
function parseFundsFromContent(content: string): RecognizedFund[] {
  // 1. 优先剥 ```json / ``` 代码块
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenceMatch ? fenceMatch[1] : content).trim()

  // 2. 直接整体解析（理想情况：返回的就是纯 JSON 数组）
  try {
    const direct = JSON.parse(candidate)
    if (Array.isArray(direct)) return direct as RecognizedFund[]
  } catch { /* 继续 fallback */ }

  // 3. 平衡括号扫描：从首个 '[' 到匹配的 ']'，避免贪婪 / 非贪婪误截
  const start = candidate.indexOf('[')
  if (start === -1) {
    throw new Error('无法从 AI 响应中提取基金信息（未找到 JSON 数组）')
  }
  let depth = 0, inStr = false, escape = false, end = -1
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]
    if (inStr) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '[') depth++
    else if (ch === ']') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) {
    throw new Error('无法从 AI 响应中提取基金信息（JSON 数组不完整）')
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch (e) {
    throw new Error(`AI 响应 JSON 解析失败：${(e as Error).message}`)
  }
}
