// DeepSeek official off-peak rates checked 2026-10-13. Reserve without discounts; settle validated native cache counters.
// Source: https://api-docs.deepseek.com/quick_start/pricing ; these are estimates, not invoices.
export const FLASH_INPUT_USD_PER_MILLION = 0.15;
export const FLASH_OUTPUT_USD_PER_MILLION = 0.60;
export const FLASH_CACHED_INPUT_USD_PER_MILLION = 0.003;
export function cacheUsage(usage:Record<string,unknown>|null): {known:boolean;hit:number;miss:number} {
  const input=usage?.prompt_tokens,hit=usage?.prompt_cache_hit_tokens,miss=usage?.prompt_cache_miss_tokens;
  if(typeof input==='number'&&Number.isSafeInteger(input)&&input>=0&&typeof hit==='number'&&Number.isSafeInteger(hit)&&hit>=0&&hit<=input
    && (miss===undefined || (typeof miss==='number'&&Number.isSafeInteger(miss)&&miss>=0&&hit+miss===input)))return {known:true,hit,miss:input-hit};
  return {known:false,hit:0,miss:typeof input==='number'&&Number.isSafeInteger(input)&&input>=0?input:0};
}
const rounded = (value:number) => Math.ceil(value * 100000000) / 100000000;
export function reserveFlashUsd(text:string,maxOutputTokens:number): number {
  // UTF-8 bytes upper-bound byte-level tokenization; allow overhead for the two messages.
  return rounded(((Buffer.byteLength(text,'utf8') + 256) * FLASH_INPUT_USD_PER_MILLION + maxOutputTokens * FLASH_OUTPUT_USD_PER_MILLION) / 1000000);
}
export function estimateFlashUsd(usage:Record<string,unknown>|null): number|null {
  const input=usage?.prompt_tokens, output=usage?.completion_tokens;
  if(typeof input!=='number'||typeof output!=='number'||!Number.isSafeInteger(input)||!Number.isSafeInteger(output)||input<0||output<0)return null;
  const cache=cacheUsage(usage);
  return rounded((cache.hit*FLASH_CACHED_INPUT_USD_PER_MILLION + cache.miss*FLASH_INPUT_USD_PER_MILLION + output*FLASH_OUTPUT_USD_PER_MILLION) / 1000000);
}
