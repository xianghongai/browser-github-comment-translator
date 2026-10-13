import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateWithGoogle } from './google';

const ok = (text: string) => new Response(JSON.stringify([[[text, '', null, null, 10]], null, 'en']));
const blocked = () => new Response('<title>Sorry...</title>', { status: 429 });

describe('translateWithGoogle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('switches to translate.google.com when translate.googleapis.com is blocked, and stays there', async () => {
    const fetchMock = vi.fn(async (url: URL) => (url.host === 'translate.googleapis.com' ? blocked() : ok('你好')));
    vi.stubGlobal('fetch', fetchMock);

    expect(await translateWithGoogle(['Hello'], 'zh-CN')).toEqual(['你好']);
    expect(await translateWithGoogle(['Hello'], 'zh-CN')).toEqual(['你好']);
    expect(fetchMock.mock.calls.map(([url]) => url.host)).toEqual([
      'translate.googleapis.com',
      'translate.google.com',
      'translate.google.com',
    ]);
  });

  it('reports rate limiting when every host is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => blocked()));
    await expect(translateWithGoogle(['Hello'], 'zh-CN')).rejects.toThrow('rate limiting');
  });
});
