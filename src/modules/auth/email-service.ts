/**
 * EmailJS 邮件发送服务 - 浏览器直调 EmailJS REST API 发验证码邮件
 *
 * 与 glm-vision.ts 同套路：key 走 config 常量，fetch + 友好错误提取。
 * EmailJS 在其后台接入 QQ 邮箱 SMTP（2831140538@qq.com）作发件源，浏览器只持 public key。
 *
 * 降级：SERVICE_ID/TEMPLATE_ID/PUBLIC_KEY 任一为空（未配置）→ 不调 EmailJS，
 *   改为「控制台打印验证码 + 返回降级标记」，调用方据此 Toast 提示用户，保证 UI 流程可跑通。
 */

import { EMAILJS_CONFIG } from '@/config/constants'

/** EmailJS 是否已配置（三项 key 全填） */
export function isEmailConfigured(): boolean {
  return !!(EMAILJS_CONFIG.SERVICE_ID && EMAILJS_CONFIG.TEMPLATE_ID && EMAILJS_CONFIG.PUBLIC_KEY)
}

/** 读取 EmailJS 错误响应体 → 友好文案。EmailJS 错误体形如 { status, text }。 */
async function readEmailError(resp: Response): Promise<string> {
  try {
    const text = await resp.text()
    if (!text) return resp.statusText
    try {
      const json = JSON.parse(text)
      // EmailJS: { status: 4xx, text: '...' }
      const msg = json?.text ?? json?.message ?? json?.msg
      return msg || text
    } catch {
      return text
    }
  } catch {
    return resp.statusText
  }
}

export interface SendResult {
  /** true=已通过 EmailJS 发送；false=降级（未配置 key，控制台打印了码） */
  sent: boolean
  /** 降级时的友好提示文案（sent=false 时用于 Toast） */
  fallbackHint?: string
}

/**
 * 给用户邮箱发送验证码邮件。
 * @param toEmail   收件邮箱
 * @param code      6 位验证码
 * @param expireMin 有效期分钟数（模板变量）
 */
export async function sendVerifyCodeEmail(toEmail: string, code: string, expireMin: number): Promise<SendResult> {
  // 未配置 EmailJS → 降级：控制台打印码，返回降级提示
  if (!isEmailConfigured()) {
    // eslint-disable-next-line no-console
    console.warn(`[auth] EmailJS 未配置，验证码降级输出：${code}（${expireMin} 分钟内有效，收件：${toEmail}）`)
    return {
      sent: false,
      fallbackHint: `未配置邮件服务，验证码：${code}（开发模式，请配置 EmailJS 后启用真实发信）`,
    }
  }

  const body = {
    service_id: EMAILJS_CONFIG.SERVICE_ID,
    template_id: EMAILJS_CONFIG.TEMPLATE_ID,
    user_id: EMAILJS_CONFIG.PUBLIC_KEY,
    template_params: {
      to_email: toEmail,
      code,
      expire: `${expireMin}`,
    },
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)

  try {
    const resp = await fetch(EMAILJS_CONFIG.SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) {
      const errText = await readEmailError(resp)
      throw new Error(`邮件发送失败：${errText}`)
    }
    return { sent: true }
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('邮件发送超时，请稍后重试')
    }
    throw e instanceof Error ? e : new Error('邮件发送失败')
  }
}
