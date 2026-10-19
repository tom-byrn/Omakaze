import Link from "next/link";
import { blockerText, CheckRow, Note } from "@/components/settings/NotificationFields";
import { Panel } from "@/components/settings/Panel";
import { SlackPreview } from "@/components/settings/SlackPreview";
import { ActionForm } from "@/components/ui/ActionForm";
import { CopyButton } from "@/components/ui/CopyButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { decrypt } from "@/lib/crypto";
import { timeAgo } from "@/lib/format";
import { getChannel, maskUrl, previewEvents, type Channel, type ChannelKind } from "@/lib/notifications/channels";
import { emailBlockerFor, mutedWorkspaces, notificationsEnabled } from "@/lib/notifications/prefs";
import { slackMessage } from "@/lib/notifications/slack";
import { CHANNEL_EVENT_LABELS, CHANNEL_EVENTS } from "@/lib/notifications/types";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { saveChannelAction, saveWorkspaceEmailAction } from "./actions";

export const metadata = { title: "Notifications" };

function ChannelStatus({ channel, kind }: { channel: Channel | null; kind: ChannelKind }) {
  if (!channel) return <p className="text-[14px] text-body">{kind === "slack" ? "Not connected." : "No webhook."}</p>;
  return (
    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 text-[14px]">
      <dt className="mono-label pt-0.5">Posting to</dt>
      <dd className="break-all font-mono text-[12px] text-ink">{maskUrl(decrypt(channel.urlEnc))}</dd>
      <dt className="mono-label pt-0.5">Events</dt>
      <dd className="text-ink">{channel.events.length > 0 ? channel.events.map((e) => CHANNEL_EVENT_LABELS[e].label).join(", ") : "None"}</dd>
      <dt className="mono-label pt-0.5">Last message</dt>
      <dd className={channel.lastError ? "text-danger" : "text-body"}>
        {channel.lastError ? `Failed: ${channel.lastError}` : channel.lastDeliveryAt ? `Delivered ${timeAgo(channel.lastDeliveryAt)}` : "None yet"}
      </dd>
    </dl>
  );
}

