import type { BaseProviderConfig, ChatMessage, ProviderRef } from './types';

export const DEFAULT_PROVIDER_TIMEOUT_MS = 120_000;

/**
 * 两个引用是否指向同一个 Provider：厂商忽略大小写（DeepSeek 与 deepseek 相同），模型精确匹配。
 * 按字段比较而不是拼接成字符串，厂商或模型名里出现任何字符都不会产生歧义。
 */
export function isSameProvider(a: ProviderRef, b: ProviderRef): boolean {
  return a.vendor.trim().toLowerCase() === b.vendor.trim().toLowerCase() && a.model.trim() === b.model.trim();
}

/** 面向用户的名称，例如「DeepSeek · deepseek-chat」。 */
export function getProviderLabel({ vendor, model }: ProviderRef): string {
  return `${vendor} · ${model}`;
}

/** 返回 Provider 的有效超时；配置校验负责拒绝非正数。 */
export function getProviderTimeoutMs(conf: BaseProviderConfig): number {
  return conf.timeout_ms ?? DEFAULT_PROVIDER_TIMEOUT_MS;
}

/** 将公共聊天消息复制为 OpenAI Chat Completions 可接受的文本消息。 */
export function toOpenAIChatMessages(messages: ChatMessage[]) {
  return messages.map(({ role, content }) => ({ role, content }));
}

/**
 * 合并上游取消信号与 Provider 超时。
 * 调用方必须在请求结束后执行 dispose，避免长期保留取消监听器。
 */
export function createRequestAbortScope(
  timeoutMs: number,
  upstreamSignal?: AbortSignal
): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal?.aborted) {
    abortFromUpstream();
  } else {
    upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    },
  };
}

/** 未知异常只在通用错误边界提取标准 Error.message。 */
export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 拼接 API 根地址与相对路径，兼容根地址末尾有无斜杠。 */
export function joinUrl(baseUrl: string, path: string): URL {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

/**
 * 发送带超时的 JSON POST 请求，并把非 2xx 响应转换为带服务端错误信息的 Error。
 * 取代 SDK 后，所有 HTTP adapter 共用这一个错误边界。
 */
export async function postJson(
  label: string,
  url: URL | string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  upstreamSignal?: AbortSignal
): Promise<unknown> {
  const abortScope = createRequestAbortScope(timeoutMs, upstreamSignal);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: abortScope.signal,
    });
    if (!response.ok) {
      const detail = extractErrorDetail(await response.text().catch(() => ''));
      throw new Error(`${label} request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return await response.json();
  } catch (error) {
    if (abortScope.signal.aborted && abortScope.signal.reason instanceof Error) {
      throw abortScope.signal.reason;
    }
    throw error;
  } finally {
    abortScope.dispose();
  }
}

/** 从 OpenAI / Gemini / Azure / Ollama 常见的错误响应体中提取一句可读信息。 */
export function extractErrorDetail(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    if (isRecord(value)) {
      const error = value.error;
      if (typeof error === 'string') {
        return error;
      }
      if (isRecord(error) && typeof error.message === 'string') {
        return error.message;
      }
      if (typeof value.message === 'string') {
        return value.message;
      }
    }
  } catch {
    // 非 JSON 响应体按纯文本截断展示。
  }
  return trimmed.slice(0, 200);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
