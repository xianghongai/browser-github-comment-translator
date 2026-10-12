/**
 * 目标语言列表，代码与 Google 翻译的 tl 参数一致（AI 翻译用 describeLanguage 转成英文语言名）。
 * 按使用人数和开发者社区的常见程度大致排序。
 */
export const TARGET_LANGUAGES = [
  'zh-CN',
  'zh-TW',
  'en',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt',
  'ru',
  'it',
  'ar',
  'hi',
  'bn',
  'id',
  'ms',
  'vi',
  'th',
  'tr',
  'fa',
  'ur',
  'he',
  'nl',
  'pl',
  'uk',
  'cs',
  'sk',
  'sv',
  'da',
  'no',
  'fi',
  'el',
  'hu',
  'ro',
  'bg',
  'sr',
  'hr',
  'sl',
  'lt',
  'lv',
  'et',
  'ca',
  'tl',
  'sw',
  'ta',
  'te',
  'mr',
  'gu',
  'kn',
  'ml',
  'pa',
  'my',
  'km',
  'ne',
  'kk',
  'uz',
] as const;

/** Google 的部分代码在 Intl 里另有更好的显示名：zh-CN/zh-TW 显示为简体/繁体中文，tl 显示为菲律宾语。 */
const DISPLAY_CODES: Record<string, string> = { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', tl: 'fil' };

/** 生成下拉选项文字：界面语言里的名称 · 该语言自己的名称 (代码)，例如「日语 · 日本語 (ja)」。 */
export function formatLanguageOption(code: string, uiLanguage: string): string {
  const displayCode = DISPLAY_CODES[code] ?? code;
  const localized = displayName(displayCode, uiLanguage);
  const native = displayName(displayCode, displayCode);
  if (!localized) {
    return code;
  }
  return native && native !== localized ? `${localized} · ${native} (${code})` : `${localized} (${code})`;
}

function displayName(code: string, locale: string): string | undefined {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    return name && name !== code ? name : undefined;
  } catch {
    return undefined;
  }
}