function ChannelForm({ slug, kind, channel }: { slug: string; kind: ChannelKind; channel: Channel | null }) {
  const slack = kind === "slack";
  return (
    <ActionForm action={saveChannelAction.bind(null, slug, kind)} className="flex flex-col gap-5">
      <div>
        <label className="field-label" htmlFor={`${kind}-url`}>
          {slack ? "Incoming webhook URL" : "Webhook URL"}
        </label>
        <input
          id={`${kind}-url`}
          name="url"
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="input font-mono"
          placeholder={channel ? "Saved. Enter a new URL to replace it." : slack ? "https://hooks.slack.com/services/…" : "https://example.com/omakaze-webhook"}
        />
        <p className="mt-1.5 text-[12px] leading-[18px] text-muted">
          {slack ? (
            <>
              Create one in Slack under <span className="text-ui">Apps → Incoming Webhooks</span> and pick the channel. Compatible
              webhooks (Mattermost, Rocket.Chat) work too.
            </>
          ) : (
            "Omakaze POSTs a JSON body for each event. Requests are signed; see the signing secret below."
          )}
        </p>
      </div>
      <fieldset>
        <legend className="field-label">Events</legend>
        <div>
          {CHANNEL_EVENTS.map((e) => (
            <CheckRow key={e} name="events" value={e} label={CHANNEL_EVENT_LABELS[e].label} help={CHANNEL_EVENT_LABELS[e].help} defaultChecked={channel ? channel.events.includes(e) : true} />
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="save" pendingText="Saving…">
          Save
        </SubmitButton>
        <SubmitButton name="intent" value="test" className="btn btn-secondary btn-md" pendingText="Sending…">
          Send test message
        </SubmitButton>
        {channel ? (
          <SubmitButton name="intent" value="remove" className="btn btn-ghost btn-md" pendingText="Removing…">
            Remove
          </SubmitButton>
        ) : null}
      </div>
    </ActionForm>
  );
}

export default async function NotificationSettingsPage(props: PageProps<"/w/[slug]/settings/notifications">) {
  const { slug } = await props.params;
  const { workspace, role, user } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const enabled = notificationsEnabled();
  const [slack, webhook, muted, samples] = await Promise.all([
    getChannel(workspace.id, "slack"),
    getChannel(workspace.id, "webhook"),
    mutedWorkspaces(user.id),
    previewEvents(workspace, user.name),
  ]);
  const blocker = emailBlockerFor(user);
  const previews = samples.map((e) => ({ label: CHANNEL_EVENT_LABELS[e.event].label, blocks: slackMessage(e).blocks }));
  const time = new Date().toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-6">
      {!enabled ? <Note tone="warn">Notifications are turned off on this instance (NOTIFICATIONS_ENABLED=false). Nothing below is sent.</Note> : null}

      <Panel
        title="Your email"
        description={
          <>
            What you get by email is set on your{" "}
            <Link href="/account#notifications" className="link">
              account
            </Link>
            : guides ready for your review, new versions of guides you reviewed, replies and activity on your pull requests.
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {blocker ? <Note tone="warn">{blockerText(blocker, user.email)}</Note> : null}
          <ActionForm action={saveWorkspaceEmailAction.bind(null, slug)} className="flex flex-col gap-4">
            <CheckRow
              name="email"
              label={`Email me about ${workspace.name}`}
              help="Turn off to mute this workspace. Your other workspaces are not affected."
              defaultChecked={!muted.has(workspace.id)}
            />
            <div>
              <SubmitButton className="btn btn-secondary btn-sm" pendingText="Saving…">
                Save
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      </Panel>

      <Panel
        title="Slack"
        description="Post to a Slack channel when guides are published and reviews are completed, with a link to the guide. The webhook URL is encrypted at rest and not shown again."
      >
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <ChannelStatus channel={slack} kind="slack" />
            {admin ? <ChannelForm slug={slug} kind="slack" channel={slack} /> : <p className="text-[13px] text-muted">Admins can change this.</p>}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="field-label">Preview</span>
            <SlackPreview messages={previews} time={time} />
          </div>
        </div>
      </Panel>

      <Panel
        title="JSON webhook"
        description="The same events as JSON, for your own tools. Each request has an X-Omakaze-Event header and an X-Omakaze-Signature-256 header: sha256= and the HMAC-SHA256 of the body with the signing secret."
      >
        <div className="flex max-w-[620px] flex-col gap-6">
          <ChannelStatus channel={webhook} kind="webhook" />
          {admin && webhook?.secretEnc ? (
            <div>
              <span className="field-label">Signing secret</span>
              <div className="flex gap-2">
                <input readOnly value={decrypt(webhook.secretEnc)} className="input font-mono text-[12px]" aria-label="Signing secret" />
                <CopyButton text={decrypt(webhook.secretEnc)} className="btn btn-secondary btn-md shrink-0" />
              </div>
            </div>
          ) : null}
          {admin ? <ChannelForm slug={slug} kind="webhook" channel={webhook} /> : <p className="text-[13px] text-muted">Admins can change this.</p>}
          <details className="border-t border-dashed border-line pt-4">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-black/60">Example body</summary>
            <pre className="mt-3 overflow-auto bg-wash p-3 font-mono text-[11px] leading-[16px] text-alt-ink">
              {JSON.stringify(
                {
                  event: "new_version",
                  id: "guide:…",
                  sent_at: "2026-10-19T09:30:00.000Z",
                  workspace: { name: workspace.name, slug: workspace.slug, url: "…" },
                  repository: samples[0].repository,
                  pull_request: samples[0].pullRequest,
                  guide: { version: 2, title: samples[0].guide?.title, url: "…", sections: samples[0].guide?.sections, author: null, changed_sections: samples[1].guide?.changed, new_sections: 1 },
                  actor: user.name,
                  review: null,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      </Panel>
    </div>
  );
}
