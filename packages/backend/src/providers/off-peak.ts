// DeepSeek's current peak windows are Mon–Fri 01:00–04:00 and 06:00–10:00 UTC.
// Leave enough valley time for the configured request timeout plus 30 seconds of overhead.
export function modelWindow(now = new Date(), timeoutMs = 120000): {allowed:boolean;retryAfterSeconds:number} {
  const at = now.getTime();
  const midnight = Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const margin = timeoutMs + 30000;
  for(let day=0;day<8;day++) {
    const start = midnight + day * 86400000;
    const weekday = new Date(start).getUTCDay();
    if(weekday===0||weekday===6)continue;
    for(const [from,to] of [[1,4],[6,10]] as const) {
      const peakStart=start+from*3600000,peakEnd=start+to*3600000;
      if(at>=peakEnd)continue;
      if(at>=peakStart || peakStart-at<=margin)return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((peakEnd-at)/1000))};
      return {allowed:true,retryAfterSeconds:0};
    }
  }
  return {allowed:true,retryAfterSeconds:0};
}
