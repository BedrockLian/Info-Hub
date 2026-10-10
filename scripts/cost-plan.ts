// Planning assumptions, not observed usage or a bill. Prices checked 2026-10-10.
// One row is expected invocations per candidate that passes the prefilter, with input/output tokens.
const rate={input:0.15,output:0.60};
const cost=(input:number,output:number)=>(input*rate.input+output*rate.output)/1000000;
const prefilter=cost(3800,160);
const accepted=2*cost(7000,24)+cost(3000,220)+cost(3500,400)+0.5*cost(7000,180)+0.15*cost(6000,350);
const dailyReport=cost(10000,900);
for(const candidates of [60,100,150]) {
 const day=candidates*(prefilter+0.60*accepted)+dailyReport;
 console.log(JSON.stringify({candidatesPerDay:candidates,passRate:0.60,expectedUsdPerDay:Number(day.toFixed(3)),expectedUsd30Days:Number((day*30).toFixed(2)),basis:'assumed token sizes, no cache discount, off-peak only'}));
}
