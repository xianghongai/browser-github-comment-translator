import type { Engine } from './engine';

/** content script / options 页与 background 之间的消息契约。 */

export interface TranslateRequest {
  type: 'gct:translate';
  /** 省略时使用设置里的默认引擎。 */
  engine?: Engine;
  texts: string[];
}

/** options 页用未保存的表单内容测试 Provider。 */
export interface TestProviderRequest {
  type: 'gct:test-provider';
  provider: unknown;
  target_lang: string;
}

export type Request = TranslateRequest | TestProviderRequest;

export type TranslateResponse =
  | { ok: true; translations: string[]; engineLabel: string }
  | { ok: false; error: string };
