import { getProviderLabel, getProviderTimeoutMs, isRecord, postJson } from './shared';
import type { ChatMessage, GeminiConfig, LLMClient } from './types';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/';

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

/** 将统一角色映射为 Gemini 的 user/model 内容，并把 system 消息提升为 systemInstruction。 */
export function buildGeminiRequest(conf: GeminiConfig, messages: ChatMessage[]): GeminiGenerateContentRequest {
  const systemInstruction = messages
    .filter(({ role }) => role === 'system')
    .map(({ content }) => content)
    .join('\n\n');
  const contents: GeminiContent[] = messages
    .filter(({ role }) => role !== 'system')
    .map(({ role, content }) => ({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text: content }],
    }));

  if (!contents.length) {
    throw new Error('Gemini requires at least one user or assistant message');
  }

  const generationConfig = {
    ...(typeof conf.params?.temperature === 'number' ? { temperature: conf.params.temperature } : {}),
    ...(typeof conf.params?.top_p === 'number' ? { topP: conf.params.top_p } : {}),
    ...(typeof conf.params?.max_tokens === 'number' ? { maxOutputTokens: conf.params.max_tokens } : {}),
  };

  return {
    contents,
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };
}

export function buildGeminiEndpoint(conf: GeminiConfig): URL {
  return new URL(`models/${encodeURIComponent(conf.model)}:generateContent`, GEMINI_API_BASE_URL);
}

/** 与 SDK 的 response.text 一致：拼接首个候选中的文本 part，跳过思考过程 part。 */
export function parseGeminiResponse(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.candidates)) {
    throw new Error('Gemini returned an invalid response');
  }
  const [candidate] = value.candidates as unknown[];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    return '';
  }
  return (candidate.content.parts as unknown[])
    .filter(
      (part): part is { text: string } => isRecord(part) && typeof part.text === 'string' && part.thought !== true
    )
    .map(({ text }) => text)
    .join('');
}

export function createGeminiClient(conf: GeminiConfig): LLMClient {
  const endpoint = buildGeminiEndpoint(conf);
  const headers = { 'x-goog-api-key': conf.api_key, ...conf.headers };

  return {
    async chat(messages, options): Promise<string> {
      const response = await postJson(
        getProviderLabel(conf),
        endpoint,
        buildGeminiRequest(conf, messages),
        headers,
        getProviderTimeoutMs(conf),
        options?.signal
      );
      return parseGeminiResponse(response);
    },
  };
}
