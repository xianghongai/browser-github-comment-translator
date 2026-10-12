import { isSameProvider } from './providers/shared';
import type { ProviderRef } from './providers/types';

export const GOOGLE_ENGINE = 'google';

/**
 * 翻译引擎：内置的 Google 翻译，或以 厂商 + 模型 引用的某个 AI Provider。
 * 保存为 `"google"` 或 `{ "vendor": "…", "model": "…" }`，不拼接成字符串标识。
 */
export type Engine = typeof GOOGLE_ENGINE | ProviderRef;

export function isSameEngine(a: Engine, b: Engine): boolean {
  if (a === GOOGLE_ENGINE || b === GOOGLE_ENGINE) {
    return a === b;
  }
  return isSameProvider(a, b);
}

/** 只取引用所需的两个字段，避免把 api_key 等配置带进设置里的 engine 或消息中。 */
export function toProviderRef({ vendor, model }: ProviderRef): ProviderRef {
  return { vendor, model };
}
