import { RiGithubFill } from "@remixicon/react";
import { AppHeader } from "@/components/app/AppHeader";
import { ChatgptPlanPanel } from "@/components/settings/ChatgptPlanPanel";
import { Panel } from "@/components/settings/Panel";
import { ActionForm } from "@/components/ui/ActionForm";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CHATGPT_REDIRECT_URI, chatgptPlansEnabled, getChatgptConnection, grantsPlanUsage } from "@/lib/ai/chatgpt";
import { CHATGPT_PLAN_HELP_URL } from "@/lib/ai/chatgpt-links";
import { getAuthMethods } from "@/lib/auth/methods";
import { currentSessionId, listSessions, requireUser } from "@/lib/auth/session";
import { getGitHubAccount } from "@/lib/auth/users";
import { timeAgo } from "@/lib/format";
import { listUserWorkspaces } from "@/lib/workspaces";
import {
  changePasswordAction,
  deleteAccountAction,
  finishChatgptSignInAction,
  linkGitHubTokenAction,
  listChatgptModelsAction,
  revokeSessionAction,
  saveChatgptPrefsAction,
  signOutChatgptAction,
  startChatgptSignInAction,
  unlinkGitHubAction,
  updateProfileAction,
} from "./actions";

export const metadata = { title: "Account" };

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Firefox\//.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" on ");
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const chatgptOn = chatgptPlansEnabled();
  const [list, account, methods, sessions, sid, chatgpt] = await Promise.all([
    listUserWorkspaces(user.id),
    getGitHubAccount(user.id),
    getAuthMethods(),
    listSessions(user.id),
    currentSessionId(),
    chatgptOn ? getChatgptConnection(user.id) : null,
  ]);
  const chatgptWorkspaces = list.filter((w) => w.workspace.allowChatgptPlans).map((w) => w.workspace.name);
  const current = list.find((w) => w.workspace.id === user.lastWorkspaceId) ?? list[0];
  return (
    <div className="min-h-screen">
      <AppHeader
        user={user}
        current={current ? { slug: current.workspace.slug, name: current.workspace.name } : null}
        workspaces={list.map((w) => ({ slug: w.workspace.slug, name: w.workspace.name }))}
      />
      <main className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-10 lg:px-8">
        <div>
          <span className="eyebrow">Account</span>
          <h1 className="h2 mt-6">Your account.</h1>
        </div>
        <Panel title="Profile">
          <ActionForm action={updateProfileAction} className="flex max-w-[480px] flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar src={user.avatarUrl} name={user.name} size={44} />
              <p className="text-[13px] text-muted">{account ? "Avatar from GitHub." : "Link GitHub to use its avatar."}</p>
            </div>
            <div>
              <label className="field-label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" defaultValue={user.name} className="input" required />
            </div>
            <div>
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" defaultValue={user.email ?? ""} className="input" />
            </div>
            <div>
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </div>
          </ActionForm>
        </Panel>

        <Panel
          title="GitHub"
          description="Comments and reviews you post from Omakaze use this account. Without it they are posted through the workspace connection with your name attached."
        >
          {account ? (
            <div className="flex flex-wrap items-center gap-3">
              <Avatar src={account.avatarUrl} name={account.login} size={32} />
              <div className="flex-1">
                <p className="text-[14px] text-ink">@{account.login}</p>
                <p className="font-mono text-[11px] text-meta">
                  {account.tokenType === "oauth" ? "Signed in with GitHub" : "Personal access token"} · linked {timeAgo(account.createdAt)}
                </p>
              </div>
              <ConfirmButton action={unlinkGitHubAction} confirm="Unlink your GitHub account?">
                Unlink
              </ConfirmButton>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {methods.github ? (
                <a href="/api/auth/github?link=1&next=/account" className="btn btn-primary btn-md self-start">
                  <RiGithubFill size={16} /> Link GitHub account
                </a>
              ) : null}
              <ActionForm action={linkGitHubTokenAction} className="flex max-w-[480px] flex-col gap-3">
                <label className="field-label" htmlFor="gh-token">
                  Or link with a personal access token
                </label>
                <input id="gh-token" name="token" type="password" autoComplete="off" className="input font-mono" placeholder="github_pat_…" />
                <div>
                  <SubmitButton className="btn btn-secondary btn-md" pendingText="Verifying…">
                    Link with token
                  </SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}
        </Panel>

        {chatgptOn ? (
          <Panel
            title="ChatGPT plan"
            description={
              <>
                Generate guides with your own ChatGPT Plus or Pro plan instead of the workspace&apos;s provider. Requests count
                toward your plan&apos;s usage limits, which are shared with the other apps where you use it; Omakaze does not
                charge for them. Only guides you start use your plan, and their diffs are sent to OpenAI under your account.{" "}
                <a href={CHATGPT_PLAN_HELP_URL} target="_blank" rel="noreferrer" className="link">
                  Learn more
                </a>
              </>
            }
          >
            <div id="chatgpt" className="flex flex-col gap-4">
              <ChatgptPlanPanel
                connection={
                  chatgpt
                    ? {
                        signedIn: Boolean(chatgpt.refreshTokenEnc),
                        email: chatgpt.email,
                        planUsage: grantsPlanUsage(chatgpt.scopes),
                        model: chatgpt.model,
                        enabled: chatgpt.enabled,
                      }
                    : null
                }
                redirectUri={CHATGPT_REDIRECT_URI}
                start={startChatgptSignInAction}
                finish={finishChatgptSignInAction}
                signOut={signOutChatgptAction}
                savePrefs={saveChatgptPrefsAction}
                listModels={listChatgptModelsAction}
              />
              <p className="text-[12px] text-muted">
                {chatgptWorkspaces.length > 0
                  ? `Allowed in ${chatgptWorkspaces.join(", ")}.`
                  : "None of your workspaces allow ChatGPT plans yet. A workspace admin can turn them on in Settings → AI provider."}{" "}
                Elsewhere, and for automated guides, the workspace provider is used.
              </p>
            </div>
          </Panel>
        ) : null}

        {methods.email ? (
          <Panel title={user.passwordHash ? "Change password" : "Set a password"} description="Lets you sign in with your email address.">
            <ActionForm action={changePasswordAction} resetOnSuccess className="flex max-w-[480px] flex-col gap-4">
              {user.passwordHash ? (
                <div>
                  <label className="field-label" htmlFor="current">
                    Current password
                  </label>
                  <input id="current" name="current" type="password" autoComplete="current-password" className="input" />
                </div>
              ) : null}
              <div>
                <label className="field-label" htmlFor="password">
                  New password
                </label>
                <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} className="input" />
              </div>
              <div>
                <SubmitButton pendingText="Saving…">Save password</SubmitButton>
              </div>
            </ActionForm>
          </Panel>
        ) : null}

        <Panel title="Sessions" description="Devices currently signed in.">
          <ul className="-my-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-t border-dashed border-line py-3 first:border-t-0">
                <div className="flex-1">
                  <p className="text-[14px] text-ink">
                    {describeAgent(s.userAgent)} {s.id === sid ? <span className="tag ml-1">This device</span> : null}
                  </p>
                  <p className="font-mono text-[11px] text-meta">
                    {s.ipAddress ?? "unknown IP"} · signed in {timeAgo(s.createdAt)} · active {timeAgo(s.lastSeenAt)}
                  </p>
                </div>
                {s.id !== sid ? (
                  <ConfirmButton action={revokeSessionAction.bind(null, s.id)}>Sign out</ConfirmButton>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel tone="danger" title="Delete account" description="Removes your user, memberships and tokens. Workspaces you solely own are deleted.">
          <ActionForm action={deleteAccountAction} className="flex max-w-[480px] flex-col gap-3">
            <label className="field-label" htmlFor="confirm">
              Type &quot;delete my account&quot;
            </label>
            <input id="confirm" name="confirm" className="input" autoComplete="off" />
            <div>
              <SubmitButton className="btn btn-danger btn-sm" pendingText="Deleting…">
                Delete account
              </SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      </main>
    </div>
  );
}
