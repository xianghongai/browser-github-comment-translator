import { ConfigError } from '../../utils/config-error';
import type { ProviderSettingsEntry, ProviderType } from '../../utils/providers/types';

/** 表单里一个 Provider 的原始输入；全部是字符串，保存时再统一交给 parseProviderConfigs 校验。 */
export type ProviderFields = Record<FieldName, string> & { type: ProviderType };

export type FieldName =
  | 'vendor'
  | 'type'
  | 'model'
  | 'api_key'
  | 'base_url'
  | 'organization'
  | 'endpoint'
  | 'api_version'
  | 'deployment'
  | 'timeout_ms'
  | 'temperature'
  | 'top_p'
  | 'max_tokens'
  | 'headers';

const TYPE_FIELDS: Record<ProviderType, FieldName[]> = {
  openai: ['api_key', 'base_url', 'organization'],
  'openai-compatible': ['api_key', 'base_url', 'organization'],
  openrouter: ['api_key', 'base_url', 'organization'],
  'azure-openai': ['api_key', 'endpoint', 'api_version', 'deployment'],
  gemini: ['api_key'],
  ollama: ['base_url'],
};

export const COMMON_FIELDS: FieldName[] = ['vendor', 'type', 'model'];
export const ADVANCED_FIELDS: FieldName[] = ['timeout_ms', 'temperature', 'top_p', 'max_tokens', 'headers'];

export function fieldsForType(type: ProviderType): FieldName[] {
  return TYPE_FIELDS[type];
}

const NUMBER_FIELDS = ['timeout_ms'] as const;
const PARAM_FIELDS = ['temperature', 'top_p', 'max_tokens'] as const;

export function emptyFields(type: ProviderType = 'openai-compatible'): ProviderFields {
  return {
    vendor: '',
    type,
    model: '',
    api_key: '',
    organization: '',
    base_url: type === 'openrouter' ? 'https://openrouter.ai/api/v1' : '',
    endpoint: '',
    api_version: '',
    deployment: '',
    timeout_ms: '',
    temperature: '',
    top_p: '',
    max_tokens: '',
    headers: '',
  };
}

export function entryToFields(entry: ProviderSettingsEntry): ProviderFields {
  const fields = emptyFields(entry.type);
  const record = entry as unknown as Record<string, unknown>;
  for (const name of [...COMMON_FIELDS, ...TYPE_FIELDS[entry.type], ...NUMBER_FIELDS] as FieldName[]) {
    if (name === 'type') {
      continue;
    }
    const value = record[name];
    if (typeof value === 'string' || typeof value === 'number') {
      fields[name] = String(value);
    }
  }
  for (const name of PARAM_FIELDS) {
    const value = entry.params?.[name];
    if (typeof value === 'number') {
      fields[name] = String(value);
    }
  }
  if (entry.headers && Object.keys(entry.headers).length) {
    fields.headers = JSON.stringify(entry.headers, null, 2);
  }
  return fields;
}

/** 只输出当前类型用得到的字段，交给 parseProviderConfigs 校验。 */
export function fieldsToRaw(fields: ProviderFields, index: number): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const name of [...COMMON_FIELDS, ...TYPE_FIELDS[fields.type]]) {
    const value = fields[name].trim();
    if (value) {
      raw[name] = value;
    }
  }
  for (const name of NUMBER_FIELDS) {
    if (fields[name].trim()) {
      raw[name] = Number(fields[name]);
    }
  }
  const params: Record<string, number> = {};
  for (const name of PARAM_FIELDS) {
    if (fields[name].trim()) {
      params[name] = Number(fields[name]);
    }
  }
  if (Object.keys(params).length) {
    raw.params = params;
  }
  if (fields.headers.trim()) {
    try {
      raw.headers = JSON.parse(fields.headers);
    } catch {
      throw new ConfigError(`[gct] providers[${index}].headers must be a JSON object`, {
        code: 'invalid',
        scope: 'provider',
        index,
        field: 'headers',
      });
    }
  }
  return raw;
}
