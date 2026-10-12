import { getProviderLabel, getProviderTimeoutMs, isRecord, joinUrl, postJson, toOpenAIChatMessages } from './shared';
import type { ChatMessage, LLMClient, OpenAIChatConfig } from './types';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export interface OpenAIChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  top_p?: number;
  max_tokens?: number;
}

/** 构造 OpenAI Chat Completions 请求体，保持已验证的 compatible 参数映射。 */
export function buildOpenAIChatRequest(conf: OpenAIChatConfig, messages: ChatMessage[]): OpenAIChatRequest {
  return {
    model: conf.model,
    messages: toOpenAIChatMessages(messages),
    temperature: conf.params?.temperature ?? 0.7,
    ...(typeof conf.params?.top_p === 'number' ? { top_p: conf.params.top_p } : {}),
    ...(typeof conf.params?.max_tokens === 'number' ? { max_tokens: conf.params.max_tokens } : {}),
  };
}

/** 只消费 Chat Completions 的 choices[0].message.content。 */
export function parseOpenAIChatResponse(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new Error('OpenAI-compatible service returned an invalid chat response');
  }
  const [choice] = value.choices as unknown[];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return '';
  }
  return typeof choice.message.content === 'string' ? choice.message.content : '';
}

/** 创建 OpenAI 官方、OpenRouter 或 OpenAI-compatible 聊天客户端。 */
export function createOpenAICompatibleClient(conf: OpenAIChatConfig): LLMClient {
  const endpoint = joinUrl(conf.base_url ?? DEFAULT_OPENAI_BASE_URL, 'chat/completions');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${conf.api_key}`,
    ...(conf.organization ? { 'OpenAI-Organization': conf.organization } : {}),
    ...conf.headers,
  };

  return {
    async chat(messages, options): Promise<string> {
      const response = await postJson(
        getProviderLabel(conf),
        endpoint,
        buildOpenAIChatRequest(conf, messages),
        headers,
        getProviderTimeoutMs(conf),
        options?.signal
      );
      return parseOpenAIChatResponse(response);
    },
  };
}
