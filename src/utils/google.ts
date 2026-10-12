import { chunkByLength, mapWithConcurrency } from './concurrency';

/** Google 翻译网页版使用的免费接口（非官方），sl=auto 自动识别源语言。 */
const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MAX_CHARS_PER_REQUEST = 4500;
const CONCURRENCY = 4;

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
  const url = new URL(GOOGLE_TRANSLATE_ENDPOINT);
  url.search = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: targetLang, dt: 't' }).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }),
    signal,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'Google Translate is rate limiting requests, try again later'
        : `Google Translate request failed with HTTP ${response.status}`
    );
  }
  return parseGoogleResponse(await response.json());
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
