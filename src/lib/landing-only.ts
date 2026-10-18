/**
 * LANDING_ONLY=true serves only the landing page, without a database, sign-in or worker. Used for a
 * marketing deploy (for example on Vercel); every other page redirects to / (see next.config.ts).
 */
export const landingOnly = ["1", "true", "yes", "on"].includes((process.env.LANDING_ONLY ?? "").toLowerCase());
