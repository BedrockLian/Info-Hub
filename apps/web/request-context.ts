import { AsyncLocalStorage } from 'node:async_hooks';
export type RequestContext = {headers: Record<string,string>; returnTo: string};
// The SSR bundle and edge server share storage, never a shared credential value.
const key = Symbol.for('infohub.request-context');
const shared = globalThis as typeof globalThis & {[key: symbol]: AsyncLocalStorage<RequestContext>};
export const requestContext = shared[key] ??= new AsyncLocalStorage<RequestContext>();
export const privateSite = process.env.PRIVATE_SITE !== 'false';
if (process.env.NODE_ENV === 'production' && !privateSite) throw new Error('Production Info-Hub must be private');
export function contextOf(req: {headers:{cookie?:string;authorization?:string};url?:string}): RequestContext {
  return {headers:{...(req.headers.cookie ? {cookie:req.headers.cookie} : {}),...(req.headers.authorization ? {authorization:req.headers.authorization} : {})},returnTo:req.url ?? '/'};
}
