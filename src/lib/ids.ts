import { randomBytes } from "node:crypto";

/** Random URL-safe identifier (96 bits). */
export function newId(): string {
  return randomBytes(12).toString("base64url");
}

/** Random secret token with a readable prefix, e.g. `omk_…`. */
export function newToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}
