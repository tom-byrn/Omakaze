/**
 * github-light token colors (the diff highlighter's theme) and their github-dark counterparts, so a
 * diff tokenized once can be shown in either theme. Colors are uppercase, as Palette stores them.
 */
const DARK_TOKEN_COLORS: Record<string, string> = {
  "#24292E": "#E1E4E8",
  "#6A737D": "#6A737D",
  "#005CC5": "#79B8FF",
  "#6F42C1": "#B392F0",
  "#22863A": "#85E89D",
  "#D73A49": "#F97583",
  "#032F62": "#9ECBFF",
  "#E36209": "#FFAB70",
  "#B31D28": "#FDAEB7",
  "#586069": "#D1D5DA",
};

export function darkTokenColor(color: string): string {
  return DARK_TOKEN_COLORS[color.toUpperCase()] ?? color;
}
