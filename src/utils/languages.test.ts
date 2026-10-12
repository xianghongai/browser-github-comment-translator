import { describe, expect, it } from 'vitest';
import { TARGET_LANGUAGES, formatLanguageOption } from './languages';

describe('target languages', () => {
  it('lists unique language codes', () => {
    expect(new Set(TARGET_LANGUAGES).size).toBe(TARGET_LANGUAGES.length);
  });

  it('shows the localized and native names with the code', () => {
    expect(formatLanguageOption('ja', 'zh-CN')).toBe('日语 · 日本語 (ja)');
    expect(formatLanguageOption('zh-CN', 'en')).toBe('Simplified Chinese · 简体中文 (zh-CN)');
    expect(formatLanguageOption('zh-CN', 'zh-CN')).toBe('简体中文 (zh-CN)');
  });

  it('falls back to the code for unknown languages', () => {
    expect(formatLanguageOption('not a code', 'en')).toBe('not a code');
  });
});
