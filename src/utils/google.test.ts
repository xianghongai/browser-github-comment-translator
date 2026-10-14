import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateWithGoogle } from './google';

const ok = (text: string) => new Response(JSON.stringify([[[text, '', null, null, 10]], null, 'en']));
const blocked = () => new Response('<title>Sorry...</title>', { status: 429 });
/** redirect: 'manual' 下跳转到 www.google.com/sorry 得到的响应。 */
const redirected = () => ({ type: 'opaqueredirect', status: 0, ok: false }) as Response;

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

  it('treats a redirect to the Sorry page as blocked and falls back to the other host', async () => {
    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(init.redirect).toBe('manual');
      return url.host === 'translate.google.com' ? redirected() : ok('你好');
    });
    vi.stubGlobal('fetch', fetchMock);
    // 上一个用例把首选域名切到了 translate.google.com，这里它被封，换回 translate.googleapis.com。
    expect(await translateWithGoogle(['Hello'], 'zh-CN')).toEqual(['你好']);
    expect(fetchMock.mock.calls.map(([url]) => url.host)).toEqual(['translate.google.com', 'translate.googleapis.com']);
  });

  it('falls back to the other host on a network error and rethrows it when every host fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => {
        if (url.host === 'translate.googleapis.com') {
          throw new TypeError('Failed to fetch');
        }
        return ok('你好');
      })
    );
    expect(await translateWithGoogle(['Hello'], 'zh-CN')).toEqual(['你好']);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    await expect(translateWithGoogle(['Hello'], 'zh-CN')).rejects.toThrow('Failed to fetch');
  });
});
