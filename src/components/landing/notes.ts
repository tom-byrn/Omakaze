/**
 * Japanese side notes on the landing page, written as lines from an omakase meal.
 * The landing font (src/app/fonts/shippori-mincho-landing.woff2) contains only these characters;
 * run `node scripts/subset-landing-font.mjs <ShipporiMincho-Regular.ttf>` after changing them.
 */
export const NOTES = {
  hero: { ja: "おまかせでお願いします", romaji: "Omakase de onegai shimasu", en: "I'll leave it to you, chef." },
  heroAside: { ja: "一品ずつ、順番に", romaji: "Ippin zutsu, junban ni", en: "One dish at a time, in order." },
  why: { ja: "読む順に", romaji: "Yomu jun ni", en: "In reading order." },
  steps: { ja: "仕込みから盛り付けまで", romaji: "Shikomi kara moritsuke made", en: "From prep to plating." },
  features: { ja: "お品書き", romaji: "Oshinagaki", en: "The menu." },
  agents: { ja: "板前におまかせ", romaji: "Itamae ni omakase", en: "Leave it to the chef." },
  selfHost: { ja: "自分の厨房で", romaji: "Jibun no chūbō de", en: "In your own kitchen." },
  next: { ja: "次の一品へ", romaji: "Tsugi no ippin e", en: "On to the next dish." },
  footer: { ja: "ごちそうさまでした", romaji: "Gochisōsama deshita", en: "Thank you for the meal." },
} as const;

export type NoteName = keyof typeof NOTES;
