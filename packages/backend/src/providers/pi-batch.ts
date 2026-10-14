// Group compatible tasks, but never combine articles into a shared model conversation.
export class TemplateBatcher {
  private groups=new Map<string,Array<{run:()=>Promise<void>}>>();
  private running=false;
  private pending=0;
  private concurrency:number;
  private batchSize:number;
  private delayMs:number;
  private maxPending:number;
  constructor(concurrency=2,batchSize=8,delayMs=20,maxPending=256){
    this.concurrency=concurrency;this.batchSize=batchSize;this.delayMs=delayMs;this.maxPending=maxPending;
  }
  submit<T>(template:string,run:()=>Promise<T>):Promise<T>{
    if(this.pending>=this.maxPending)return Promise.reject(new Error('Pi template batch queue is full'));
    this.pending++;
    return new Promise<T>((resolve,reject)=>{
      const jobs=this.groups.get(template)??[];
      jobs.push({run:async()=>{try{resolve(await run());}catch(error){reject(error);}finally{this.pending--;}}});
      this.groups.set(template,jobs);
      if(!this.running){this.running=true;setTimeout(()=>void this.drain(),this.delayMs);}
    });
  }
  private async drain(){
    while(this.groups.size){
      const [key,jobs]=this.groups.entries().next().value!;
      this.groups.delete(key);
      const batch=jobs.splice(0,this.batchSize);
      if(jobs.length)this.groups.set(key,jobs);
      let cursor=0;
      await Promise.all(Array.from({length:Math.min(this.concurrency,batch.length)},async()=>{
        while(cursor<batch.length)await batch[cursor++]!.run();
      }));
    }
    this.running=false;
  }
}

export const piBatches=new TemplateBatcher();
