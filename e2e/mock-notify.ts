/**
 * Stand-ins for the outside services notifications go to: an SMTP server that keeps every email
 * it receives, and an HTTP server that receives Slack and JSON webhooks.
 *
 * The e2e global setup starts both (SMTP on E2E_SMTP_PORT, default E2E_PORT + 400; HTTP on
 * E2E_NOTIFY_PORT, default E2E_PORT + 300) and the app under test gets SMTP_URL pointing at the
 * SMTP server. Run them on their own with `pnpm exec tsx e2e/mock-notify.ts`.
 *
 * - Any POST outside /__mock/ is a webhook delivery: recorded, and answered with 200 "ok" (or what
 *   `mockNotify.failHooks()` asks for). Use `${mockNotify.url}/slack/T000/B000/XXXX` as a Slack URL.
 * - GET /__mock/mail lists received emails, parsed (headers, text, html); /__mock/mail/<id> shows
 *   one in the browser, /__mock/mail/<id>.html is its HTML part alone.
 * - Specs use `mockNotify` below.
 */
import http from "node:http";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { E2E } from "./config";

export type CapturedMail = {
  id: number;
  at: string;
  /** Envelope sender and recipients (MAIL FROM, RCPT TO). */
  from: string;
  to: string[];
  subject: string;
  /** Header names in lower case; encoded words in values are decoded. */
  headers: Record<string, string>;
  text: string | null;
  html: string | null;
};

export type CapturedHook = { id: number; at: string; path: string; headers: Record<string, string>; body: unknown; status: number };

/* MIME ---------------------------------------------------------------- */

function decodeQuotedPrintable(s: string): string {
  const soft = s.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    const hex = soft[i] === "=" ? soft.slice(i + 1, i + 3) : "";
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(soft[i], "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/** RFC 2047 encoded words (=?utf-8?Q?…?= and =?utf-8?B?…?=), as nodemailer writes long or non-ASCII subjects. */
function decodeWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, _charset: string, enc: string, text: string) =>
      enc.toUpperCase() === "B" ? Buffer.from(text, "base64").toString("utf8") : decodeQuotedPrintable(text.replace(/_/g, " ")),
    );
}

function splitHeaders(raw: string): { headers: Record<string, string>; body: string } {
  const at = raw.indexOf("\r\n\r\n");
  const head = at < 0 ? raw : raw.slice(0, at);
  const body = at < 0 ? "" : raw.slice(at + 4);
  const headers: Record<string, string> = {};
  let last = "";
  for (const line of head.split("\r\n")) {
    if (/^[ \t]/.test(line) && last) headers[last] += ` ${line.trim()}`;
    else {
      const i = line.indexOf(":");
      if (i <= 0) continue;
      last = line.slice(0, i).trim().toLowerCase();
      headers[last] = line.slice(i + 1).trim();
    }
  }
  for (const k of Object.keys(headers)) headers[k] = decodeWords(headers[k]).trim();
  return { headers, body };
}

function decodeBody(body: string, encoding: string | undefined): string {
  const e = (encoding ?? "7bit").toLowerCase();
  if (e === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (e === "quoted-printable") return decodeQuotedPrintable(body);
  return body;
}

/** The text and HTML parts of a message (multipart/alternative and multipart/mixed, nested). */
function parseParts(raw: string): { headers: Record<string, string>; text: string | null; html: string | null } {
  const { headers, body } = splitHeaders(raw);
  const type = headers["content-type"] ?? "text/plain";
  const out = { headers, text: null as string | null, html: null as string | null };
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (/^multipart\//i.test(type) && boundary) {
    const chunks = body.split(`--${boundary}`).slice(1);
    for (const chunk of chunks) {
      if (chunk.startsWith("--")) break;
      const part = parseParts(chunk.replace(/^\r\n/, "").replace(/\r\n$/, ""));
      out.text ??= part.text;
      out.html ??= part.html;
    }
    return out;
  }
  const decoded = decodeBody(body, headers["content-transfer-encoding"]).replace(/\r\n/g, "\n");
  if (/^text\/html/i.test(type)) out.html = decoded;
  else out.text = decoded;
  return out;
}

/* SMTP ---------------------------------------------------------------- */

const address = (line: string) => /<([^>]*)>/.exec(line)?.[1] ?? line.split(":").slice(1).join(":").trim();

function smtpServer(onMessage: (m: { from: string; to: string[]; raw: string }) => void): net.Server {
  return net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let from = "";
    let to: string[] = [];
    const reply = (s: string) => socket.write(`${s}\r\n`);
    reply("220 mock-smtp ESMTP ready");
    socket.on("error", () => {});
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          // The message ends with a line holding a single dot.
          const probe = `\r\n${buffer}`;
          const end = probe.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const data = buffer.slice(0, end).replace(/^\.\./gm, ".");
          buffer = buffer.slice(end + 3);
          inData = false;
          onMessage({ from, to, raw: data });
          reply("250 OK: queued");
          continue;
        }
        const nl = buffer.indexOf("\r\n");
        if (nl < 0) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO")) socket.write("250-mock-smtp\r\n250-8BITMIME\r\n250-SMTPUTF8\r\n250 SIZE 26214400\r\n");
        else if (upper.startsWith("HELO")) reply("250 mock-smtp");
        else if (upper.startsWith("MAIL FROM:")) {
          from = address(line);
          to = [];
          reply("250 OK");
        } else if (upper.startsWith("RCPT TO:")) {
          to.push(address(line));
          reply("250 OK");
        } else if (upper === "DATA") {
          inData = true;
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (upper === "RSET" || upper === "NOOP") reply("250 OK");
        else if (upper === "QUIT") {
          reply("221 Bye");
          socket.end();
          return;
        } else reply("502 Command not implemented");
      }
    });
  });
}

