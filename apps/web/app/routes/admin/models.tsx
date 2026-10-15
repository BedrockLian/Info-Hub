import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/models";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, money, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Field, FilterChips, ReasonDialog, Select } from "../../features/admin/ui";

interface Usage {
  purpose: string;
  model: string | null;
  promptVersion: string | null;
  runtime:string;
  runtimeVersion?:string|null;
  inputBand?:string;
  effort:string|null;
  templateHash:string|null;
  calls: number;
  ok: number;
  failed: number;
  unknown: number;
  p50: number | null;
  p95: number | null;
  tokensIn: number;
  tokensOut: number;
  cachedInput:number|null;
  cacheHitRate:number|null;
  uncachedInput?:number|null;
  cacheKnownCalls?:number;
  cacheUnknownCalls?:number;
  reasoningTokens?:number|null;
  reasoningKnownCalls?:number;
  inputKnownCalls?:number;
  outputKnownCalls?:number;
  fixedPrefixChars?:number|null;
  auditCalls?:number;
  estimatedCost?:number|null;
  reservedUsd?:number;
  actualCost: number | null;
  currency: string | null;
  estimate: { amount: number; currency: string } | null;
}

interface Models {
  days: number;
  capabilities: Array<{ key: string; label: string; env: string; defaultModel: string; vision: boolean; current: { model: string; source: "admin" | "env" | "default" }; usage: Usage[];resultCache:{lookups:number;hits:number;templates:number} }>;
  choices: Array<{ key: string; service: string; vision: boolean }>;
  history: Array<{ at: string; actor: string; subject: string; reason: string | null; before: { model: string; source: string } | null; after: { model: string; source: string } | null }>;
  benches: Array<{ id: string; label: string; sample_size: number; prompt_version: string | null; models: string[]; created_at: string }>;
}

export async function loader({ request }: Route.LoaderArgs) {
  const days = new URL(request.url).searchParams.get("days") ?? "7";
  return adminGet<Models>(request, `/api/admin/models?days=${encodeURIComponent(days)}`);
}

export const meta: Route.MetaFunction = () => [{ title: `模型与评测 · ${SITE.name} 后台` }];

