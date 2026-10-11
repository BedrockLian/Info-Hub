import type { FastifyInstance } from 'fastify';
import { config } from '@aihot/backend/config';
import { readAuthorized } from '@aihot/backend/private/access';
import { sendProblem } from './http/respond.ts';

const PUBLIC = new Set(['/api/auth/login','/api/auth/options','/api/auth/password','/api/auth/feishu','/api/auth/callback','/robots.txt']);

export function registerPrivateBoundary(app: FastifyInstance) {
  if (!config.privateSite) return;
  app.addHook('onRequest', async (req, reply) => {
    const path = new URL(req.raw.url ?? '/', 'http://api.local').pathname;
    if (PUBLIC.has(path)) return;
    if (path === '/api/health' && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.raw.socket.remoteAddress ?? '')) return;
    const readMethod = req.method === 'GET' || req.method === 'HEAD' || (path === '/api/mcp' && req.method === 'POST');
    // Admin routes and all writes use their session + CSRF guard; a subscription token is read only.
    if (path.startsWith('/api/admin/') || path === '/api/auth/logout') return;
    if (!readMethod || !await readAuthorized(req.headers.cookie, req.headers.authorization)) {
      return sendProblem(req, reply, {status:401,code:'unauthorized',detail:'Sign in or supply a read-only Bearer token.'});
    }
  });
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Cache-Control','private, no-store').header('X-Accel-Expires','0').header('X-Robots-Tag','noindex, nofollow');
    reply.removeHeader('Expires');
    reply.removeHeader('Access-Control-Allow-Origin');
    reply.removeHeader('Access-Control-Allow-Credentials');
    return payload;
  });
}
