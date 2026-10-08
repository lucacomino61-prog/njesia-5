import { betterAuth } from 'better-auth';
import { env } from 'cloudflare:workers';
import { authOptions } from './auth-options';
import { deliverCode, deliverMail, deliverSms } from './outbox';
import { notifyTeam } from './notify';

let instance: ReturnType<typeof betterAuth> | undefined;

export function getAuth() {
  instance ??= betterAuth(
    authOptions({
      database: env.DB,
      baseURL: env.SITE_URL,
      extraOrigins:
        env.ENVIRONMENT === 'production'
          ? []
          : ['http://localhost:3750', 'http://127.0.0.1:3750', 'http://localhost:3751', 'http://127.0.0.1:3751'],
      secret: env.BETTER_AUTH_SECRET,
      google:
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
          : undefined,
      sendMail: deliverMail,
      sendSms: deliverSms,
      sendCode: deliverCode,
      onSignUp: async (u) => notifyTeam('sign_up', u.id, 'user', u.id, u.name),
    }),
  );
  return instance;
}

export const googleEnabled = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function toSessionUser(u: Record<string, unknown> | undefined | null): SessionUser | null {
  if (!u) return null;
  const role = u.role === 'admin' || u.role === 'superadmin' ? u.role : 'resident';
  return {
    id: String(u.id),
    name: String(u.name ?? ''),
    email: String(u.email ?? ''),
    emailVerified: Boolean(u.emailVerified),
    image: (u.image as string) ?? null,
    role,
    phoneNumber: (u.phoneNumber as string) ?? null,
    neighbourhood: (u.neighbourhood as string) ?? null,
    street: (u.street as string) ?? null,
    suspendedAt: u.suspendedAt ? Number(u.suspendedAt) : null,
    closedAt: u.closedAt ? Number(u.closedAt) : null,
    approvedAt: u.approvedAt ? Number(u.approvedAt) : null,
    declinedAt: u.declinedAt ? Number(u.declinedAt) : null,
  };
}

export const isTeam = (u: SessionUser | null) => u?.role === 'admin' || u?.role === 'superadmin';
export const isSuper = (u: SessionUser | null) => u?.role === 'superadmin';
/** Approved by the team (the team itself always is). */
export const isApproved = (u: SessionUser | null) => Boolean(u && (u.approvedAt || isTeam(u)));
/** Can write: signed in, email confirmed, approved by the team, not suspended, account open. */
export const canWrite = (u: SessionUser | null) =>
  Boolean(u && (u.emailVerified || isTeam(u)) && isApproved(u) && !u.suspendedAt && !u.closedAt);
