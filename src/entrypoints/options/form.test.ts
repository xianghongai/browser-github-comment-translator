import { describe, expect, it } from 'vitest';
import { parseProviderConfigs } from '../../utils/providers/config';
import { emptyFields, entryToFields, fieldsToRaw } from './form';

describe('provider form mapping', () => {
  it('round-trips a provider through the form fields', () => {
    const [entry] = parseProviderConfigs([
      {
        vendor: 'deepseek',
        type: 'openai-compatible',
        base_url: 'https://api.deepseek.com/v1',
        api_key: 'sk',
        model: 'deepseek-chat',
        timeout_ms: 60000,
        headers: { 'X-Test': '1' },
        params: { temperature: 0.3, max_tokens: 2048 },
      },
    ]);
    expect(parseProviderConfigs([fieldsToRaw(entryToFields(entry), 0)])).toEqual([entry]);
  });

  it('drops fields that do not belong to the selected type', () => {
    const fields = { ...emptyFields('gemini'), vendor: 'g', model: 'm', api_key: 'k', base_url: 'https://left.over' };
    expect(fieldsToRaw(fields, 0)).toEqual({ vendor: 'g', type: 'gemini', model: 'm', api_key: 'k' });
  });

  it('reports invalid header JSON with the provider index', () => {
    const fields = { ...emptyFields('ollama'), vendor: 'o', model: 'm', headers: '{oops' };
    expect(() => fieldsToRaw(fields, 3)).toThrow('providers[3].headers must be a JSON object');
  });
});
