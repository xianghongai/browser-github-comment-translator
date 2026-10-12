import { DEFAULT_OLLAMA_BASE_URL } from './ollama';
import { DEFAULT_OPENAI_BASE_URL } from './openaiCompatible';
import { getProviderLabel, isSameProvider } from './shared';
import type {
  BaseProviderConfig,
  ChatGenerationParams,
  OllamaConfig,
  OpenAIChatConfig,
  ProviderConfig,
  ProviderRef,
  ProviderSettingsEntry,
} from './types';

type ConfigRecord = Record<string, unknown>;
type OpenAIChatSettingsEntry = Extract<ProviderSettingsEntry, { type: 'openai' | 'openai-compatible' | 'openrouter' }>;
type AzureOpenAISettingsEntry = Extract<ProviderSettingsEntry, { type: 'azure-openai' }>;
type GeminiSettingsEntry = Extract<ProviderSettingsEntry, { type: 'gemini' }>;

const ENVIRONMENT_API_KEY_PATTERN = /^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * 将设置（或从 VS Code 粘贴）的未知输入收敛为可展示、可切换的 Provider 条目。
 *
 * api_key 在列表阶段允许缺省；协议地址、模型和其它结构字段仍按类型契约校验。
 */
export function parseProviderConfigs(value: unknown): ProviderSettingsEntry[] {
  if (!Array.isArray(value)) {
    throw new Error('[gct] providers must be an array');
  }

  const providers = value.map((item, index) => parseProviderConfig(item, index));
  // 厂商 + 模型 是唯一标识。
  providers.forEach((provider, index) => {
    if (providers.slice(0, index).some((other) => isSameProvider(other, provider))) {
      throw new Error(`[gct] provider '${getProviderLabel(provider)}' is duplicated: vendor + model must be unique`);
    }
  });
  return providers;
}

/** 精确选择活动 Provider，并在评论内容进入 adapter 前强制校验其凭据。 */
export function selectActiveProvider(providers: ProviderSettingsEntry[], active?: ProviderRef): ProviderConfig {
  if (!providers.length) {
    throw new Error('[gct] no providers configured');
  }

  const providerIndex = active ? providers.findIndex((provider) => isSameProvider(provider, active)) : 0;
  const provider = providers[providerIndex];
  if (!provider) {
    throw new Error(`[gct] active provider '${active && getProviderLabel(active)}' was not found`);
  }
  return validateProviderConfig(provider, providerIndex);
}

/** 将选中的 settings 条目收敛为 adapter 可消费的完整 ProviderConfig。 */
export function validateProviderConfig(conf: ProviderSettingsEntry, index = 0): ProviderConfig {
  switch (conf.type) {
    case 'openai':
    case 'openai-compatible':
    case 'openrouter':
    case 'azure-openai':
    case 'gemini':
      return {
        ...conf,
        api_key: requireActiveApiKey(conf.api_key, getProviderLabel(conf), index),
      };
    case 'ollama':
      return conf;
    default:
      return assertNever(conf);
  }
}

function parseProviderConfig(value: unknown, index: number): ProviderSettingsEntry {
  const record = requireRecord(normalizeProviderKeys(value), `providers[${index}]`);
  const type = requireString(record, 'type', index);
  const base = parseBaseProviderConfig(record, index);

  switch (type) {
    case 'openai':
      return parseOpenAIConfig(record, base, type, false, index);
    case 'openai-compatible':
    case 'openrouter':
      return parseOpenAIConfig(record, base, type, true, index);
    case 'azure-openai':
      return parseAzureOpenAIConfig(record, base, index);
    case 'gemini':
      return parseGeminiConfig(record, base, index);
    case 'ollama':
      return parseOllamaConfig(record, base, index);
    default:
      throw new Error(`[gct] providers[${index}]: unknown type '${type}'`);
  }
}

function parseBaseProviderConfig(record: ConfigRecord, index: number): Omit<BaseProviderConfig, 'type'> {
  const modelKind = optionalString(record, 'model_kind', index);
  if (modelKind !== undefined && modelKind !== 'chat') {
    throw new Error(`[gct] providers[${index}].model_kind must be 'chat'`);
  }

  return {
    vendor: requireString(record, 'vendor', index),
    model: requireString(record, 'model', index),
    ...(modelKind ? { model_kind: 'chat' as const } : {}),
    ...optionalPositiveNumberProperty(record, 'timeout_ms', index),
    ...parseHeadersProperty(record, index),
    ...parseParamsProperty(record, index),
  };
}

