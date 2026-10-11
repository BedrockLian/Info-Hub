// DeepSeek official off-peak rates checked 2026-10-10. Deliberately ignore cache discounts; calls are restricted to valleys.
// Source: https://api-docs.deepseek.com/quick_start/pricing ; these are estimates, not invoices.
export const FLASH_INPUT_USD_PER_MILLION = 0.15;
export const FLASH_OUTPUT_USD_PER_MILLION = 0.60;
const rounded = (value:number) => Math.ceil(value * 100000000) / 100000000;
export function reserveFlashUsd(text:string,maxOutputTokens:number): number {
  // UTF-8 bytes upper-bound byte-level tokenization; allow overhead for the two messages.
  return rounded(((Buffer.byteLength(text,'utf8') + 256) * FLASH_INPUT_USD_PER_MILLION + maxOutputTokens * FLASH_OUTPUT_USD_PER_MILLION) / 1000000);
}
export function estimateFlashUsd(usage:Record<string,unknown>|null): number|null {
  const input=usage?.prompt_tokens, output=usage?.completion_tokens;
  if(typeof input!=='number'||typeof output!=='number'||!Number.isSafeInteger(input)||!Number.isSafeInteger(output)||input<0||output<0)return null;
  return rounded((input * FLASH_INPUT_USD_PER_MILLION + output * FLASH_OUTPUT_USD_PER_MILLION) / 1000000);
}
