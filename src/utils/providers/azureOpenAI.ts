import type { OpenAIChatRequest } from './openaiCompatible';
import { parseOpenAIChatResponse } from './openaiCompatible';
import { getProviderLabel, getProviderTimeoutMs, joinUrl, postJson, toOpenAIChatMessages } from './shared';
import type { AzureOpenAIConfig, ChatMessage, LLMClient } from './types';

/** Azure OpenAI 仍要求 model 字段，但实际路由由 deployment 决定。 */
export function buildAzureOpenAIChatRequest(conf: AzureOpenAIConfig, messages: ChatMessage[]): OpenAIChatRequest {
  return {
    model: conf.model,
    messages: toOpenAIChatMessages(messages),
    ...(typeof conf.params?.temperature === 'number' ? { temperature: conf.params.temperature } : {}),
    ...(typeof conf.params?.top_p === 'number' ? { top_p: conf.params.top_p } : {}),
    ...(typeof conf.params?.max_tokens === 'number' ? { max_tokens: conf.params.max_tokens } : {}),
  };
}

/** 按 Azure 的部署路由拼接 Chat Completions 地址，与 openai SDK 的 AzureOpenAI 客户端一致。 */
export function buildAzureOpenAIEndpoint(conf: AzureOpenAIConfig): URL {
  const url = joinUrl(conf.endpoint, `openai/deployments/${encodeURIComponent(conf.deployment)}/chat/completions`);
  url.searchParams.set('api-version', conf.api_version);
  return url;
}

export function createAzureOpenAIClient(conf: AzureOpenAIConfig): LLMClient {
  const endpoint = buildAzureOpenAIEndpoint(conf);
  const headers = { 'api-key': conf.api_key, ...conf.headers };

  return {
    async chat(messages, options): Promise<string> {
      const response = await postJson(
        getProviderLabel(conf),
        endpoint,
        buildAzureOpenAIChatRequest(conf, messages),
        headers,
        getProviderTimeoutMs(conf),
        options?.signal
      );
      return parseOpenAIChatResponse(response);
    },
  };
}
