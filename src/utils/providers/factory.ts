import { createAzureOpenAIClient } from './azureOpenAI';
import { createGeminiClient } from './gemini';
import { createOllamaClient } from './ollama';
import { createOpenAICompatibleClient } from './openaiCompatible';
import type { LLMClient, ProviderConfig } from './types';

export function createClient(conf: ProviderConfig): LLMClient {
  switch (conf.type) {
    case 'openai':
    case 'openai-compatible':
    case 'openrouter':
      return createOpenAICompatibleClient(conf);
    case 'azure-openai':
      return createAzureOpenAIClient(conf);
    case 'gemini':
      return createGeminiClient(conf);
    case 'ollama':
      return createOllamaClient(conf);
    default:
      return assertNever(conf);
  }
}

/** ProviderConfig 新增成员时强制 factory 同步实现。 */
function assertNever(conf: never): never {
  void conf;
  throw new Error('Unsupported provider configuration');
}
