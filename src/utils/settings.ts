import { storage } from 'wxt/utils/storage';
import { GOOGLE_ENGINE, toProviderRef, type Engine } from './engine';
import { normalizeProviderKeys, toSnakeCaseKeys } from './providers/config';
import type { ProviderSettingsEntry } from './providers/types';

export interface Settings {
  /** 目标语言，BCP 47 代码，例如 zh-CN。 */
  target_lang: string;
  /** 默认引擎：`google`，或 `{ vendor, model }` 引用的某个 Provider。 */
  engine: Engine;
  providers: ProviderSettingsEntry[];
}

export const DEFAULT_SETTINGS: Settings = {
  target_lang: 'zh-CN',
  engine: GOOGLE_ENGINE,
  providers: [],
};

// API Key 只存在 local，不随浏览器同步。
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await settingsItem.getValue());
}

/**
 * 读取时兼容早期保存格式，下次保存即写回新格式：
 * - 驼峰键名（targetLang、apiKey、baseUrl…）转成 snake_case；
 * - Provider 以 id 区分的旧条目补上 vendor；
 * - 以字符串引用 Provider 的默认引擎换成 { vendor, model }。
 * 这里只改键名，不做校验，避免一条坏配置让整个设置页打不开。
 */
export function normalizeSettings(value: unknown): Settings {
  const record = isRecord(value) ? toSnakeCaseKeys(value) : {};
  const rawProviders: unknown[] = Array.isArray(record.providers) ? record.providers : [];
  const providers = rawProviders.map(normalizeProviderKeys) as ProviderSettingsEntry[];
  return {
    target_lang:
      typeof record.target_lang === 'string' && record.target_lang ? record.target_lang : DEFAULT_SETTINGS.target_lang,
    engine: normalizeEngine(record.engine, rawProviders, providers),
    providers,
  };
}

function normalizeEngine(value: unknown, rawProviders: unknown[], providers: ProviderSettingsEntry[]): Engine {
  if (isRecord(value) && typeof value.vendor === 'string' && typeof value.model === 'string') {
    return toProviderRef({ vendor: value.vendor, model: value.model });
  }
  if (typeof value !== 'string' || value === GOOGLE_ENGINE) {
    return GOOGLE_ENGINE;
  }
  // 早期版本用字符串引用 Provider：第一版是 id，之后一版是「厂商/模型」。逐个条目比对，不做切分。
  const provider = providers.find((entry, index) => {
    const raw = rawProviders[index];
    return (isRecord(raw) && raw.id === value) || `${entry.vendor}/${entry.model}` === value;
  });
  return provider && typeof provider.vendor === 'string' && typeof provider.model === 'string'
    ? toProviderRef(provider)
    : GOOGLE_ENGINE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
