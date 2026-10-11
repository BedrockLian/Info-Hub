import { Link } from 'react-router';
import { SITE } from '@aihot/industry/site';
export const meta=()=>[{title:`订阅与接入 · ${SITE.name}`}];
export default function Agent() {return <article className="space-y-5 py-6"><h1 className="text-2xl font-semibold">订阅与接入</h1><p>Info-Hub 供个人使用。网页使用登录会话；RSS、API 和 MCP 使用登录会话或只读 Bearer 令牌。</p><p>在<Link to="/admin/tokens" className="underline">订阅令牌</Link>创建有期限的令牌，并在客户端设置 Authorization 请求头。令牌不能写入或访问后台；不接受 URL 查询参数中的令牌。</p><pre className="overflow-x-auto rounded border p-4">{`Authorization: Bearer <你的只读令牌>\n\nRSS: /feed.xml\nAPI: /api/v1/items\nMCP: /api/mcp`}</pre><p>请选用支持自定义 Authorization 请求头的 RSS 阅读器。摘要附带原文链接，全文版权归来源所有。</p></article>;}
