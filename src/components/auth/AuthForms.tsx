"use client";

import { RiGithubFill, RiKey2Line } from "@remixicon/react";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, tokenLoginAction, type AuthState } from "@/app/(auth)/actions";
import type { AuthMethods } from "@/lib/auth/methods";
import { SubmitButton } from "@/components/ui/SubmitButton";

function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="border border-dashed border-danger/40 bg-danger/[0.04] px-3 py-2 text-[13px] text-danger">
      {message}
    </p>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1" aria-hidden="true">
      <span className="h-px flex-1 border-t border-dashed border-line" />
      <span className="mono-label">{label}</span>
      <span className="h-px flex-1 border-t border-dashed border-line" />
    </div>
  );
}

export function AuthForms({
  mode,
  methods,
  next,
  invite,
  initialError,
}: {
  mode: "login" | "signup";
  methods: AuthMethods;
  next?: string;
  invite?: string;
  initialError?: string;
}) {
  const [loginState, login] = useActionState<AuthState, FormData>(loginAction, undefined);
  const [signupState, signup] = useActionState<AuthState, FormData>(signupAction, undefined);
  const [tokenState, tokenLogin] = useActionState<AuthState, FormData>(tokenLoginAction, undefined);

  const githubHref = `/api/auth/github?${new URLSearchParams({
    ...(next ? { next } : {}),
    ...(invite ? { invite } : {}),
  }).toString()}`;
  const switchHref = (target: string) =>
    `${target}?${new URLSearchParams({ ...(next ? { next } : {}), ...(invite ? { invite } : {}) }).toString()}`;

  const hidden = (
    <>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
    </>
  );

  const nothing = !methods.github && !methods.email && !methods.token;

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={initialError} />
      {nothing ? (
        <ErrorNote message="No sign-in method is enabled. Set AUTH_EMAIL_ENABLED, AUTH_GITHUB_TOKEN_ENABLED or configure a GitHub App." />
      ) : null}

      {methods.github ? (
        <a href={githubHref} className="btn btn-primary btn-lg w-full">
          <RiGithubFill size={18} />
          Continue with GitHub
        </a>
      ) : null}

      {methods.email ? (
        <>
          {methods.github ? <Divider label="or with email" /> : null}
          {mode === "login" ? (
            <form action={login} className="flex flex-col gap-3">
              {hidden}
              <div>
                <label className="field-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="input"
                  defaultValue={loginState?.fields?.email}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
              </div>
              <ErrorNote message={loginState?.error} />
              <SubmitButton className="btn btn-secondary btn-md w-full" pendingText="Signing in…">
                Sign in
              </SubmitButton>
              {methods.signup || invite ? (
                <p className="text-[13px] text-body">
                  No account?{" "}
                  <Link href={switchHref("/signup")} className="link">
                    Create one
                  </Link>
                </p>
              ) : null}
            </form>
          ) : (
            <form action={signup} className="flex flex-col gap-3">
              {hidden}
              <div>
                <label className="field-label" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  className="input"
                  defaultValue={signupState?.fields?.name}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="input"
                  defaultValue={signupState?.fields?.email}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="input"
                />
              </div>
              <ErrorNote message={signupState?.error} />
              <SubmitButton className="btn btn-secondary btn-md w-full" pendingText="Creating account…">
                Create account
              </SubmitButton>
              <p className="text-[13px] text-body">
                Have an account?{" "}
                <Link href={switchHref("/login")} className="link">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </>
      ) : null}

      {methods.token ? (
        <details className="group border border-dashed border-line bg-white/60" open={!methods.github && !methods.email}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] text-ui hover:text-ink">
            <RiKey2Line size={15} />
            Sign in with a GitHub token
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-black/40 group-open:hidden">
              Show
            </span>
          </summary>
          <form action={tokenLogin} className="flex flex-col gap-3 border-t border-dashed border-line p-3">
            {hidden}
            <div>
              <label className="field-label" htmlFor="token">
                Personal access token
              </label>
              <input
                id="token"
                name="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="ghp_… or github_pat_…"
                className="input font-mono"
                required
              />
            </div>
            <p className="text-[12px] leading-[18px] text-body">
              Classic tokens need the <code className="font-mono">repo</code> scope. Fine-grained tokens need Contents
              (read) and Pull requests (read and write). The token is encrypted at rest.
            </p>
            <ErrorNote message={tokenState?.error} />
            <SubmitButton className="btn btn-secondary btn-md w-full" pendingText="Verifying with GitHub…">
              Sign in with token
            </SubmitButton>
          </form>
        </details>
      ) : null}
    </div>
  );
}