function parseOpenAIConfig(
  record: ConfigRecord,
  base: Omit<BaseProviderConfig, 'type'>,
  type: OpenAIChatConfig['type'],
  requireBaseUrl: boolean,
  index: number
): OpenAIChatSettingsEntry {
  const baseUrl = requireBaseUrl ? requireString(record, 'base_url', index) : optionalString(record, 'base_url', index);
  const apiKey = optionalString(record, 'api_key', index);
  const organization = optionalString(record, 'organization', index);
  if (type === 'openai') {
    return {
      ...base,
      type,
      ...(apiKey ? { api_key: apiKey } : {}),
      ...(baseUrl ? { base_url: baseUrl } : {}),
      ...(organization ? { organization } : {}),
    };
  }
  return {
    ...base,
    type,
    ...(apiKey ? { api_key: apiKey } : {}),
    base_url: requireString(record, 'base_url', index),
    ...(organization ? { organization } : {}),
  };
}

function parseAzureOpenAIConfig(
  record: ConfigRecord,
  base: Omit<BaseProviderConfig, 'type'>,
  index: number
): AzureOpenAISettingsEntry {
  return {
    ...base,
    type: 'azure-openai',
    endpoint: requireString(record, 'endpoint', index),
    ...optionalStringProperty(record, 'api_key', index),
    api_version: requireString(record, 'api_version', index),
    deployment: requireString(record, 'deployment', index),
  };
}

function parseGeminiConfig(
  record: ConfigRecord,
  base: Omit<BaseProviderConfig, 'type'>,
  index: number
): GeminiSettingsEntry {
  return {
    ...base,
    type: 'gemini',
    ...optionalStringProperty(record, 'api_key', index),
  };
}

function parseOllamaConfig(record: ConfigRecord, base: Omit<BaseProviderConfig, 'type'>, index: number): OllamaConfig {
  return {
    ...base,
    type: 'ollama',
    ...optionalStringProperty(record, 'base_url', index),
  };
}

/**
 * 配置统一使用 snake_case；从 VS Code 粘贴的 ai-commit.providers 是驼峰（apiKey、baseUrl…），
 * 解析前转换键名。headers 的值是 HTTP 头名，不做转换。
 */
export function normalizeProviderKeys(value: unknown): unknown {
  if (!isConfigRecord(value)) {
    return value;
  }
  const record = toSnakeCaseKeys(value);
  if (isConfigRecord(record.params)) {
    record.params = toSnakeCaseKeys(record.params);
  }
  // VS Code 的条目以 id 区分、没有 vendor；这里改用 厂商 + 模型 作为标识，id 不再使用。
  if (record.vendor === undefined) {
    const vendor = inferVendor(record);
    if (vendor) {
      record.vendor = vendor;
    }
  }
  delete record.id;
  return record;
}

const VENDOR_BY_TYPE: Record<string, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  'azure-openai': 'Azure',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

/** 按类型推断厂商；OpenAI-compatible 取 base_url 的主域名，例如 api.deepseek.com → deepseek。 */
export function inferVendor(record: ConfigRecord): string | undefined {
  if (typeof record.type === 'string' && VENDOR_BY_TYPE[record.type]) {
    return VENDOR_BY_TYPE[record.type];
  }
  if (typeof record.base_url !== 'string') {
    return undefined;
  }
  try {
    const { hostname } = new URL(record.base_url);
    const labels = hostname.split('.');
    // IP 地址与 localhost 原样使用；域名取倒数第二段（去掉 api. / www. 等子域与顶级域）。
    return /^[\d.]+$/.test(hostname) || labels.length < 2 ? hostname : labels[labels.length - 2];
  } catch {
    return undefined;
  }
}

