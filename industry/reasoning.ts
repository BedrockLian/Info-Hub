// Private Info-Hub's official DeepSeek Flash calls only. Other deployments retain their model extras.
// Output ceilings include thinking and the final answer; these are headroom, not a target token spend.
export const REASONING_POLICY_VERSION = 'infohub-scenes-v1';
export type ReasoningEffort = 'none' | 'low' | 'high';
export const REASONING_BY_PURPOSE: Readonly<Record<string, ReasoningEffort>> = {
  prefilter_article: 'low',
  score_article: 'high',
  understand_article: 'high',
  structure_article: 'none',
  summarize_article: 'none',
  group_article: 'low',
  group_signal: 'low',
  group_story: 'low',
  group_review: 'high',
  group_story_review: 'high',
  story_digest: 'low',
  report_lead: 'none',
  report_weekly: 'high',
  report_monthly: 'high',
  translate_body: 'none',
  translate_quoted: 'none',
  'monitor.recognize': 'low',
};
export const REASONING_OUTPUT_FLOOR = { none: 512, low: 4096, high: 8192 } as const;
