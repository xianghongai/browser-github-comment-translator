import { GOOGLE_ENGINE, isSameEngine, toProviderRef } from '../../utils/engine';
import { getProviderOriginPattern, parseProviderConfigs } from '../../utils/providers/config';
import type { Settings } from '../../utils/settings';

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

/** 用导入的 JSON 替换全部 Provider；原默认引擎仍存在则保留，否则回到 Google 翻译。 */
export function replaceProviders(settings: Settings, value: unknown): ProvidersChange {
  const providers = parseProviderConfigs(value);
  const engine =
    settings.engine !== GOOGLE_ENGINE && !providers.some((provider) => isSameEngine(settings.engine, provider))
      ? GOOGLE_ENGINE
      : settings.engine;
  return {
    settings: { ...settings, providers, engine },
    origins: [...new Set(providers.map(getProviderOriginPattern))],
  };
}
