import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { translateWithGoogle } from '../utils/google';
import type { Request, TranslateResponse } from '../utils/messages';
import { getProviderOriginPattern, parseProviderConfigs, validateProviderConfig } from '../utils/providers/config';
import { GOOGLE_ENGINE, type Engine } from '../utils/engine';
import { getErrorMessage, getProviderLabel, isSameProvider } from '../utils/providers/shared';
import type { ProviderSettingsEntry } from '../utils/providers/types';
import { loadSettings } from '../utils/settings';
import { translateWithProvider } from '../utils/translate-ai';

const PROVIDER_TEST_TEXT = '你好，世界';

export default defineBackground(() => {
  // 用 sendResponse + return true 回复异步结果：Chrome 的 onMessage 不接受返回 Promise。
  browser.runtime.onMessage.addListener((message: Request, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) {
      return false;
    }
    switch (message.type) {
      case 'gct:translate':
        respond(translate(message.texts, message.engine), sendResponse);
        return true;
      case 'gct:test-provider':
        if (!isExtensionPage(sender)) {
          return false;
        }
        respond(testProvider(message.provider, message.target_lang), sendResponse);
        return true;
      default:
        return false;
    }
  });
});

/** 只有扩展自己的页面（options）可以提交未保存的 Provider 配置。 */
function isExtensionPage(sender: Browser.runtime.MessageSender): boolean {
  return !!sender.url?.startsWith(browser.runtime.getURL('/'));
}

function respond(
  work: Promise<Omit<Extract<TranslateResponse, { ok: true }>, 'ok'>>,
  sendResponse: (r: TranslateResponse) => void
) {
  work.then(
    (result) => sendResponse({ ok: true, ...result }),
    (error: unknown) => sendResponse({ ok: false, error: getErrorMessage(error, 'Translation failed') })
  );
}

async function translate(texts: string[], engine?: Engine) {
  const settings = await loadSettings();
  const selected = engine ?? settings.engine;
  if (selected === GOOGLE_ENGINE) {
    return {
      translations: await translateWithGoogle(texts, settings.target_lang),
      engineLabel: 'Google Translate',
    };
  }
  const entry = settings.providers.find((provider) => isSameProvider(provider, selected));
  if (!entry) {
    throw new Error(`AI provider '${getProviderLabel(selected)}' is not configured`);
  }
  return translateWithEntry(entry, texts, settings.target_lang);
}

async function testProvider(raw: unknown, targetLang: string) {
  const [entry] = parseProviderConfigs([raw]);
  return translateWithEntry(entry, [PROVIDER_TEST_TEXT], targetLang);
}

async function translateWithEntry(entry: ProviderSettingsEntry, texts: string[], targetLang: string) {
  const conf = validateProviderConfig(entry);
  const origin = getProviderOriginPattern(conf);
  if (!(await browser.permissions.contains({ origins: [origin] }))) {
    throw new Error(
      `Access to ${origin} has not been granted. Save the provider in the extension options to grant it.`
    );
  }
  return {
    translations: await translateWithProvider(conf, texts, targetLang),
    engineLabel: getProviderLabel(conf),
  };
}
