/**
 * 配置校验失败的原因，供设置页换成面向用户的提示；message 仍是原来的技术描述，便于日志排查。
 * - required：必填字段为空；invalid：值不合法；url：不是 http(s) 网址；
 * - duplicate：厂商 + 模型（或厂商预设的厂商名）重复。
 */
export interface ConfigIssue {
  code: 'required' | 'invalid' | 'url' | 'duplicate';
  /** 出错的条目：AI 服务或厂商预设。 */
  scope: 'provider' | 'vendor';
  /** 出错条目在列表中的位置，从 0 开始。 */
  index?: number;
  /** 出错的字段，与表单字段名一致，例如 model、base_url、temperature。 */
  field?: string;
}

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly issue: ConfigIssue
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** 校验 http(s) 网址；Provider 请求和 host 权限都依赖它能被 URL 解析。 */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
