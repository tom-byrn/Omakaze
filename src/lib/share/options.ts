/** Choices for new share links, used by the form in the browser and checked on the server. */

/** Expiry: days, or never. */
export const SHARE_EXPIRY_VALUES = ["1", "7", "30", "never"] as const;
export type ShareExpiry = (typeof SHARE_EXPIRY_VALUES)[number];
export const SHARE_EXPIRY_LABELS: Record<ShareExpiry, string> = { "1": "1 day", "7": "7 days", "30": "30 days", never: "Never" };
