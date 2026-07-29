export const TEAM_COLORS: Record<string, string> = {
  Mercedes: "#27F4D2",
  Ferrari: "#E8002D",
  McLaren: "#FF8000",
  "Red Bull": "#3671C6",
  "Aston Martin": "#229971",
  "Alpine F1 Team": "#FF87BC",
  "RB F1 Team": "#6C98FF",
  Williams: "#64C4FF",
  "Haas F1 Team": "#B6BABD",
  Audi: "#B10000",
  Cadillac: "#D4AF37",
  Renault: "#FFF200",
  "Force India": "#F596C8",
  "Racing Point": "#F596C8",
  Sauber: "#9B0000",
  "Alfa Romeo": "#9B0000",
  "Toro Rosso": "#469BFF",
  AlphaTauri: "#5E8FAA",
  "Lotus F1": "#FFB800",
  "Manor Marussia": "#6E0000",
};

export function teamColor(name: string): string {
  return TEAM_COLORS[name] || "#9aa4b2";
}

/** Auto-derived 3-letter driver code from surname (last word of the full name).
 *  Cosmetic convenience only — not guaranteed to match the driver's official FIA code. */
export function driverCode(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const surname = parts[parts.length - 1];
  return surname.slice(0, 3).toUpperCase();
}