const SOURCE_LABEL = { admin: "后台切换", env: "环境变量", default: "代码默认" } as const;
const secs = (ms: number | null) => (ms == null ? "—" : ms >= 10_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
const INPUT_BANDS:Record<string,string>={'0-2k':'≤2,048','2k-8k':'2,049–8,192','8k-32k':'8,193–32,768','32k+':'>32,768',unknown:'未知'};

export default function ModelsAdmin({ loaderData: m }: Route.ComponentProps) {
  const { run, pending } = useAdminAction();
  const [target, setTarget] = useState<Models["capabilities"][number] | null>(null);
  const [choice, setChoice] = useState<string>("");
  const labelOf = (key: string) => m.capabilities.find((c) => `capability:${c.key}` === key)?.label ?? key;

  return (
    <AdminPage
      title="模型与评测"
      subtitle="每项能力当前用哪个模型、来自哪里（后台切换 > 环境变量 > 代码默认），以及近期的成功率、耗时与费用。切换只影响之后的新任务，已有结果不重算；换精选模型前先看 SelectBench 同批对比。"
      actions={<FilterChips param="days" options={[{ value: "1", label: "24 小时" }, { value: "", label: "7 天" }, { value: "30", label: "30 天" }]} />}
    >
      <div className="grid grid-cols-1 gap-5">
        {m.capabilities.map((c) => {
          const total = c.usage.reduce((a, u) => a + u.calls, 0);
          return (
            <Card
              key={c.key}
              className="min-w-0"
              title={
                <span className="inline-flex flex-wrap items-center gap-2">
                  {c.label}
                  <span className="font-mono text-[12px] font-normal text-ink-3">{c.current.model}</span>
                  <Badge tone={c.current.source === "admin" ? "accent" : "muted"}>{SOURCE_LABEL[c.current.source]}</Badge>
                </span>
              }
              right={
                <Button
                  size="sm"
                  onClick={() => {
                    setTarget(c);
                    setChoice(c.current.model);
                  }}
                >
                  切换
                </Button>
              }
              pad={false}
            >
              <div className="border-b border-line px-4 py-3 text-xs text-ink-3" title="结果复用不调用模型。输入缓存比例只使用明细有效的付费尝试，未知明细单列；输出不合格的尝试仍计入用量和费用。按执行版本、思考档位、模板、实际输入长度与币种分组。">
                结果复用 {num(c.resultCache.hits)} / {num(c.resultCache.lookups)} 次 · 固定模板 {num(c.resultCache.templates)} 个
              </div>
              {c.usage.length ? (
                <DataTable
                  dense
                  rows={c.usage}
                  rowKey={(u) => `${u.purpose}|${u.model}|${u.promptVersion}|${u.runtime}|${u.runtimeVersion}|${u.effort}|${u.templateHash}|${u.inputBand}|${u.currency}`}
                  columns={[
                    { key: "m", label: "模型", render: (u) => <span className="whitespace-nowrap font-mono text-[12px]">{u.model}</span> },
                    { key:"runtime",label:"执行 / 思考",render:(u)=><span className="whitespace-nowrap" title={u.templateHash?`固定模板 ${u.templateHash}`:undefined}>{u.runtime==='pi-agent-core'?'Pi':'直连'} {u.runtimeVersion??'版本未记录'} · {u.effort==='none'?'关闭':u.effort==='low'?'低':u.effort==='high'?'高':'默认'}</span> },
                    { key: "v", label: "提示版本 / 前缀", render: (u) => <div className="text-ink-3"><span className="whitespace-nowrap font-mono text-[11.5px]">{u.promptVersion ?? "—"}</span><div className="mt-1 whitespace-nowrap text-xs">{u.fixedPrefixChars==null?'前缀未记录':`${num(u.fixedPrefixChars)} 字符 · 审计 ${num(u.auditCalls??0)}/${num(u.calls)}`}</div></div> },
                    { key: "p", label: "用途 / 输入长度", render: (u) => <div className="text-ink-3"><span className="whitespace-nowrap font-mono text-[11.5px]">{u.purpose}</span><div className="mt-1 whitespace-nowrap text-xs">{INPUT_BANDS[u.inputBand??'unknown']??'未知'} token</div></div> },
                    { key: "c", label: "调用", align: "right", render: (u) => num(u.calls) },
                    {
                      key: "ok",
                      label: "可用输出率",
                      align: "right",
                      render: (u) => {
                        const rate = u.calls ? u.ok / u.calls : 0;
                        return <span className={rate < 0.95 ? "text-hot" : ""} title={`失败 ${u.failed} · 结果未知 ${u.unknown}。格式可用不代表事实准确率。`}>{`${Math.round(rate * 1000) / 10}%`}</span>;
                      },
                    },
                    { key: "l", label: "耗时 p50 / p95", align: "right", render: (u) => <span className="whitespace-nowrap">{`${secs(u.p50)} / ${secs(u.p95)}`}</span> },
                    { key: "t", label: "输入 / 输出 token", align: "right", render: (u) => <div className="whitespace-nowrap">{`${u.inputKnownCalls===0?'未知':num(u.tokensIn)} / ${u.outputKnownCalls===0?'未知':num(u.tokensOut)}`}<div className="mt-1 text-xs text-ink-3">{u.reasoningTokens==null?'思考明细未知':`思考 ${num(u.reasoningTokens)} · 明细 ${num(u.reasoningKnownCalls??0)}/${num(u.calls)} 次`}</div>{u.inputKnownCalls!==undefined&&(u.inputKnownCalls!==u.calls||u.outputKnownCalls!==u.calls)&&<div className="mt-1 text-xs text-ink-3">用量明细 {num(u.inputKnownCalls)}/{num(u.calls)} · {num(u.outputKnownCalls??0)}/{num(u.calls)} 次</div>}</div> },
                    { key:"cache",label:"输入缓存命中",align:"right",render:(u)=><div className="whitespace-nowrap">{u.cacheHitRate===null?'未返回有效明细':`${(u.cacheHitRate*100).toFixed(1)}%`}{u.cacheKnownCalls!==undefined&&<div className="mt-1 text-xs text-ink-3">明细 {num(u.cacheKnownCalls)}/{num(u.calls)} 次 · 未知 {num(u.cacheUnknownCalls??0)}</div>}{u.cachedInput!==null&&<div className="mt-1 text-xs text-ink-3">命中 {num(u.cachedInput)} / 未中 {u.uncachedInput==null?'未知':num(u.uncachedInput)}</div>}</div> },
                    {
                      key: "$",
                      label: "费用",
                      align: "right",
                      render: (u) => {
                        const estimated=u.estimatedCost??(u.actualCost===null?u.estimate?.amount:null);
                        const currency=u.currency??u.estimate?.currency??'';
                        return <div className="whitespace-nowrap">{u.actualCost!==null&&<div>{money(u.actualCost,currency)} {currency}</div>}{estimated!=null&&<div title="估算与实计分别显示；输出不合格的付费尝试也计入">≈ {money(estimated,currency)} {currency}</div>}{u.actualCost===null&&estimated==null&&<span className="text-ink-4">费用未知</span>}{(u.reservedUsd??0)>0&&<div className="mt-1 text-xs text-ink-3">未结算预留 {money(u.reservedUsd!,'USD')}</div>}</div>;
                      },
                    },
                  ]}
                />
              ) : (
                <Empty>{m.days} 天内没有调用{total === 0 && c.vision ? "（只在有图片时使用）" : ""}</Empty>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="切换记录" pad={false}>
          {m.history.length ? (
            <DataTable
              dense
              rows={m.history}
              rowKey={(h) => `${h.at}|${h.subject}`}
              columns={[
                { key: "at", label: "时间", render: (h) => <span className="num whitespace-nowrap">{bj(h.at)}</span> },
                { key: "c", label: "能力", render: (h) => labelOf(h.subject) },
                { key: "m", label: "变化", render: (h) => <span className="font-mono text-[12px]">{h.before?.model ?? "—"} → {h.after?.model ?? "—"}</span> },
                { key: "r", label: "原因", render: (h) => <span className="text-ink-3">{h.reason}</span> },
                { key: "a", label: "操作人", render: (h) => h.actor },
              ]}
            />
          ) : (
            <Empty>还没有在后台切换过模型</Empty>
          )}
        </Card>
        <Card title="同批样本对比（SelectBench）" right={<Link to="/admin/selectbench" className="text-accent">全部运行</Link>} pad={false}>
          {m.benches.length ? (
            <DataTable
              dense
              rows={m.benches}
              rowKey={(b) => b.id}
              columns={[
                { key: "l", label: "运行", render: (b) => <Link to={`/admin/selectbench/${b.id}`} className="text-ink hover:text-accent">{b.label}</Link> },
                { key: "m", label: "模型", render: (b) => <span className="font-mono text-[11.5px] text-ink-3">{b.models.join("、")}</span> },
                { key: "n", label: "样本", align: "right", render: (b) => num(b.sample_size) },
                { key: "at", label: "时间", render: (b) => <span className="num whitespace-nowrap">{bj(b.created_at)}</span> },
              ]}
            />
          ) : (
            <Empty>还没有导入对比运行</Empty>
          )}
        </Card>
      </div>

      <ReasonDialog
        open={!!target}
        title={`切换模型：${target?.label ?? ""}`}
        description="只影响之后的新任务。选“恢复默认”会回到环境变量或代码默认。"
        confirmLabel="切换"
        busy={pending === "switch"}
        onClose={() => setTarget(null)}
        onSubmit={async (reason) =>
          (await run("POST", `/api/admin/models/${target!.key}`, { model: choice === "__default" ? null : choice, reason }, { label: "switch", success: "已切换，下一次调用生效" })) !== null
        }
      >
        <Field label="模型">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {m.choices
              .filter((x) => x.vision === !!target?.vision)
              .map((x) => (
                <option key={x.key} value={x.key}>
                  {x.key}（{x.service}）
                </option>
              ))}
            <option value="__default">恢复默认（{target?.env} 或 {target?.defaultModel}）</option>
          </Select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