export function toSnakeCaseKeys(record: ConfigRecord): ConfigRecord {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`), value])
  );
}

function parseHeadersProperty(record: ConfigRecord, index: number): Pick<BaseProviderConfig, 'headers'> {
  const value = record.headers;
  if (value === undefined) {
    return {};
  }
  const headers = requireRecord(value, `providers[${index}].headers`);
  const parsedHeaders: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(headers)) {
    if (typeof headerValue !== 'string') {
      throw new Error(`[gct] providers[${index}].headers.${name} must be a string`);
    }
    parsedHeaders[name] = headerValue;
  }
  return { headers: parsedHeaders };
}

function parseParamsProperty(record: ConfigRecord, index: number): Pick<BaseProviderConfig, 'params'> {
  if (record.params === undefined) {
    return {};
  }
  const paramsRecord = requireRecord(record.params, `providers[${index}].params`);
  const params: ChatGenerationParams = {
    ...optionalNumberProperty(paramsRecord, 'temperature', `providers[${index}].params`),
    ...optionalNumberProperty(paramsRecord, 'top_p', `providers[${index}].params`),
    ...optionalNumberProperty(paramsRecord, 'max_tokens', `providers[${index}].params`),
  };

  if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2)) {
    throw new Error(`[gct] providers[${index}].params.temperature must be between 0 and 2`);
  }
  if (params.top_p !== undefined && (params.top_p < 0 || params.top_p > 1)) {
    throw new Error(`[gct] providers[${index}].params.top_p must be between 0 and 1`);
  }
  if (params.max_tokens !== undefined && params.max_tokens < 1) {
    throw new Error(`[gct] providers[${index}].params.max_tokens must be at least 1`);
  }
  return { params };
}

function optionalStringProperty(record: ConfigRecord, key: string, index: number): Record<string, string> {
  const value = optionalString(record, key, index);
  return value === undefined ? {} : { [key]: value };
}

function optionalPositiveNumberProperty(record: ConfigRecord, key: string, index: number): Record<string, number> {
  const property = optionalNumberProperty(record, key, `providers[${index}]`);
  const value = property[key];
  if (value !== undefined && value <= 0) {
    throw new Error(`[gct] providers[${index}].${key} must be greater than 0`);
  }
  return property;
}

function optionalNumberProperty(record: ConfigRecord, key: string, path: string): Record<string, number> {
  const value = record[key];
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[gct] ${path}.${key} must be a finite number`);
  }
  return { [key]: value };
}

function requireString(record: ConfigRecord, key: string, index: number): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`[gct] providers[${index}].${key} is required`);
  }
  return value.trim();
}

function requireActiveApiKey(value: string | undefined, label: string, index: number): string {
  if (!value) {
    throw new Error(`[gct] provider '${label}' (providers[${index}]).api_key is required for the active provider`);
  }
  // 从 VS Code 粘贴过来的 `${env:NAME}` 在浏览器里无法解析，必须换成真实的 Key。
  const environmentReference = ENVIRONMENT_API_KEY_PATTERN.exec(value);
  if (environmentReference) {
    throw new Error(
      `[gct] provider '${label}' references environment variable '${environmentReference[1]}' for api_key, which browsers cannot read; paste the key itself`
    );
  }
  return value;
}

function optionalString(record: ConfigRecord, key: string, index: number): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`[gct] providers[${index}].${key} must be a string`);
  }
  return value.trim() || undefined;
}

function requireRecord(value: unknown, path: string): ConfigRecord {
  if (!isConfigRecord(value)) {
    throw new Error(`[gct] ${path} must be an object`);
  }
  return value;
}

function isConfigRecord(value: unknown): value is ConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  void value;
  throw new Error('[gct] unsupported provider configuration');
}

/** 返回 Provider 请求会访问的 host 权限匹配模式；match pattern 不含端口，因此覆盖该主机的所有端口。 */
export function getProviderOriginPattern(conf: ProviderSettingsEntry): string {
  const url = new URL(getProviderBaseUrl(conf));
  return `${url.protocol}//${url.hostname}/*`;
}

function getProviderBaseUrl(conf: ProviderSettingsEntry): string {
  switch (conf.type) {
    case 'openai':
      return conf.base_url ?? DEFAULT_OPENAI_BASE_URL;
    case 'openai-compatible':
    case 'openrouter':
      return conf.base_url;
    case 'azure-openai':
      return conf.endpoint;
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/';
    case 'ollama':
      return conf.base_url ?? DEFAULT_OLLAMA_BASE_URL;
    default:
      return assertNever(conf);
  }
}
