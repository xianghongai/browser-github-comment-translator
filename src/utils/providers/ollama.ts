import { getProviderLabel, getProviderTimeoutMs, joinUrl, postJson } from './shared';
import type { ChatMessage, LLMClient, OllamaConfig } from './types';

export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

export interface OllamaChatRequest {
  model: string;
  messages: ChatMessage[];
  stream: false;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

/** 按 Ollama /api/chat 契约构造非流式请求，max_tokens 映射为 num_predict。 */
export function buildOllamaChatRequest(conf: OllamaConfig, messages: ChatMessage[]): OllamaChatRequest {
  const options = {
    ...(typeof conf.params?.temperature === 'number' ? { temperature: conf.params.temperature } : {}),
    ...(typeof conf.params?.top_p === 'number' ? { top_p: conf.params.top_p } : {}),
    ...(typeof conf.params?.max_tokens === 'number' ? { num_predict: conf.params.max_tokens } : {}),
  };

  return {
    model: conf.model,
    messages,
    stream: false,
    ...(Object.keys(options).length ? { options } : {}),
  };
}

/** 只消费官方 ChatResponse.message.content，不猜测其它响应字段。 */
export function parseOllamaChatResponse(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('message' in value) ||
    typeof value.message !== 'object' ||
    value.message === null ||
    !('content' in value.message) ||
    typeof value.message.content !== 'string'
  ) {
    throw new Error('Ollama returned an invalid chat response');
  }
  return value.message.content;
}

/** 创建 Ollama 原生 /api/chat 客户端，不要求 API Key。 */
export function createOllamaClient(conf: OllamaConfig): LLMClient {
  const endpoint = joinUrl(conf.base_url ?? DEFAULT_OLLAMA_BASE_URL, 'api/chat');

  return {
    async chat(messages, options): Promise<string> {
      const response = await postJson(
        getProviderLabel(conf),
        endpoint,
        buildOllamaChatRequest(conf, messages),
        conf.headers ?? {},
        getProviderTimeoutMs(conf),
        options?.signal
      );
      return parseOllamaChatResponse(response);
    },
  };
}
