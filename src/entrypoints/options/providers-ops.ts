import { GOOGLE_ENGINE, isSameEngine, toProviderRef, type Engine } from '../../utils/engine';
import { getProviderOriginPattern, parseProviderConfigs } from '../../utils/providers/config';
import type { ProviderSettingsEntry } from '../../utils/providers/types';
import type { Settings } from '../../utils/settings';
import { parseVendorPresets } from '../../utils/vendors';

/** 一次修改的结果：新的设置，以及需要申请 host 权限的地址。 */
export interface ProvidersChange {
  settings: Settings;
  origins: string[];
}

/**
 * 新增（index 为 null）或替换一个 Provider，并对整个列表重新校验（含 厂商 + 模型 去重）。
 * 被编辑的服务若是默认引擎，默认引擎跟随它改名后的 厂商 + 模型。
 */
export function upsertProvider(settings: Settings, index: number | null, raw: unknown): ProvidersChange {
  const list: unknown[] = [...settings.providers];
  if (index === null) {
    list.push(raw);
  } else {
    list[index] = raw;
  }
  const providers = parseProviderConfigs(list);
  const changed = providers[index ?? providers.length - 1];
  const wasDefault = index !== null && isSameEngine(settings.engine, settings.providers[index]);
  return {
    settings: { ...settings, providers, engine: wasDefault ? toProviderRef(changed) : settings.engine },
    origins: [getProviderOriginPattern(changed)],
  };
}

/** 删除一个 Provider；删掉的是默认引擎时回到 Google 翻译。 */
export function removeProvider(settings: Settings, index: number): Settings {
  const removed = settings.providers[index];
  return {
    ...settings,
    providers: settings.providers.filter((_, position) => position !== index),
    engine: removed && isSameEngine(settings.engine, removed) ? GOOGLE_ENGINE : settings.engine,
  };
}

/** 导出全部设置，用于在另一台电脑上导入。 */
export function exportConfig(settings: Settings): Settings {
  const { target_lang, engine, providers, vendors } = settings;
  return { target_lang, engine, providers, vendors };
}

/**
 * 导入 exportConfig 导出的内容，替换全部设置；内容无法识别时返回 undefined。
 * 默认引擎指向的服务不在导入的列表里时，回到 Google 翻译。
 */
export function importConfig(settings: Settings, value: unknown): ProvidersChange | undefined {
  if (!isRecord(value) || !Array.isArray(value.providers) || !Array.isArray(value.vendors)) {
    return undefined;
  }
  const providers = parseProviderConfigs(value.providers);
  const vendors = parseVendorPresets(value.vendors);
  const target_lang =
    typeof value.target_lang === 'string' && value.target_lang ? value.target_lang : settings.target_lang;
  return {
    settings: { target_lang, engine: toImportedEngine(value.engine, providers), providers, vendors },
    origins: [...new Set(providers.map(getProviderOriginPattern))],
  };
}

function toImportedEngine(value: unknown, providers: ProviderSettingsEntry[]): Engine {
  if (!isRecord(value) || typeof value.vendor !== 'string' || typeof value.model !== 'string') {
    return GOOGLE_ENGINE;
  }
  const ref = toProviderRef({ vendor: value.vendor, model: value.model });
  return providers.some((provider) => isSameEngine(ref, provider)) ? ref : GOOGLE_ENGINE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
