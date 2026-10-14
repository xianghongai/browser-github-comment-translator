import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAzureOpenAIChatRequest, buildAzureOpenAIEndpoint } from './azureOpenAI';
import { getProviderOriginPattern, parseProviderConfigs, selectActiveProvider } from './config';
import { createClient } from './factory';
import { buildGeminiEndpoint, buildGeminiRequest, parseGeminiResponse } from './gemini';
import { buildOllamaChatRequest, parseOllamaChatResponse } from './ollama';
import { buildOpenAIChatRequest, parseOpenAIChatResponse } from './openaiCompatible';
import { extractErrorDetail } from './shared';
import type { ChatMessage, ProviderConfig } from './types';

const messages: ChatMessage[] = [
  { role: 'system', content: 'system instruction' },
  { role: 'user', content: 'comment' },
  { role: 'assistant', content: 'previous answer' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request builders', () => {
  it('preserves the OpenAI-compatible request mapping', () => {
    const request = buildOpenAIChatRequest(
      {
        vendor: 'compatible',
        type: 'openai-compatible',
        base_url: 'https://example.invalid/v1',
        api_key: 'key',
        model: 'model',
        params: { temperature: 0.4, top_p: 0.8, max_tokens: 256 },
      },
      messages
    );
    expect(request).toEqual({ model: 'model', messages, temperature: 0.4, top_p: 0.8, max_tokens: 256 });
  });

  it('leaves generation params to the service when none are configured', () => {
    const conf = {
      vendor: 'anthropic',
      type: 'openai-compatible',
      base_url: 'https://api.anthropic.com/v1',
      api_key: 'key',
      model: 'model',
    } as const;
    expect(buildOpenAIChatRequest(conf, messages)).toEqual({ model: 'model', messages });
    expect(
      buildAzureOpenAIChatRequest(
        {
          vendor: 'azure',
          type: 'azure-openai',
          endpoint: 'https://r.example',
          api_key: 'k',
          api_version: 'v',
          deployment: 'd',
          model: 'model',
        },
        messages
      )
    ).toEqual({ model: 'model', messages });
  });

  it('routes Azure requests through the deployment and api-version', () => {
    const conf = {
      vendor: 'azure',
      type: 'azure-openai',
      endpoint: 'https://res.openai.azure.com/',
      api_key: 'key',
      api_version: '2024-10-21',
      deployment: 'gpt 4o',
      model: 'model',
    } as const;
    expect(buildAzureOpenAIChatRequest(conf, messages).model).toBe('model');
    expect(buildAzureOpenAIEndpoint(conf).href).toBe(
      'https://res.openai.azure.com/openai/deployments/gpt%204o/chat/completions?api-version=2024-10-21'
    );
  });

  it('maps Gemini system and assistant roles to the REST contract', () => {
    const conf = {
      vendor: 'gemini',
      type: 'gemini',
      api_key: 'key',
      model: 'gemini-2.5-flash',
      params: { temperature: 0.3, top_p: 0.7, max_tokens: 128 },
    } as const;
    expect(buildGeminiRequest(conf, messages)).toEqual({
      contents: [
        { role: 'user', parts: [{ text: 'comment' }] },
        { role: 'model', parts: [{ text: 'previous answer' }] },
      ],
      systemInstruction: { parts: [{ text: 'system instruction' }] },
      generationConfig: { temperature: 0.3, topP: 0.7, maxOutputTokens: 128 },
    });
    expect(buildGeminiEndpoint(conf).href).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    );
  });

  it('builds and parses the Ollama non-streaming chat contract', () => {
    expect(
      buildOllamaChatRequest(
        { vendor: 'ollama', type: 'ollama', model: 'model', params: { temperature: 0.2, top_p: 0.6, max_tokens: 64 } },
        messages
      )
    ).toEqual({ model: 'model', messages, stream: false, options: { temperature: 0.2, top_p: 0.6, num_predict: 64 } });
    expect(parseOllamaChatResponse({ message: { role: 'assistant', content: 'ok' }, done: true })).toBe('ok');
    expect(() => parseOllamaChatResponse({ response: 'unexpected' })).toThrow(/invalid chat response/);
  });
});

describe('response parsers', () => {
  it('reads the first OpenAI choice', () => {
    expect(parseOpenAIChatResponse({ choices: [{ message: { content: '你好' } }] })).toBe('你好');
    expect(() => parseOpenAIChatResponse({})).toThrow(/invalid chat response/);
  });

  it('joins Gemini text parts and skips thoughts', () => {
    expect(
      parseGeminiResponse({
        candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: 'a' }, { text: 'b' }] } }],
      })
    ).toBe('ab');
  });

  it('extracts readable error details', () => {
    expect(extractErrorDetail('{"error":{"message":"Invalid API key"}}')).toBe('Invalid API key');
    expect(extractErrorDetail('{"error":"model not found"}')).toBe('model not found');
    expect(extractErrorDetail('Bad gateway')).toBe('Bad gateway');
  });
});

