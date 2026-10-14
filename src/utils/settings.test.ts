import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import { DEFAULT_VENDOR_PRESETS } from './vendors';

describe('normalizeSettings', () => {
  it('keeps saved settings unchanged', () => {
    const settings = {
      target_lang: 'en',
      engine: { vendor: 'local', model: 'qwen3' },
      providers: [{ vendor: 'local', type: 'ollama', model: 'qwen3' }],
      vendors: [{ vendor: 'Local', type: 'ollama', base_url: 'http://192.168.1.2:11434' }],
    };
    expect(normalizeSettings(settings)).toEqual(settings);
  });

  it('keeps only vendor and model in the engine reference', () => {
    expect(normalizeSettings({ engine: { vendor: 'DeepSeek', model: 'deepseek-chat', api_key: 'sk' } }).engine).toEqual(
      { vendor: 'DeepSeek', model: 'deepseek-chat' }
    );
  });

  it('falls back to defaults for missing or malformed values', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ target_lang: '', engine: 'deepseek', providers: 'oops' })).toEqual(DEFAULT_SETTINGS);
  });

  it('uses the built-in vendor presets until the user saves their own, and drops bad ones', () => {
    expect(normalizeSettings({}).vendors).toEqual(DEFAULT_VENDOR_PRESETS);
    expect(normalizeSettings({ vendors: [] }).vendors).toEqual([]);
    expect(
      normalizeSettings({
        vendors: [
          { vendor: 'A', type: 'openai-compatible', base_url: 'https://a.example/v1' },
          { vendor: 'a', type: 'ollama' },
          { vendor: 'B', type: 'nope' },
          { vendor: '', type: 'ollama' },
        ],
      }).vendors
    ).toEqual([{ vendor: 'A', type: 'openai-compatible', base_url: 'https://a.example/v1' }]);
  });
});
