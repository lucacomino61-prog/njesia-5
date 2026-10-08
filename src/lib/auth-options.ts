// Better Auth configuration, kept free of Worker-only imports so tools/auth-sql.mjs can compile
// the schema from it in Node. src/lib/auth.ts binds it to the Worker's env.
//
// Who may write is decided by the team (approvedAt), not by SMS codes: Luca's choice on
// 2026-10-08, to keep the forum free to run. An account can be created with an email OR an
// Albanian mobile number (plus a password); no code is sent. If an SMS provider is configured
// later, the phone plugin can send codes (sendSms), but nothing depends on it.
import type { BetterAuthOptions } from 'better-auth';
import { emailOTP, phoneNumber } from 'better-auth/plugins';
import { hashPassword, verifyPassword } from './password.ts';
import { isAlbanianMobile } from './phone.ts';

export interface AuthDeps {
  database: unknown;
  baseURL: string;
  /** development: the same server reached as localhost and 127.0.0.1, dev and preview ports */
  extraOrigins?: string[];
  secret: string;
  google?: { clientId: string; clientSecret: string };
  sendMail: (to: string, kind: 'verify' | 'reset', url: string, name: string) => Promise<void>;
  sendSms: (phone: string, code: string) => Promise<void>;
  sendCode: (email: string, code: string, type: string) => Promise<void>;
  onSignUp?: (user: { id: string; name: string }) => Promise<void>;
}

export function authOptions(d: AuthDeps): BetterAuthOptions {
  return {
    appName: 'Njësia 5',
    baseURL: d.baseURL,
    secret: d.secret,
    database: d.database as BetterAuthOptions['database'],
    trustedOrigins: [d.baseURL, ...(d.extraOrigins ?? [])],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => d.sendMail(user.email, 'reset', url, user.name),
    },
    // the email is confirmed with a 6-digit code (emailOTP plugin below), sent on sign-up
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
    },
    socialProviders: d.google
      ? { google: { clientId: d.google.clientId, clientSecret: d.google.clientSecret, prompt: 'select_account' } }
      : {},
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // no cookie cache: role, suspension and approval must apply on the very next request
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'resident', input: false },
        neighbourhood: { type: 'string', required: false, input: true },
        locale: { type: 'string', required: false, input: true },
        suspendedAt: { type: 'number', required: false, input: false },
        closedAt: { type: 'number', required: false, input: false },
        approvedAt: { type: 'number', required: false, input: false },
        approvedBy: { type: 'string', required: false, input: false },
        declinedAt: { type: 'number', required: false, input: false },
        joinNote: { type: 'string', required: false, input: true },
        firstName: { type: 'string', required: false, input: true },
        lastName: { type: 'string', required: false, input: true },
        street: { type: 'string', required: false, input: true },
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 600, max: 5 },
        '/request-password-reset': { window: 600, max: 4 },
        '/sign-in/phone-number': { window: 60, max: 8 },
        '/phone-number/send-otp': { window: 600, max: 4 },
        '/email-otp/send-verification-otp': { window: 600, max: 4 },
        '/email-otp/verify-email': { window: 300, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: 'n5',
      useSecureCookies: d.baseURL.startsWith('https://'),
    },
    databaseHooks: d.onSignUp
      ? { user: { create: { after: async (user) => d.onSignUp!({ id: user.id, name: user.name }) } } }
      : undefined,
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        sendVerificationOTP: async ({ email, otp, type }) => d.sendCode(email, otp, type),
      }),
      // sign-in with phone number + password; codes only if an SMS provider is ever configured
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        requireVerification: false,
        phoneNumberValidator: (p) => isAlbanianMobile(p),
        sendOTP: async ({ phoneNumber: p, code }) => d.sendSms(p, code),
      }),
    ],
  };
}
