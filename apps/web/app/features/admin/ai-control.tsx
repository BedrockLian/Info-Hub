import { useEffect, useState } from 'react';
import type { AiRuntimeStatus } from '@aihot/contracts/ai-control';
import { useAdminAction } from './action';
import { bj } from './format';
import { Badge, Button, Card } from './ui';

export function AiControl({ status }: { status: AiRuntimeStatus }) {
  const [ai, setAi] = useState(status);
  const { run, busy } = useAdminAction();
  useEffect(() => setAi(status), [status]);
  return (
    <Card title="AI模块总开关" right={<Badge tone={ai.effectiveEnabled ? 'ok' : 'warn'}>{!ai.deploymentEnabled ? '部署已禁用' : ai.enabled ? '已开启' : '已暂停'}</Badge>}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-[13px] leading-relaxed text-ink-2" id="ai-control-description">
          <p>控制文章筛选、评分、摘要、翻译、事件组织和日报AI增强。采集、阅读及日报基础版继续运行。</p>
          <p className="mt-1 text-ink-3">关闭后暂停新的AI请求，已发出的请求正常收尾；开启后自动继续等待中的任务，保留预算和各模块配置。</p>
          {!ai.deploymentEnabled && <p className="mt-2 text-amber">服务器安全阀已关闭，需要先在部署配置中允许AI调用；网页开关不能覆盖此限制。</p>}
          {ai.updatedAt && <p className="mt-2 text-[12px] text-ink-4">最近修改：{bj(ai.updatedAt, true)}</p>}
        </div>
        <Button
          role="switch"
          aria-checked={ai.enabled}
          aria-label={`AI模块总开关：${ai.enabled ? '关闭AI' : '开启AI'}`}
          aria-describedby="ai-control-description"
          tone={ai.enabled ? 'secondary' : 'primary'}
          className="w-full shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:w-auto"
          busy={busy}
          disabled={!ai.deploymentEnabled}
          onClick={async () => {
            const result = await run<AiRuntimeStatus>('PUT', '/api/admin/settings/ai', { enabled: !ai.enabled }, { label: 'ai-control', success: ai.enabled ? 'AI已暂停，已发出的请求将正常收尾' : 'AI已开启，等待中的任务将自动继续' });
            if (result) setAi(result);
          }}
        >{busy ? '正在保存…' : ai.enabled ? '关闭AI' : '开启AI'}</Button>
      </div>
    </Card>
  );
}
