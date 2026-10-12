/** 以有限并发依次处理 items，结果顺序与输入一致。 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/** 按字符预算把文本分组，单条超长文本独占一组。 */
export function chunkByLength(texts: readonly string[], maxChars: number): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let size = 0;
  texts.forEach((text, index) => {
    if (current.length && size + text.length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(index);
    size += text.length + 1;
  });
  if (current.length) {
    chunks.push(current);
  }
  return chunks;
}
