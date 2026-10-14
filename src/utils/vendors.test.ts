import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VENDOR_PRESETS,
  findVendorPreset,
  getVendorPresetOrigin,
  parseVendorPresets,
  restoreDefaultVendorPresets,
  upsertVendorPreset,
} from './vendors';

describe('vendor presets', () => {
  it('ships valid, unique built-in presets', () => {
    expect(parseVendorPresets(DEFAULT_VENDOR_PRESETS)).toEqual(DEFAULT_VENDOR_PRESETS);
  });

  it('finds a preset by vendor name ignoring case and spaces', () => {
    expect(findVendorPreset(DEFAULT_VENDOR_PRESETS, ' deepseek ')?.base_url).toBe('https://api.deepseek.com');
    expect(findVendorPreset(DEFAULT_VENDOR_PRESETS, '')).toBeUndefined();
  });

  it('validates added and edited presets', () => {
    const presets = [
      { vendor: 'DeepSeek', type: 'openai-compatible' as const, base_url: 'https://api.deepseek.com/v1' },
    ];
    expect(upsertVendorPreset(presets, null, { vendor: ' Local ', type: 'ollama', base_url: '' })).toEqual([
      ...presets,
      { vendor: 'Local', type: 'ollama' },
    ]);
    expect(
      upsertVendorPreset(presets, 0, {
        vendor: 'DeepSeek',
        type: 'openai-compatible',
        base_url: 'https://proxy.example/v1',
      })
    ).toEqual([{ vendor: 'DeepSeek', type: 'openai-compatible', base_url: 'https://proxy.example/v1' }]);
    expect(() => upsertVendorPreset(presets, null, { vendor: 'deepseek', type: 'ollama' })).toThrow(/duplicated/);
    expect(() =>
      upsertVendorPreset(presets, null, { vendor: 'X', type: 'openai-compatible', base_url: 'ftp://x' })
    ).toThrow(/http/);
    expect(() => upsertVendorPreset(presets, null, { vendor: 'X', type: 'claude' })).toThrow(/type/);
  });

  it('drops base_url for types that do not use it', () => {
    expect(parseVendorPresets([{ vendor: 'G', type: 'gemini', base_url: 'https://g.example' }])).toEqual([
      { vendor: 'G', type: 'gemini' },
    ]);
  });

  it('restores missing and edited built-in presets, leaving custom ones alone', () => {
    const edited = { vendor: 'deepseek', type: 'openai-compatible' as const, base_url: 'https://proxy.example/v1' };
    const custom = { vendor: 'My Proxy', type: 'openai-compatible' as const, base_url: 'https://my.example/v1' };
    const untouched = {
      vendor: 'Groq',
      type: 'openai-compatible' as const,
      base_url: 'https://api.groq.com/openai/v1',
    };
    const { presets, added, reset } = restoreDefaultVendorPresets([edited, custom, untouched]);
    expect(presets.slice(0, 3)).toEqual([
      { vendor: 'deepseek', type: 'openai-compatible', base_url: 'https://api.deepseek.com' },
      custom,
      untouched,
    ]);
    expect(presets[1]).toBe(custom);
    expect(reset).toEqual([{ from: edited, to: presets[0] }]);
    expect(added).toHaveLength(DEFAULT_VENDOR_PRESETS.length - 2);
    expect(presets).toHaveLength(DEFAULT_VENDOR_PRESETS.length + 1);
  });

  it('tells built-in, edited and custom presets apart by vendor name', () => {
    expect(
      getVendorPresetOrigin({ vendor: 'deepseek', type: 'openai-compatible', base_url: 'https://api.deepseek.com' })
    ).toBe('built-in');
    expect(
      getVendorPresetOrigin({ vendor: 'DeepSeek', type: 'openai-compatible', base_url: 'https://x.example' })
    ).toBe('edited');
    expect(getVendorPresetOrigin({ vendor: 'Gemini', type: 'openai-compatible' })).toBe('edited');
    expect(getVendorPresetOrigin({ vendor: 'DeepSeek-Proxy', type: 'openai-compatible' })).toBe('custom');
  });

  it('reports nothing to do when all built-ins are intact', () => {
    const { added, reset } = restoreDefaultVendorPresets(DEFAULT_VENDOR_PRESETS);
    expect(added).toEqual([]);
    expect(reset).toEqual([]);
  });
});
