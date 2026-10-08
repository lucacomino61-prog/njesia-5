import type { APIRoute } from 'astro';
import { callAuth, redirectWith } from '../lib/authflow';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const r = await callAuth((a) => a.api.signOut({ headers: request.headers, asResponse: true }));
  return redirectWith(locals.lang === 'en' ? '/en' : '/', r.cookies);
};
export const GET: APIRoute = ({ redirect }) => redirect('/', 303);
