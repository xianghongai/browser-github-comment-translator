import { describe, expect, it } from 'vitest';
import { ConfigError } from './config-error';
import { parseProviderConfigs, validateProviderConfig } from './providers/config';
import { parseVendorPresets } from './vendors';

function issueOf(run: () => unknown) {
  try {
    run();
  } catch (failure) {
    expect(failure).toBeInstanceOf(ConfigError);
    return (failure as ConfigError).issue;
  }
  throw new Error('expected a ConfigError');
}

const deepseek = { vendor: 'DeepSeek', type: 'openai-compatible', base_url: 'https://api.deepseek.com', model: 'm' };

describe('ConfigError issues', () => {
  it('names the missing provider field', () => {
    expect(issueOf(() => parseProviderConfigs([{ ...deepseek, model: ' ' }]))).toEqual({
      code: 'required',
      scope: 'provider',
      index: 0,
      field: 'model',
    });
  });

  it('flags a duplicate vendor + model at the later entry', () => {
    expect(issueOf(() => parseProviderConfigs([deepseek, { ...deepseek, vendor: 'deepseek' }]))).toMatchObject({
      code: 'duplicate',
      index: 1,
    });
  });

  it('rejects a Base URL or endpoint that is not an http(s) address', () => {
    expect(issueOf(() => parseProviderConfigs([{ ...deepseek, base_url: 'api.deepseek.com' }]))).toMatchObject({
      code: 'url',
      field: 'base_url',
    });
    expect(
      issueOf(() =>
        parseProviderConfigs([
          { vendor: 'Azure', type: 'azure-openai', endpoint: 'res', api_version: 'v', deployment: 'd', model: 'm' },
        ])
      )
    ).toMatchObject({ code: 'url', field: 'endpoint' });
    expect(
      issueOf(() => parseProviderConfigs([{ vendor: 'O', type: 'ollama', model: 'm', base_url: 'x' }]))
    ).toMatchObject({ code: 'url', field: 'base_url' });
  });

  it('points at out-of-range generation params', () => {
    expect(issueOf(() => parseProviderConfigs([{ ...deepseek, params: { temperature: 3 } }]))).toMatchObject({
      code: 'invalid',
      field: 'temperature',
    });
  });

  it('reports a missing API key when testing', () => {
    const [entry] = parseProviderConfigs([deepseek]);
    expect(issueOf(() => validateProviderConfig(entry))).toMatchObject({ code: 'required', field: 'api_key' });
  });

  it('describes vendor preset problems', () => {
    expect(issueOf(() => parseVendorPresets([{ vendor: '', type: 'ollama' }]))).toEqual({
      code: 'required',
      scope: 'vendor',
      index: 0,
      field: 'vendor',
    });
    expect(
      issueOf(() =>
        parseVendorPresets([
          { vendor: 'A', type: 'ollama' },
          { vendor: 'a', type: 'ollama' },
        ])
      )
    ).toMatchObject({ code: 'duplicate', scope: 'vendor', index: 1 });
    expect(
      issueOf(() => parseVendorPresets([{ vendor: 'A', type: 'openai-compatible', base_url: 'ftp://x' }]))
    ).toMatchObject({ code: 'url', field: 'base_url' });
  });
});
