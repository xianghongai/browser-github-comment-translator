import { chunkByLength, mapWithConcurrency } from './concurrency';

/**
 * Google 翻译网页版使用的免费接口（非官方），sl=auto 自动识别源语言。
 * 两个域名接口相同；Google 会按 IP 单独封锁其中一个（返回 429「Sorry...」页），被封时换另一个。
 */
const GOOGLE_TRANSLATE_ENDPOINTS = [
  'https://translate.googleapis.com/translate_a/single',
  'https://translate.google.com/translate_a/single',
];
const MAX_CHARS_PER_REQUEST = 4500;
const CONCURRENCY = 4;

/** 上一次可用的域名下标；后续请求直接从它开始，避免每次都先撞一次 429。 */
let preferredEndpoint = 0;

/**
 * 批量翻译文本段。
 *
 * 段内空白已折叠，不含换行，所以多段可以用换行拼成一次请求、再按换行拆回；
 * 行数对不上时退回逐段请求。
 */
export async function translateWithGoogle(
  texts: readonly string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<string[]> {
  const results = new Array<string>(texts.length);
  await mapWithConcurrency(chunkByLength(texts, MAX_CHARS_PER_REQUEST), CONCURRENCY, async (indexes) => {
    const joined = await requestGoogle(indexes.map((index) => texts[index]).join('\n'), targetLang, signal);
    const lines = joined.split('\n');
    if (lines.length === indexes.length) {
      indexes.forEach((index, line) => (results[index] = lines[line].trim()));
      return;
    }
    await mapWithConcurrency(indexes, CONCURRENCY, async (index) => {
      results[index] = (await requestGoogle(texts[index], targetLang, signal)).trim();
    });
  });
  return results;
}

async function requestGoogle(text: string, targetLang: string, signal?: AbortSignal): Promise<string> {
  const start = preferredEndpoint;
  for (let attempt = 0; attempt < GOOGLE_TRANSLATE_ENDPOINTS.length; attempt++) {
    const index = (start + attempt) % GOOGLE_TRANSLATE_ENDPOINTS.length;
    const response = await fetchGoogle(GOOGLE_TRANSLATE_ENDPOINTS[index], text, targetLang, signal);
    if (response.status === 429) {
      continue;
    }
    if (!response.ok) {
      throw new Error(`Google Translate request failed with HTTP ${response.status}`);
    }
    preferredEndpoint = index;
    return parseGoogleResponse(await response.json());
  }
  throw new Error('Google Translate is rate limiting requests, try again later');
}

function fetchGoogle(endpoint: string, text: string, targetLang: string, signal?: AbortSignal): Promise<Response> {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: targetLang, dt: 't' }).toString();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }),
    signal,
  });
}

/** 响应形如 `[[["译文", "原文", …], …], null, "en", …]`，按句拼接第一列。 */
export function parseGoogleResponse(value: unknown): string {
  if (!Array.isArray(value) || !Array.isArray(value[0])) {
    throw new Error('Google Translate returned an unexpected response');
  }
  return (value[0] as unknown[])
    .map((sentence) => (Array.isArray(sentence) && typeof sentence[0] === 'string' ? sentence[0] : ''))
    .join('');
}
