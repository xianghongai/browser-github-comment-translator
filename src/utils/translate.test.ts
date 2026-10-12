import { afterEach, describe, expect, it, vi } from 'vitest';
import { chunkByLength, mapWithConcurrency } from './concurrency';
import { parseGoogleResponse, translateWithGoogle } from './google';
import { describeLanguage, parseTranslationArray, translateWithProvider } from './translate-ai';

afterEach(() => {
  vi.unstubAllGlobals();
});

function googleReply(text: string) {
  return Response.json([[[text, 'source', null, null, 3]], null, 'en']);
}

describe('concurrency helpers', () => {
  it('keeps result order regardless of completion order', async () => {
    const results = await mapWithConcurrency([30, 10, 20], 2, async (ms, index) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return index;
    });
    expect(results).toEqual([0, 1, 2]);
  });

  it('groups texts by a character budget', () => {
    expect(chunkByLength(['aaaa', 'bb', 'cccccc', 'd'], 7)).toEqual([[0, 1], [2], [3]]);
  });
});

describe('Google Translate', () => {
  it('joins sentence fragments', () => {
    expect(
      parseGoogleResponse([
        [
          ['你好。', 'Hello.'],
          ['世界', 'World'],
        ],
        null,
        'en',
      ])
    ).toBe('你好。世界');
    expect(() => parseGoogleResponse({})).toThrow(/unexpected response/);
  });

  it('batches segments into one request and splits by line', async () => {
    const fetchMock = vi.fn(async () => googleReply('一\n二\n三'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(translateWithGoogle(['one', 'two', 'three'], 'zh-CN')).resolves.toEqual(['一', '二', '三']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get('tl')).toBe('zh-CN');
    expect((init.body as URLSearchParams).get('q')).toBe('one\ntwo\nthree');
  });

  it('falls back to one request per segment when lines do not line up', async () => {
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const q = (init.body as URLSearchParams).get('q')!;
      return googleReply(q.includes('\n') ? 'merged' : `t:${q}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(translateWithGoogle(['a', 'b'], 'ja')).resolves.toEqual(['t:a', 't:b']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports rate limiting clearly', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    await expect(translateWithGoogle(['a'], 'ja')).rejects.toThrow(/rate limiting/);
  });
});

describe('AI translation', () => {
  it('describes language codes for the prompt', () => {
    expect(describeLanguage('zh-CN')).toBe('Chinese (China) (zh-CN)');
    expect(describeLanguage('not a code!')).toBe('not a code!');
  });

  it('parses JSON arrays wrapped in fences or chatter', () => {
    expect(parseTranslationArray('```json\n["一", "二"]\n```', 2)).toEqual(['一', '二']);
    expect(parseTranslationArray('Here you go: ["一"]', 1)).toEqual(['一']);
    expect(parseTranslationArray('["一"]', 2)).toBeNull();
    expect(parseTranslationArray('not json', 1)).toBeNull();
  });

  it('translates a batch with one request and falls back per segment on a bad reply', async () => {
    const replies = ['["一","二"]', 'oops', 'α', 'β'];
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: replies.shift() } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const conf = { vendor: 'm', type: 'openai', api_key: 'k', model: 'x' } as const;

    await expect(translateWithProvider(conf, ['one', 'two'], 'zh-CN')).resolves.toEqual(['一', '二']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(translateWithProvider(conf, ['a', 'b'], 'el')).resolves.toEqual(['α', 'β']);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].body as string);
    expect(body.messages[0].content).toContain('Chinese (China) (zh-CN)');
    expect(body.messages[1].content).toBe('["one","two"]');
  });
});
