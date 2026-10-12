import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';

describe('normalizeSettings', () => {
  it('migrates camelCase settings saved by the first build', () => {
    expect(
      normalizeSettings({
        targetLang: 'ja',
        engine: 'deepseek',
        providers: [
          {
            id: 'deepseek',
            type: 'openai-compatible',
            baseUrl: 'https://api.deepseek.com/v1',
            apiKey: 'sk',
            model: 'deepseek-chat',
            params: { maxTokens: 512 },
            headers: { 'X-Title': 'gct' },
          },
        ],
      })
    ).toEqual({
      target_lang: 'ja',
      engine: { vendor: 'deepseek', model: 'deepseek-chat' },
      providers: [
        {
          vendor: 'deepseek',
          type: 'openai-compatible',
          base_url: 'https://api.deepseek.com/v1',
          api_key: 'sk',
          model: 'deepseek-chat',
          params: { max_tokens: 512 },
          headers: { 'X-Title': 'gct' },
        },
      ],
    });
  });

  it('moves the default engine from a legacy provider id to { vendor, model }', () => {
    const settings = normalizeSettings({
      target_lang: 'zh-CN',
      engine: 'my-deepseek',
      providers: [
        {
          id: 'my-deepseek',
          type: 'openai-compatible',
          base_url: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
      ],
    });
    expect(settings.engine).toEqual({ vendor: 'deepseek', model: 'deepseek-chat' });
    expect(settings.providers[0]).toEqual({
      vendor: 'deepseek',
      type: 'openai-compatible',
      base_url: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    });
  });

  it('converts a "vendor/model" engine string even when the model contains slashes', () => {
    const settings = normalizeSettings({
      engine: 'siliconflow/deepseek-ai/DeepSeek-V4-Flash',
      providers: [
        {
          vendor: 'siliconflow',
          type: 'openai-compatible',
          base_url: 'https://x.invalid',
          model: 'deepseek-ai/DeepSeek-V4-Flash',
        },
      ],
    });
    expect(settings.engine).toEqual({ vendor: 'siliconflow', model: 'deepseek-ai/DeepSeek-V4-Flash' });
  });

  it('keeps only vendor and model in the engine reference', () => {
    expect(normalizeSettings({ engine: { vendor: 'DeepSeek', model: 'deepseek-chat', api_key: 'sk' } }).engine).toEqual(
      {
        vendor: 'DeepSeek',
        model: 'deepseek-chat',
      }
    );
  });

  it('falls back to Google for an engine string that matches no provider', () => {
    expect(normalizeSettings({ engine: 'removed', providers: [] }).engine).toBe('google');
  });

  it('keeps snake_case settings unchanged', () => {
    const settings = {
      target_lang: 'en',
      engine: 'google',
      providers: [{ vendor: 'local', type: 'ollama', model: 'qwen3' }],
    };
    expect(normalizeSettings(settings)).toEqual(settings);
  });

  it('falls back to defaults for missing or malformed values', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ target_lang: '', providers: 'oops' })).toEqual(DEFAULT_SETTINGS);
  });
});
