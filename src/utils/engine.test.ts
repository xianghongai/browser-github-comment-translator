import { describe, expect, it } from 'vitest';
import { GOOGLE_ENGINE, isSameEngine, toProviderRef } from './engine';

describe('engine references', () => {
  it('compares vendor case-insensitively and model exactly', () => {
    expect(
      isSameEngine({ vendor: 'DeepSeek', model: 'deepseek-chat' }, { vendor: ' deepseek ', model: 'deepseek-chat' })
    ).toBe(true);
    expect(
      isSameEngine({ vendor: 'DeepSeek', model: 'deepseek-chat' }, { vendor: 'DeepSeek', model: 'Deepseek-Chat' })
    ).toBe(false);
  });

  it('never confuses names that contain slashes', () => {
    expect(isSameEngine({ vendor: 'a/b', model: 'c' }, { vendor: 'a', model: 'b/c' })).toBe(false);
  });

  it('treats Google as its own engine', () => {
    expect(isSameEngine(GOOGLE_ENGINE, GOOGLE_ENGINE)).toBe(true);
    expect(isSameEngine(GOOGLE_ENGINE, { vendor: 'google', model: 'gemini' })).toBe(false);
  });

  it('copies only vendor and model', () => {
    const provider = { vendor: 'DeepSeek', model: 'deepseek-chat', api_key: 'sk' };
    expect(toProviderRef(provider)).toEqual({ vendor: 'DeepSeek', model: 'deepseek-chat' });
  });
});
