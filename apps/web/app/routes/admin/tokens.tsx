import { useState } from 'react';
import type { Route } from './+types/tokens';
import { adminGet } from '../../lib/admin.server';
import { useAdminAction } from '../../features/admin/action';
import { bj } from '../../features/admin/format';

type Token = {id:string;name:string;created_at:string;expires_at:string;revoked_at:string|null};
export async function loader({request}: Route.LoaderArgs) {return adminGet<Token[]>(request,'/api/admin/read-tokens');}
export default function Tokens({loaderData}:Route.ComponentProps) {
 const {run,busy}=useAdminAction();
 const [secret,setSecret]=useState<string|null>(null);
 return <div className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-semibold">订阅令牌</h1>
 <p className="my-4 text-ink-3">为 RSS 阅读器、API 或 MCP 创建只读令牌，使用 Authorization: Bearer 请求头。令牌只显示一次，可随时撤销；不会获得后台权限。</p>
 <form className="flex flex-wrap gap-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setSecret(null);const result=await run<{token:string}>('POST','/api/admin/read-tokens',{name:f.get('name'),days:Number(f.get('days'))});if(result)setSecret(result.token);}}>
 <input name="name" aria-label="令牌名称" placeholder="例如：桌面 RSS" required maxLength={100} className="rounded border p-2"/>
 <input name="days" aria-label="有效天数" type="number" min={1} max={365} defaultValue={30} required className="w-24 rounded border p-2"/>
 <button disabled={busy} className="rounded border p-2">创建</button></form>
 {secret && <div className="my-4 rounded border p-4"><p>请复制并妥善保存，离开页面后不再显示。</p><code className="break-all">{secret}</code><button className="ml-3 underline" onClick={()=>{setSecret(null);}}>隐藏</button></div>}
 <ul className="mt-6 space-y-4">{loaderData.map(t=><li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"><div><strong>{t.name}</strong><p className="text-sm text-ink-3">有效至 {bj(t.expires_at,true)} · {t.revoked_at?'已撤销':new Date(t.expires_at).getTime()<Date.now()?'已过期':'有效'}</p></div>{!t.revoked_at && <button disabled={busy} onClick={()=>run('DELETE',`/api/admin/read-tokens/${t.id}`)} className="underline">撤销</button>}</li>)}</ul></div>;
}