describe('clients', () => {
  it('sends OpenAI-compatible requests with bearer auth and custom headers', async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: '译文' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient({
      vendor: 'deepseek',
      type: 'openai-compatible',
      base_url: 'https://api.deepseek.com/v1',
      api_key: 'sk-test',
      model: 'deepseek-chat',
      headers: { 'X-Test': '1' },
    });
    await expect(client.chat(messages)).resolves.toBe('译文');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test', 'X-Test': '1' });
  });

  it('sends the OpenAI-Organization header when organization is set', async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const [entry] = parseProviderConfigs([
      { vendor: 'OpenAI', type: 'openai', api_key: 'sk', model: 'gpt-4o-mini', organization: 'org-1' },
    ]);
    expect(entry).toMatchObject({ organization: 'org-1' });
    await createClient(selectActiveProvider([entry])).chat(messages);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).toMatchObject({ 'OpenAI-Organization': 'org-1' });
  });

  it('surfaces HTTP errors with the service message', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'Invalid API key' } }, { status: 401 }));
    const client = createClient({ vendor: 'OpenAI', type: 'openai', api_key: 'bad', model: 'gpt-4o-mini' });
    await expect(client.chat(messages)).rejects.toThrow(
      'OpenAI · gpt-4o-mini request failed with HTTP 401: Invalid API key'
    );
  });

  it('implements every ProviderConfig discriminator', () => {
    const configs: ProviderConfig[] = [
      { vendor: 'openai', type: 'openai', api_key: 'key', model: 'model' },
      {
        vendor: 'compatible',
        type: 'openai-compatible',
        base_url: 'https://example.invalid/v1',
        api_key: 'key',
        model: 'm',
      },
      { vendor: 'openrouter', type: 'openrouter', base_url: 'https://example.invalid/v1', api_key: 'key', model: 'm' },
      {
        vendor: 'azure',
        type: 'azure-openai',
        endpoint: 'https://example.invalid',
        api_key: 'key',
        api_version: 'version',
        deployment: 'deployment',
        model: 'model',
      },
      { vendor: 'gemini', type: 'gemini', api_key: 'key', model: 'model' },
      { vendor: 'ollama', type: 'ollama', model: 'model' },
    ];
    for (const config of configs) {
      expect(typeof createClient(config).chat).toBe('function');
    }
  });
});

describe('provider config', () => {
  it('parses OpenAI without requiring a custom base URL', () => {
    const [provider] = parseProviderConfigs([{ vendor: 'openai', type: 'openai', model: 'model', api_key: 'key' }]);
    expect('base_url' in provider ? provider.base_url : undefined).toBeUndefined();
  });

  it('identifies providers by vendor + model, case-insensitively', () => {
    expect(
      parseProviderConfigs([
        { vendor: 'Ollama', type: 'ollama', model: 'qwen3' },
        { vendor: 'Ollama', type: 'ollama', model: 'llama3' },
      ])
    ).toHaveLength(2);
    expect(() =>
      parseProviderConfigs([
        { vendor: 'DeepSeek', type: 'ollama', model: 'deepseek-chat' },
        { vendor: 'deepseek', type: 'ollama', model: 'deepseek-chat' },
      ])
    ).toThrow("provider 'deepseek · deepseek-chat' is duplicated: vendor + model must be unique");
    expect(() => parseProviderConfigs([{ type: 'openai-compatible', model: 'm' }])).toThrow(
      'providers[0].vendor is required'
    );
    // 按字段比较，名字里的 / 不会让两个不同的服务「撞」成同一个。
    expect(
      parseProviderConfigs([
        { vendor: 'a/b', type: 'ollama', model: 'c' },
        { vendor: 'a', type: 'ollama', model: 'b/c' },
      ])
    ).toHaveLength(2);
  });

  it('requires an API key for the selected provider but allows key-less templates', () => {
    const providers = parseProviderConfigs([
      { vendor: 'local', type: 'ollama', model: 'model' },
      { vendor: 'template', type: 'openai-compatible', model: 'm', base_url: 'https://example.invalid/v1' },
    ]);
    expect(selectActiveProvider(providers, { vendor: 'LOCAL', model: 'model' }).vendor).toBe('local');
    expect(() => selectActiveProvider(providers, { vendor: 'template', model: 'm' })).toThrow(
      "provider 'template · m' (providers[1]).api_key is required"
    );
    expect(() => selectActiveProvider(providers, { vendor: 'local', model: 'other' })).toThrow(/was not found/);
  });

  it('validates provider-specific required fields', () => {
    expect(() => parseProviderConfigs([{ vendor: 'c', type: 'openai-compatible', model: 'm', api_key: 'k' }])).toThrow(
      /base_url is required/
    );
    expect(() => parseProviderConfigs([{ vendor: 'a', type: 'azure-openai', model: 'm', api_key: 'k' }])).toThrow(
      /endpoint is required/
    );
  });

  it('derives host permission patterns without ports', () => {
    const [openai, local, azure, gemini] = parseProviderConfigs([
      { vendor: 'openai', type: 'openai', model: 'm' },
      { vendor: 'local', type: 'ollama', model: 'm' },
      {
        vendor: 'azure',
        type: 'azure-openai',
        model: 'm',
        endpoint: 'https://res.openai.azure.com',
        api_version: 'v',
        deployment: 'd',
      },
      { vendor: 'gemini', type: 'gemini', model: 'm' },
    ]);
    expect([openai, local, azure, gemini].map(getProviderOriginPattern)).toEqual([
      'https://api.openai.com/*',
      'http://127.0.0.1/*',
      'https://res.openai.azure.com/*',
      'https://generativelanguage.googleapis.com/*',
    ]);
  });
});
