/** Provider 类型与 vscode-ai-commit 的 `ai-commit.providers` 保持一致，便于直接粘贴导入。 */
export type ProviderType = 'openai' | 'openai-compatible' | 'openrouter' | 'gemini' | 'azure-openai' | 'ollama';

export const PROVIDER_TYPES: readonly ProviderType[] = [
  'openai',
  'openai-compatible',
  'openrouter',
  'gemini',
  'azure-openai',
  'ollama',
];

export type ModelKind = 'chat';

/** 所有 adapter 共同消费的最小聊天消息契约。 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 单次聊天调用的运行时控制项，不写入持久化配置。 */
export interface ChatRequestOptions {
  signal?: AbortSignal;
}

/** 各 Provider 当前共同支持的生成参数。 */
export interface ChatGenerationParams {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

/** Provider 配置的公共字段；timeout_ms 的单位为毫秒。 */
export interface BaseProviderConfig {
  /** 厂商名称，例如 DeepSeek；与 model 一起构成唯一标识。 */
  vendor: string;
  type: ProviderType;
  model: string;
  model_kind?: ModelKind;
  timeout_ms?: number;
  headers?: Record<string, string>;
  params?: ChatGenerationParams;
}

/** 引用某个 Provider：厂商 + 模型 两个字段共同构成唯一标识。 */
export type ProviderRef = Pick<BaseProviderConfig, 'vendor' | 'model'>;

/** OpenAI 官方服务允许省略 base_url，此时使用官方默认地址。 */
export interface OpenAIConfig extends BaseProviderConfig {
  type: 'openai';
  base_url?: string;
  api_key: string;
  organization?: string;
}

/** OpenAI-compatible 与 OpenRouter 必须明确声明目标 API 根地址。 */
export interface OpenAICompatibleConfig extends BaseProviderConfig {
  type: 'openai-compatible' | 'openrouter';
  base_url: string;
  api_key: string;
  organization?: string;
}

export type OpenAIChatConfig = OpenAIConfig | OpenAICompatibleConfig;

/** Azure OpenAI 使用 endpoint、deployment 与 api_version 契约。 */
export interface AzureOpenAIConfig extends BaseProviderConfig {
  type: 'azure-openai';
  endpoint: string;
  api_key: string;
  api_version: string;
  deployment: string;
}

/** Gemini Developer API 的 API Key 配置。 */
export interface GeminiConfig extends BaseProviderConfig {
  type: 'gemini';
  api_key: string;
}

/** Ollama 的 base_url 可省略，此时连接本机默认服务地址。 */
export interface OllamaConfig extends BaseProviderConfig {
  type: 'ollama';
  base_url?: string;
}

export type ProviderConfig = OpenAIConfig | OpenAICompatibleConfig | AzureOpenAIConfig | GeminiConfig | OllamaConfig;

type OptionalApiKey<TConfig extends ProviderConfig> = TConfig extends { api_key: string }
  ? Omit<TConfig, 'api_key'> & { api_key?: string }
  : TConfig;

/**
 * 设置中保存的 Provider 条目。
 *
 * 未使用的条目可以省略 api_key 作为配置模板；进入 adapter 前必须收敛为完整 ProviderConfig。
 */
export type ProviderSettingsEntry = OptionalApiKey<ProviderConfig>;

/** Provider adapter 对翻译层暴露的统一客户端边界。 */
export interface LLMClient {
  chat(messages: ChatMessage[], options?: ChatRequestOptions): Promise<string>;
}
