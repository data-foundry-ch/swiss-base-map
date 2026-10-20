/** Cartographic constants for the Swiss reference layers. */

export const HILLSHADE_LAYER_OPACITY = 0.32;

export const LAKE_FILL_COLOR = "#9EBFD4";
export const LAKE_FILL_OPACITY = 0.72;
export const LAKE_OUTLINE_COLOR = "#6E92A8";
export const LAKE_OUTLINE_WIDTH = 0.7;
export const LAKE_OUTLINE_OPACITY = 0.55;

export const RIVER_COLOR = "#6E92A8";
export const RIVER_OPACITY = 0.7;

export const REF_BOUNDARY_COLOR = "#3D2E24";
export const REF_BOUNDARY_WIDTH = 1.15;
export const REF_BOUNDARY_OPACITY = 0.78;

export const SWISS_THEMATIC_MIN_ZOOM = 5;

export const SETTLEMENT_LABEL_COLOR = "#2A2520";
export const SETTLEMENT_LABEL_HALO = "rgba(255, 252, 248, 0.88)";
export const SETTLEMENT_LABEL_SIZE = {
  major: 14,
  secondary: 12,
  town: 11,
  small: 10,
  village: 9,
} as const;

/** Progressive reveal — all ranks visible by max map zoom (12). */
export const SETTLEMENT_RANK_MINZOOM = {
  major: 5,
  rank1: 8,
  rank2: 9,
  rank3: 10,
  rank4: 11,
  rank5: 11,
} as const;

/** Major cities shown at national extent. */
export const NATIONAL_SETTLEMENT_NAMES = [
  "Zürich",
  "Genève",
  "Basel",
  "Bern",
  "Lausanne",
  "Luzern",
  "St. Gallen",
  "Lugano",
  "Biel/Bienne",
  "Thun",
  "Köniz",
  "La Chaux-de-Fonds",
  "Fribourg",
  "Schaffhausen",
  "Chur",
  "Neuchâtel",
  "Vernier",
  "Uster",
  "Sion",
  "Emmen",
] as const;
