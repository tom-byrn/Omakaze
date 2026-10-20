import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/** Address ranges a server-side download must never reach: loopback, private, link-local, reserved. */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** IPv4 address carried in an IPv4-mapped (::ffff:0:0/96) or NAT64 (64:ff9b::/96) IPv6 address. */
function embeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = /^(?:::ffff:|::ffff:0:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^(?:::ffff:|::ffff:0:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

/** True for addresses on the public internet. */
export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) {
    const v4 = embeddedIpv4(ip);
    if (v4) return isPublicAddress(v4);
    return !blocked.check(ip, "ipv6");
  }
  return false;
}

export class RemoteFetchError extends Error {}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * DNS lookup for outgoing sockets that refuses private addresses. Because the socket connects to
 * the address checked here, a name can't resolve to a public address for a check and a private
 * one for the connection.
 */
export function publicLookup(hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback) {
  dnsLookup(hostname, { family: options.family ?? 0, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new RemoteFetchError(`${hostname} resolves to a private network address`), []);
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

export type RemoteFile = { data: Buffer; contentType: string | null; url: URL };

/**
 * Download a public http(s) URL with a size limit. Every hop of a redirect is checked again, and
 * IP literals and DNS answers in private ranges are refused, unless `allowPrivate` is set.
 */
export function fetchPublicUrl(
  url: URL,
  opts: { maxBytes: number; timeoutMs?: number; redirects?: number; allowPrivate?: boolean },
): Promise<RemoteFile> {
  const redirects = opts.redirects ?? 3;
  return new Promise((resolve, reject) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") return reject(new RemoteFetchError("Only http(s) URLs are supported"));
    if (url.username || url.password) return reject(new RemoteFetchError("URLs with credentials are not supported"));
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!opts.allowPrivate && isIP(host) && !isPublicAddress(host)) return reject(new RemoteFetchError("Private network addresses are not allowed"));

    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        ...(opts.allowPrivate ? {} : { lookup: publicLookup as never }),
        timeout: opts.timeoutMs ?? 30_000,
        headers: { "user-agent": "Omakaze", accept: "image/*,video/*,application/pdf;q=0.9,*/*;q=0.5" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects <= 0) return reject(new RemoteFetchError("Too many redirects"));
          let next: URL;
          try {
            next = new URL(res.headers.location, url);
          } catch {
            return reject(new RemoteFetchError("Invalid redirect"));
          }
          return fetchPublicUrl(next, { ...opts, redirects: redirects - 1 }).then(resolve, reject);
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new RemoteFetchError(`Download failed (${status})`));
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          return reject(new RemoteFetchError("The file is too large"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            res.destroy();
            reject(new RemoteFetchError("The file is too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({ data: Buffer.concat(chunks), contentType: res.headers["content-type"]?.split(";")[0].trim() ?? null, url }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new RemoteFetchError("Download timed out")));
    req.on("error", (err) => reject(err instanceof RemoteFetchError ? err : new RemoteFetchError(`Download failed: ${err.message}`)));
  });
}
