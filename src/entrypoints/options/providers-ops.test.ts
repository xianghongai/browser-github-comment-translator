import { describe, expect, it } from 'vitest';
import type { Settings } from '../../utils/settings';
import { DEFAULT_VENDOR_PRESETS } from '../../utils/vendors';
import { exportConfig, importConfig, removeProvider, upsertProvider } from './providers-ops';

const deepseek = { vendor: 'DeepSeek', type: 'ollama', model: 'deepseek-chat' } as const;
const qwen = { vendor: 'Ollama', type: 'ollama', model: 'qwen3' } as const;

function settingsWith(engine: Settings['engine']): Settings {
  return { target_lang: 'zh-CN', engine, providers: [deepseek, qwen], vendors: [...DEFAULT_VENDOR_PRESETS] };
}

describe('upsertProvider', () => {
  it('appends a new provider and returns its origin', () => {
    const change = upsertProvider(settingsWith('google'), null, {
      vendor: 'SiliconFlow',
      type: 'openai-compatible',
      base_url: 'https://api.siliconflow.cn/v1',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
    });
    expect(change.settings.providers).toHaveLength(3);
    expect(change.origins).toEqual(['https://api.siliconflow.cn/*']);
  });

  it('makes the default engine follow a renamed provider', () => {
    const change = upsertProvider(settingsWith({ vendor: 'DeepSeek', model: 'deepseek-chat' }), 0, {
      ...deepseek,
      model: 'deepseek-reasoner',
    });
    expect(change.settings.engine).toEqual({ vendor: 'DeepSeek', model: 'deepseek-reasoner' });
  });

  it('leaves the default engine alone when another provider is edited', () => {
    const change = upsertProvider(settingsWith({ vendor: 'Ollama', model: 'qwen3' }), 0, { ...deepseek, model: 'x' });
    expect(change.settings.engine).toEqual({ vendor: 'Ollama', model: 'qwen3' });
  });

  it('rejects a duplicate vendor + model', () => {
    expect(() => upsertProvider(settingsWith('google'), null, { ...qwen, vendor: 'ollama' })).toThrow(/duplicated/);
  });
});

describe('removeProvider', () => {
  it('falls back to Google when the default provider is removed', () => {
    const next = removeProvider(settingsWith({ vendor: 'deepseek', model: 'deepseek-chat' }), 0);
    expect(next.providers).toEqual([qwen]);
    expect(next.engine).toBe('google');
  });

  it('keeps the default engine when another provider is removed', () => {
    expect(removeProvider(settingsWith({ vendor: 'Ollama', model: 'qwen3' }), 0).engine).toEqual({
      vendor: 'Ollama',
      model: 'qwen3',
    });
  });
});

describe('importConfig', () => {
  it('moves every setting to another browser', () => {
    const source: Settings = { ...settingsWith({ vendor: 'Ollama', model: 'qwen3' }), target_lang: 'ja' };
    const exported = JSON.parse(JSON.stringify(exportConfig(source)));
    const target: Settings = { target_lang: 'en', engine: 'google', providers: [], vendors: [] };
    expect(importConfig(target, exported)?.settings).toEqual(source);
  });

  it('falls back to Google when the imported default engine is not among the imported providers', () => {
    const exported = { ...exportConfig(settingsWith('google')), engine: { vendor: 'Gone', model: 'x' } };
    expect(importConfig(settingsWith('google'), exported)?.settings.engine).toBe('google');
  });

  it('returns undefined for content it does not recognize', () => {
    expect(importConfig(settingsWith('google'), { foo: 1 })).toBeUndefined();
    expect(importConfig(settingsWith('google'), 'oops')).toBeUndefined();
    expect(importConfig(settingsWith('google'), [deepseek])).toBeUndefined();
    expect(importConfig(settingsWith('google'), { providers: [deepseek] })).toBeUndefined();
  });
});
