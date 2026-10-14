import { ConfigError, isHttpUrl, type ConfigIssue } from './config-error';
import { PROVIDER_TYPES, type ProviderType } from './providers/types';

/**
 * 厂商预设：添加 AI 服务时选中即填入类型和 Base URL。
 * 模型更新太频繁，不做预设；base_url 省略时使用该类型的默认地址（openai、ollama），或该类型不需要（gemini、azure-openai）。
 */
export interface VendorPreset {
  vendor: string;
  type: ProviderType;
  base_url?: string;
}

/** Gemini 与 Azure OpenAI 不使用 base_url（Azure 的 endpoint 因资源而异，无法预设）。 */
export const TYPES_WITH_BASE_URL: readonly ProviderType[] = ['openai', 'openai-compatible', 'openrouter', 'ollama'];

/** 内置的社区主流厂商；用户可以编辑、删除，也可以恢复。 */
export const DEFAULT_VENDOR_PRESETS: readonly VendorPreset[] = [
  { vendor: 'OpenAI', type: 'openai' },
  { vendor: 'Anthropic', type: 'openai-compatible', base_url: 'https://api.anthropic.com/v1' },
  { vendor: 'Gemini', type: 'gemini' },
  { vendor: 'DeepSeek', type: 'openai-compatible', base_url: 'https://api.deepseek.com' },
  { vendor: 'OpenRouter', type: 'openrouter', base_url: 'https://openrouter.ai/api/v1' },
  { vendor: 'xAI', type: 'openai-compatible', base_url: 'https://api.x.ai/v1' },
  { vendor: 'Mistral', type: 'openai-compatible', base_url: 'https://api.mistral.ai/v1' },
  { vendor: 'Groq', type: 'openai-compatible', base_url: 'https://api.groq.com/openai/v1' },
  { vendor: 'Azure', type: 'azure-openai' },
  { vendor: 'Ollama', type: 'ollama' },
  { vendor: '阿里云百炼', type: 'openai-compatible', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  {
    vendor: '阿里云百炼（国际版）',
    type: 'openai-compatible',
    base_url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
  { vendor: '火山方舟', type: 'openai-compatible', base_url: 'https://ark.cn-beijing.volces.com/api/v3' },
  {
    vendor: '火山方舟（国际版）',
    type: 'openai-compatible',
    base_url: 'https://ark.ap-southeast.bytepluses.com/api/v3',
  },
  { vendor: '月之暗面', type: 'openai-compatible', base_url: 'https://api.moonshot.cn/v1' },
  { vendor: '月之暗面（国际版）', type: 'openai-compatible', base_url: 'https://api.moonshot.ai/v1' },
  { vendor: '智谱', type: 'openai-compatible', base_url: 'https://open.bigmodel.cn/api/paas/v4' },
  { vendor: '智谱（国际版）', type: 'openai-compatible', base_url: 'https://api.z.ai/api/paas/v4' },
  { vendor: 'MiniMax', type: 'openai-compatible', base_url: 'https://api.minimaxi.com/v1' },
  { vendor: 'MiniMax（国际版）', type: 'openai-compatible', base_url: 'https://api.minimax.io/v1' },
  { vendor: '硅基流动', type: 'openai-compatible', base_url: 'https://api.siliconflow.cn/v1' },
  { vendor: '硅基流动（国际版）', type: 'openai-compatible', base_url: 'https://api.siliconflow.com/v1' },
];

/** 厂商名忽略大小写比较，与 Provider 的 厂商 + 模型 标识一致。 */
export function isSameVendor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function findVendorPreset(presets: readonly VendorPreset[], vendor: string): VendorPreset | undefined {
  return vendor.trim() ? presets.find((preset) => isSameVendor(preset.vendor, vendor)) : undefined;
}

/** 校验导入或表单提交的预设列表；厂商名不能重复。 */
export function parseVendorPresets(value: unknown): VendorPreset[] {
  if (!Array.isArray(value)) {
    throw vendorError('[gct] vendors must be an array', 'invalid');
  }
  const presets = value.map(parseVendorPreset);
  presets.forEach((preset, index) => {
    if (presets.slice(0, index).some((other) => isSameVendor(other.vendor, preset.vendor))) {
      throw vendorError(`[gct] vendor '${preset.vendor}' is duplicated`, 'duplicate', index);
    }
  });
  return presets;
}

/** 读取设置时只丢掉坏条目，不抛错，避免一条坏预设让设置页打不开；还没有保存过预设时用内置预设。 */
export function normalizeVendorPresets(value: unknown): VendorPreset[] {
  if (!Array.isArray(value)) {
    return DEFAULT_VENDOR_PRESETS.map((preset) => ({ ...preset }));
  }
  const presets: VendorPreset[] = [];
  value.forEach((item, index) => {
    try {
      const preset = parseVendorPreset(item, index);
      if (!findVendorPreset(presets, preset.vendor)) {
        presets.push(preset);
      }
    } catch {
      // 跳过坏条目。
    }
  });
  return presets;
}

/** 新增（index 为 null）或替换一个预设，并对整个列表重新校验。 */
export function upsertVendorPreset(
  presets: readonly VendorPreset[],
  index: number | null,
  raw: unknown
): VendorPreset[] {
  const list: unknown[] = [...presets];
  if (index === null) {
    list.push(raw);
  } else {
    list[index] = raw;
  }
  return parseVendorPresets(list);
}

/** 预设的来源：未改动的内置预设、改过类型或 Base URL 的内置预设、用户自己添加的预设。按厂商名与内置列表比对。 */
export type VendorPresetOrigin = 'built-in' | 'edited' | 'custom';

export function getVendorPresetOrigin(preset: VendorPreset): VendorPresetOrigin {
  const builtIn = findVendorPreset(DEFAULT_VENDOR_PRESETS, preset.vendor);
  if (!builtIn) {
    return 'custom';
  }
  return builtIn.type === preset.type && builtIn.base_url === preset.base_url ? 'built-in' : 'edited';
}

/** 恢复内置预设的结果：恢复后的列表、补回的预设，以及被改回默认值的预设（修改前 → 默认值）。 */
export interface VendorPresetsRestore {
  presets: VendorPreset[];
  added: VendorPreset[];
  reset: { from: VendorPreset; to: VendorPreset }[];
}

/**
 * 恢复内置预设：补回被删掉的，把类型或 Base URL 改过的改回默认值（保留原位置和厂商名写法）。
 * 用户自己添加的预设不受影响。
 */
export function restoreDefaultVendorPresets(presets: readonly VendorPreset[]): VendorPresetsRestore {
  const reset: VendorPresetsRestore['reset'] = [];
  const restored = presets.map((preset) => {
    if (getVendorPresetOrigin(preset) !== 'edited') {
      return preset;
    }
    const to = { ...findVendorPreset(DEFAULT_VENDOR_PRESETS, preset.vendor)!, vendor: preset.vendor };
    reset.push({ from: preset, to });
    return to;
  });
  const added = DEFAULT_VENDOR_PRESETS.filter((preset) => !findVendorPreset(presets, preset.vendor)).map((preset) => ({
    ...preset,
  }));
  return { presets: [...restored, ...added], added, reset };
}

/** 预设的类型和 Base URL，用于确认提示。 */
export function describeVendorPreset(preset: VendorPreset): string {
  return preset.base_url ? `${preset.type} · ${preset.base_url}` : preset.type;
}

function parseVendorPreset(value: unknown, index: number): VendorPreset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw vendorError(`[gct] vendors[${index}] must be an object`, 'invalid', index);
  }
  const record = value as Record<string, unknown>;
  const vendor = typeof record.vendor === 'string' ? record.vendor.trim() : '';
  if (!vendor) {
    throw vendorError(`[gct] vendors[${index}].vendor is required`, 'required', index, 'vendor');
  }
  const type = record.type;
  if (!PROVIDER_TYPES.includes(type as ProviderType)) {
    throw vendorError(`[gct] vendors[${index}]: unknown type '${String(type)}'`, 'invalid', index, 'type');
  }
  const rawBaseUrl = record.base_url;
  if (rawBaseUrl !== undefined && typeof rawBaseUrl !== 'string') {
    throw vendorError(`[gct] vendors[${index}].base_url must be a string`, 'invalid', index, 'base_url');
  }
  const baseUrl = rawBaseUrl?.trim();
  if (baseUrl && !isHttpUrl(baseUrl)) {
    throw vendorError(`[gct] vendors[${index}].base_url must be an http(s) URL`, 'url', index, 'base_url');
  }
  const usesBaseUrl = TYPES_WITH_BASE_URL.includes(type as ProviderType);
  return { vendor, type: type as ProviderType, ...(baseUrl && usesBaseUrl ? { base_url: baseUrl } : {}) };
}

function vendorError(message: string, code: ConfigIssue['code'], index?: number, field?: string): ConfigError {
  return new ConfigError(message, { code, scope: 'vendor', index, field });
}
