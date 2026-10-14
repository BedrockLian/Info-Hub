// Private Info-Hub's official DeepSeek Flash calls only. Other deployments retain their model extras.
// Output ceilings include thinking and the final answer; these are headroom, not a target token spend.
export const REASONING_POLICY_VERSION = 'infohub-pi-low-v2';
export type ReasoningEffort = 'none' | 'low' | 'high';
export const REASONING_BY_PURPOSE: Readonly<Record<string, ReasoningEffort>> = {
  prefilter_article: 'low',
  score_article: 'low',
  understand_article: 'low',
  structure_article: 'none',
  summarize_article: 'none',
  group_article: 'low',
  group_signal: 'low',
  group_story: 'low',
  group_review: 'low',
  group_story_review: 'low',
  story_digest: 'low',
  report_lead: 'none',
  report_weekly: 'low',
  report_monthly: 'low',
  translate_body: 'none',
  translate_quoted: 'none',
  'monitor.recognize': 'low',
};
export const REASONING_OUTPUT_FLOOR = { none: 512, low: 4096, high: 8192 } as const;

// Prompt targets are deliberately separate from provider effort and the hard total-output ceiling.
// Keep prompt targets alongside the user's explicit low/none effort policy.
export const INFERENCE_GUIDANCE_VERSION = 'infohub-concise-v1';
const GUIDANCE: Readonly<Record<string, { softThinkingTokens: number|null; output: string }>> = {
  prefilter_article: { softThinkingTokens:400, output:'主题理由与个人判断依据各用一句短句；只保留必要的原文证据，不重复概括全文。' },
  score_article: { softThinkingTokens:1200, output:'只输出含 attentionScore 整数字段的 JSON；按既有五轴及权重完成必要核对，不逐个试探相邻分数。' },
  understand_article: { softThinkingTokens:1800, output:'只返回约定的六个字段；摘要遵循答案前置和关键细节规则，阅读价值用一两句话表达，不重复摘要。完整翻译类任务不得省略原文。' },
  structure_article: { softThinkingTokens:null, output:'只抽取要求的字段、必要标签及核心事实；未知值按原规则处理，不扩写说明。' },
  summarize_article: { softThinkingTokens:null, output:'保持原任务的输出格式；文章摘要只保留核心事实和最重要细节，短推文按原规则完整翻译，不为节省篇幅漏掉关键信息。' },
  group_article: { softThinkingTokens:600, output:'只比较事实主体、动作、对象和时间；结论理由简短，不复述所有候选报道。' },
  group_signal: { softThinkingTokens:600, output:'只比较事实主体、动作、对象和时间；结论理由简短，不复述所有候选报道。' },
  group_story: { softThinkingTokens:800, output:'聚焦是否同一事件及其关键进展；只输出指定结构和必要依据。' },
  group_review: { softThinkingTokens:1400, output:'优先核对可能误合并的矛盾与关键差异；理由简短，证据不足仍按原规则拒绝合并。' },
  group_story_review: { softThinkingTokens:1600, output:'优先核对可能误合并的矛盾与关键差异；理由简短，证据不足仍按原规则拒绝合并。' },
  story_digest: { softThinkingTokens:1000, output:'合并重复事实，仅保留事件主线、关键进展和必要差异；遵守原任务的格式及引用要求。' },
  report_lead: { softThinkingTokens:null, output:'导语直入当天最重要变化，遵守原篇幅要求，不逐条重述正文。' },
  report_weekly: { softThinkingTokens:2400, output:'按已有资料归纳主线、变化和差异；避免逐条重复报道，不添加无证据趋势。' },
  report_monthly: { softThinkingTokens:3200, output:'按已有资料归纳主线、变化和差异；避免逐条重复报道，不添加无证据趋势。' },
  translate_body: { softThinkingTokens:null, output:'完整翻译正文，保留原有信息、段落与链接；不得为了简短省略或改成摘要，不加译者说明。' },
  translate_quoted: { softThinkingTokens:null, output:'完整翻译引用材料，保留信息和归属；不得为了简短省略，不增加解释。' },
  'monitor.recognize': { softThinkingTokens:300, output:'只按公告材料判断指定条件，简短返回所需字段；不猜测未公布政策。' },
};

export function inferenceGuidance(purpose:string): {softThinkingTokens:number|null;instruction:string}|null {
  if (!Object.hasOwn(GUIDANCE,purpose)) return null;
  const {softThinkingTokens,output}=GUIDANCE[purpose]!;
  const reasoning=softThinkingTokens===null ? ''
    : `内部推理篇幅以约 ${softThinkingTokens} token 为软目标：用简短但充分的推理完成必要核对，结论明确后立即收束，避免重复推演、逐条复述规则及无关假设。不展示内部推理。`;
  return {softThinkingTokens,instruction:[
    '【执行篇幅约束】不改变原任务的事实标准、判断规则、权重、证据要求或输出格式；若简洁与完成必要判断冲突，以准确完成原任务为先。',
    reasoning,output,'只输出原任务要求的最终结果，不添加前言、过程说明或结束语。',
  ].filter(Boolean).join('\n')};
}
