import { chunkByLength, mapWithConcurrency } from './concurrency';
import { createClient } from './providers/factory';
import type { LLMClient, ProviderConfig } from './providers/types';

const MAX_CHARS_PER_REQUEST = 6000;
const CONCURRENCY = 2;

/** 把 BCP 47 语言代码转成模型更容易理解的英文语言名，例如 zh-CN → Chinese (China)。 */
export function describeLanguage(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

const PLACEHOLDER_RULES = [
  'Placeholders such as ⟦0⟧, ⟦1⟧ … ⟦/1⟧ wrap inline code, links, mentions and formatting.',
  'Keep every placeholder exactly as written and move it to the grammatically correct position.',
  'Do not translate code identifiers, file paths, CLI commands, URLs, @mentions or #references.',
  'Use natural wording that software developers would use.',
  'If a string is already in the target language, return it unchanged.',
].join(' ');

export function buildBatchSystemPrompt(targetLang: string): string {
  return [
    `You are a professional translator for GitHub discussions. Translate each string of the JSON array the user sends into ${describeLanguage(targetLang)}.`,
    PLACEHOLDER_RULES,
    'Reply with ONLY a JSON array of strings: same length, same order, no explanations, no code fences.',
  ].join('\n');
}

export function buildSingleSystemPrompt(targetLang: string): string {
  return [
    `You are a professional translator for GitHub discussions. Translate the user's text into ${describeLanguage(targetLang)}.`,
    PLACEHOLDER_RULES,
    'Reply with ONLY the translation.',
  ].join('\n');
}

/** 解析模型返回的 JSON 字符串数组；容忍代码围栏和前后多余文字，长度不符时返回 null。 */
export function parseTranslationArray(reply: string, expectedLength: number): string[] | null {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(reply.slice(start, end + 1));
    if (
      Array.isArray(value) &&
      value.length === expectedLength &&
      value.every((item): item is string => typeof item === 'string')
    ) {
      return value;
    }
  } catch {
    // 交给调用方退回逐段翻译。
  }
  return null;
}

/** 分批请求 AI 模型；某一批返回格式不对时，这一批改为逐段翻译。 */
export async function translateWithProvider(
  conf: ProviderConfig,
  texts: readonly string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<string[]> {
  const client = createClient(conf);
  const results = new Array<string>(texts.length);
  await mapWithConcurrency(chunkByLength(texts, MAX_CHARS_PER_REQUEST), CONCURRENCY, async (indexes) => {
    const batch = indexes.map((index) => texts[index]);
    const translated = await translateBatch(client, batch, targetLang, signal);
    indexes.forEach((index, position) => (results[index] = translated[position]));
  });
  return results;
}

async function translateBatch(
  client: LLMClient,
  batch: string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<string[]> {
  const reply = await client.chat(
    [
      { role: 'system', content: buildBatchSystemPrompt(targetLang) },
      { role: 'user', content: JSON.stringify(batch) },
    ],
    { signal }
  );
  const parsed = parseTranslationArray(reply, batch.length);
  if (parsed) {
    return parsed.map((text) => text.trim());
  }
  return mapWithConcurrency(batch, CONCURRENCY, async (text) => {
    const single = await client.chat(
      [
        { role: 'system', content: buildSingleSystemPrompt(targetLang) },
        { role: 'user', content: text },
      ],
      { signal }
    );
    return single.trim();
  });
}