/* HTTP ---------------------------------------------------------------- */

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A plain mailbox view: the envelope and headers above the HTML part, as a mail client shows it. */
function viewer(m: CapturedMail): string {
  const row = (k: string, v: string) => `<tr><th>${k}</th><td>${escape(v)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(m.subject)}</title>
<style>
  body { margin: 0; background: #e9e9ec; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #222; }
  .bar { background: #3a3d44; color: #fff; padding: 8px 16px; font-size: 12px; letter-spacing: 0.02em; }
  .head { background: #fff; border-bottom: 1px solid #ccc; padding: 14px 20px; }
  h1 { font-size: 18px; margin: 0 0 8px; font-weight: 600; }
  table { border-collapse: collapse; }
  th { text-align: left; color: #777; font-weight: 400; padding: 1px 12px 1px 0; vertical-align: top; }
  iframe { display: block; width: 100%; border: 0; background: #fff; }
</style></head><body>
<div class="bar">Test mailbox (e2e) · message ${m.id}</div>
<div class="head"><h1>${escape(m.subject)}</h1><table>
${row("From", m.headers.from ?? m.from)}${row("To", m.to.join(", "))}${row("Date", m.headers.date ?? m.at)}
${m.headers["list-unsubscribe"] ? row("List-Unsubscribe", m.headers["list-unsubscribe"]) : ""}
</table></div>
<iframe id="body" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" srcdoc="${escape(m.html ?? `<pre>${escape(m.text ?? "")}</pre>`)}"></iframe>
<script>
  const f = document.getElementById("body");
  const fit = () => { try { f.style.height = f.contentDocument.documentElement.scrollHeight + "px"; } catch {} };
  f.addEventListener("load", () => { fit(); setTimeout(fit, 200); });
  addEventListener("resize", fit);
</script>
</body></html>`;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export type MockNotifyServer = { url: string; close: () => Promise<void> };

/** Start the SMTP server and the webhook receiver. */
export async function startMockNotify(opts: { smtpPort?: number; httpPort?: number; quiet?: boolean } = {}): Promise<MockNotifyServer> {
  const smtpPort = opts.smtpPort ?? E2E.smtpPort;
  const httpPort = opts.httpPort ?? E2E.notifyPort;
  let mail: CapturedMail[] = [];
  let hooks: CapturedHook[] = [];
  let failures: { status: number; times: number }[] = [];
  let seq = 0;

  const smtp = smtpServer(({ from, to, raw }) => {
    const parsed = parseParts(raw);
    mail.push({ id: ++seq, at: new Date().toISOString(), from, to, subject: parsed.headers.subject ?? "", headers: parsed.headers, text: parsed.text, html: parsed.html });
    if (mail.length > 500) mail.splice(0, mail.length - 500);
  });

  const send = (res: http.ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${httpPort}`);
    const method = req.method ?? "GET";
    const body = await readBody(req);
    if (url.pathname.startsWith("/__mock/")) {
      const route = url.pathname.slice("/__mock".length);
      if (route === "/health") return send(res, 200, { ok: true });
      if (route === "/mail" && method === "GET") return send(res, 200, { mail });
      if (route === "/mail" && method === "DELETE") {
        mail = [];
        return send(res, 200, { ok: true });
      }
      const one = /^\/mail\/(\d+)(\.html|\.txt)?$/.exec(route);
      if (one) {
        const m = mail.find((x) => x.id === Number(one[1]));
        if (!m) return send(res, 404, { message: "No such message" });
        if (one[2] === ".html") return send(res, 200, m.html ?? "", "text/html; charset=utf-8");
        if (one[2] === ".txt") return send(res, 200, m.text ?? "", "text/plain; charset=utf-8");
        return send(res, 200, viewer(m), "text/html; charset=utf-8");
      }
      if (route === "/hooks" && method === "GET") return send(res, 200, { hooks });
      if (route === "/hooks" && method === "DELETE") {
        hooks = [];
        return send(res, 200, { ok: true });
      }
      if (route === "/hooks/fail" && method === "POST") {
        const b = JSON.parse(body || "{}") as { status?: number; times?: number };
        failures.push({ status: b.status ?? 500, times: b.times ?? 1 });
        return send(res, 200, { ok: true });
      }
      if (route === "/reset" && method === "POST") {
        mail = [];
        hooks = [];
        failures = [];
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { message: `No mock control route ${method} ${url.pathname}` });
    }
    if (method !== "POST") return send(res, 404, { message: "Webhooks are POST requests" });
    let parsed: unknown = body;
    try {
      parsed = JSON.parse(body);
    } catch {
      // keep the text
    }
    const fail = failures[0];
    const status = fail ? fail.status : 200;
    if (fail && --fail.times <= 0) failures.shift();
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : (v ?? "")]));
    hooks.push({ id: ++seq, at: new Date().toISOString(), path: url.pathname, headers, body: parsed, status });
    if (!opts.quiet) console.log(`[mock-notify] webhook ${url.pathname} → ${status}`);
    // Slack answers "ok", or a short error code such as no_service.
    send(res, status, status === 200 ? "ok" : "no_service", "text/plain; charset=utf-8");
  });

  await Promise.all([
    new Promise<void>((resolve, reject) => {
      smtp.once("error", reject);
      smtp.listen(smtpPort, "127.0.0.1", () => resolve());
    }),
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(httpPort, "127.0.0.1", () => resolve());
    }),
  ]);
  return {
    url: `http://127.0.0.1:${httpPort}`,
    close: async () => {
      await Promise.all([new Promise<void>((r) => smtp.close(() => r())), new Promise<void>((r) => server.close(() => r()))]);
    },
  };
}

/* Client for specs ----------------------------------------------------- */

const base = `http://127.0.0.1:${E2E.notifyPort}`;

async function control<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}/__mock${route}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`mock notify ${method} ${route}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const mockNotify = {
  url: base,
  /** A Slack incoming webhook URL that this server receives. */
  slackUrl: `${base}/slack/T0E2E0000/B0E2E0000/e2eSlackWebhookSecret`,
  /** Received emails, oldest first; `to` filters by recipient address. */
  async mail(filter: { to?: string } = {}): Promise<CapturedMail[]> {
    const { mail } = await control<{ mail: CapturedMail[] }>("GET", "/mail");
    return filter.to ? mail.filter((m) => m.to.includes(filter.to!)) : mail;
  },
  /** The browser view of one email. */
  mailUrl: (id: number) => `${base}/__mock/mail/${id}`,
  clearMail: () => control<{ ok: true }>("DELETE", "/mail"),
  /** Received webhook deliveries, oldest first. */
  async hooks(filter: { path?: string | RegExp } = {}): Promise<CapturedHook[]> {
    const { hooks } = await control<{ hooks: CapturedHook[] }>("GET", "/hooks");
    return hooks.filter((h) => !filter.path || (typeof filter.path === "string" ? h.path === filter.path : filter.path.test(h.path)));
  },
  clearHooks: () => control<{ ok: true }>("DELETE", "/hooks"),
  /** Answer the next `times` webhook deliveries with `status`. */
  failHooks: (status = 500, times = 1) => control<{ ok: true }>("POST", "/hooks/fail", { status, times }),
  reset: () => control<{ ok: true }>("POST", "/reset"),
  async isRunning(): Promise<boolean> {
    try {
      return (await fetch(`${base}/__mock/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      return false;
    }
  },
};

/* Run on its own: pnpm exec tsx e2e/mock-notify.ts */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startMockNotify();
  console.log(`Fake SMTP on 127.0.0.1:${E2E.smtpPort}, webhook receiver on ${server.url} (mail: ${server.url}/__mock/mail)`);
}
