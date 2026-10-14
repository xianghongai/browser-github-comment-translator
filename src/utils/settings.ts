import { storage } from 'wxt/utils/storage';
import { GOOGLE_ENGINE, toProviderRef, type Engine } from './engine';
import type { ProviderSettingsEntry } from './providers/types';
import { DEFAULT_VENDOR_PRESETS, normalizeVendorPresets, type VendorPreset } from './vendors';

export interface Settings {
  /** 目标语言，BCP 47 代码，例如 zh-CN。 */
  target_lang: string;
  /** 默认引擎：`google`，或 `{ vendor, model }` 引用的某个 Provider。 */
  engine: Engine;
  providers: ProviderSettingsEntry[];
  /** 添加 AI 服务时可选的厂商预设（厂商、类型、Base URL）。 */
  vendors: VendorPreset[];
}

export const DEFAULT_SETTINGS: Settings = {
  target_lang: 'zh-CN',
  engine: GOOGLE_ENGINE,
  providers: [],
  vendors: [...DEFAULT_VENDOR_PRESETS],
};

// API Key 只存在 local，不随浏览器同步。
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await settingsItem.getValue());
}

/** 读取设置时只补默认值、不做校验，避免一条坏配置让整个设置页打不开；校验在保存时进行。 */
export function normalizeSettings(value: unknown): Settings {
  const record = isRecord(value) ? value : {};
  const engine = record.engine;
  return {
    target_lang:
      typeof record.target_lang === 'string' && record.target_lang ? record.target_lang : DEFAULT_SETTINGS.target_lang,
    engine:
      isRecord(engine) && typeof engine.vendor === 'string' && typeof engine.model === 'string'
        ? toProviderRef({ vendor: engine.vendor, model: engine.model })
        : GOOGLE_ENGINE,
    providers: Array.isArray(record.providers) ? (record.providers as ProviderSettingsEntry[]) : [],
    vendors: normalizeVendorPresets(record.vendors),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
