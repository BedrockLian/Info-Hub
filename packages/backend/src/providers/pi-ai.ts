import {createModels,createProvider,hasApi,type Model,type ProviderStreams} from '@earendil-works/pi-ai';

/** An explicit Pi AI model registry; credentials stay in the existing backend credential boundary. */
export function createPiModelRuntime(input:{modelId:string;baseUrl:string;apiKey:string;maxTokens:number;streams:ProviderStreams}){
  const configured:Model<'openai-completions'>={id:input.modelId,name:'Info-Hub DeepSeek Flash',api:'openai-completions',provider:'deepseek',baseUrl:input.baseUrl,
    reasoning:true,input:['text'],contextWindow:1000000,maxTokens:input.maxTokens,
    cost:{input:0.15,output:0.60,cacheRead:0.003,cacheWrite:0.15},
    compat:{supportsDeveloperRole:false,supportsReasoningEffort:true}};
  const models=createModels();
  models.setProvider(createProvider({id:'deepseek',name:'Info-Hub DeepSeek',baseUrl:input.baseUrl,
    auth:{apiKey:{name:'Existing Info-Hub API key',resolve:async()=>({auth:{apiKey:input.apiKey}})}},
    models:[configured],api:input.streams}));
  const model=models.getModel('deepseek',input.modelId);
  if(!model||!hasApi(model,'openai-completions'))throw new Error('Configured Pi AI model is unavailable');
  return {models,model};
}
