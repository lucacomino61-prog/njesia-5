import type { APIRoute } from 'astro';
import { ACTIONS } from '../../lib/actions';
import { done, safeBack } from '../../lib/respond';
import { t } from '../../i18n';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const handler = ACTIONS[ctx.params.action ?? ''];
  const lang: Lang = ctx.request.headers.get('x-n5-lang') === 'en' || (ctx.request.headers.get('referer') ?? '').includes('/en') ? 'en' : 'sq';
  if (!handler) return new Response('Not found', { status: 404 });
  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return done(ctx, { ok: false, error: t(lang).errors.invalid, back: '/' });
  }
  const formLang = form.get('lang');
  const l: Lang = formLang === 'en' || formLang === 'sq' ? formLang : lang;
  const back = safeBack(form.get('back') ?? new URL(ctx.request.headers.get('referer') ?? '/', ctx.url).pathname, l === 'en' ? '/en' : '/');
  try {
    const r = await handler({ user: ctx.locals.user, lang: l, form, back });
    return done(ctx, { ...r, back });
  } catch (e) {
    console.error('action', ctx.params.action, e);
    return done(ctx, { ok: false, error: t(l).errors.generic, back, status: 500 });
  }
};

export const GET: APIRoute = ({ redirect }) => redirect('/', 303);
