"use client";

import { useActionState, useState } from "react";
import { FormMessage, type FormState } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CHANNEL_EVENT_LABELS, CHANNEL_EVENTS, type ChannelEvent } from "@/lib/notifications/types";

/**
 * Settings of a Slack or JSON webhook. The fields are controlled, so "Send test message" keeps
 * what was typed (a form action would otherwise reset them); a saved URL clears the field.
 */
export function ChannelForm({
  kind,
  action,
  saved,
}: {
  kind: "slack" | "webhook";
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  /** The saved events, or null when nothing is saved yet. */
  saved: ChannelEvent[] | null;
}) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<ChannelEvent[]>(saved ?? CHANNEL_EVENTS);
  const [state, formAction] = useActionState(async (prev: FormState, form: FormData) => {
    const res = await action(prev, form);
    if (res?.ok && form.get("intent") !== "test") setUrl("");
    return res;
  }, undefined);
  const slack = kind === "slack";

  return (
    <form action={formAction} className="flex flex-col gap-5">
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
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={saved ? "Saved. Enter a new URL to replace it." : slack ? "https://hooks.slack.com/services/…" : "https://example.com/omakaze-webhook"}
        />
        <p className="mt-1.5 text-[12px] leading-[18px] text-muted">
          {slack ? (
            <>
              Create one in Slack under <span className="text-ui">Apps → Incoming Webhooks</span> and pick the channel.
              Slack-compatible webhooks (Mattermost, Rocket.Chat) work too.
            </>
          ) : (
            "Omakaze sends a POST request with a JSON body for each event."
          )}
        </p>
      </div>
      <fieldset>
        <legend className="field-label">Events</legend>
        <div>
          {CHANNEL_EVENTS.map((e) => (
            <label key={e} className="flex cursor-pointer items-start gap-3 border-t border-dashed border-line py-3.5 first:border-t-0">
              <input
                type="checkbox"
                name="events"
                value={e}
                checked={events.includes(e)}
                onChange={(ev) => setEvents((list) => (ev.target.checked ? [...list, e] : list.filter((x) => x !== e)))}
                className="mt-1 h-4 w-4 shrink-0 accent-[#141518]"
              />
              <span className="min-w-0">
                <span className="block text-[14px] text-ink">{CHANNEL_EVENT_LABELS[e].label}</span>
                <span className="block text-[13px] leading-[20px] text-body">{CHANNEL_EVENT_LABELS[e].help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="save" pendingText="Saving…">
          Save
        </SubmitButton>
        <SubmitButton name="intent" value="test" className="btn btn-secondary btn-md" pendingText="Sending…">
          Send test message
        </SubmitButton>
        {saved ? (
          <SubmitButton name="intent" value="remove" className="btn btn-ghost btn-md" pendingText="Removing…">
            Remove
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
