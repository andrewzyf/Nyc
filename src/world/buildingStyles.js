// Building archetypes. win = procedural window pattern id used by the facade shader:
// 0 glass curtain wall, 1 punched masonry windows, 2 tall narrow (walk-ups), 3 big loft windows, 4 blank.
export const STYLES = {
  tower: { floorH: 4.0, floors: [14, 68], lotW: [26, 46], win: 0, residential: 0.15, podium: true, setback: 0.7, crown: 0.35 },
  modern: { floorH: 3.3, floors: [6, 42], lotW: [16, 32], win: 0, residential: 0.75, setback: 0.25, crown: 0.1 },
  prewar: { floorH: 3.4, floors: [6, 24], lotW: [14, 28], win: 1, residential: 0.75, setback: 0.5, waterTower: 0.55, cornice: true },
  tenement: { floorH: 3.2, floors: [4, 6], lotW: [7, 11], win: 2, residential: 1, waterTower: 0.22, cornice: true, fireEscape: 0.55 },
  brownstone: { floorH: 3.4, floors: [3, 4], lotW: [6, 8.5], win: 2, residential: 1, stoop: true, cornice: true },
  castiron: { floorH: 4.3, floors: [5, 7], lotW: [8, 15], win: 3, residential: 0.6, cornice: true, waterTower: 0.35, fireEscape: 0.3 },
  warehouse: { floorH: 4.2, floors: [3, 8], lotW: [16, 34], win: 3, residential: 0.45, waterTower: 0.3 },
  rowhouse: { floorH: 3.0, floors: [2, 3], lotW: [6, 9], win: 2, residential: 1, frontYard: 2.5, cornice: true },
};

// Warm, muted palettes (sRGB hex)
export const PALETTES = {
  glass: ['#6f8faf', '#7fa0bd', '#5f7f9f', '#8fb0c8', '#58728f', '#9ab5c9', '#6d8a9e', '#7b93a8', '#8aa6b8'],
  modern: ['#9aa9b5', '#b8c4cc', '#7a8a98', '#d0d6da', '#a7b3ba', '#c9c2b5', '#8c9aa3'],
  limestone: ['#d9cdb4', '#cfc2a4', '#e3d9c3', '#c8b99a', '#bfb29a', '#d6c7a8', '#e0d3b8'],
  brick: ['#9b4a3c', '#a65a44', '#8c3f33', '#b86b4f', '#7d3b30', '#c0785a', '#a4533f', '#93503e', '#b0604a'],
  brownstone: ['#7a4a35', '#8a5a42', '#6b3f2d', '#94634a', '#81503a', '#a0705a'],
  castiron: ['#e8e0cf', '#d6d0c4', '#b8b4ac', '#cfc6b0', '#e2d7c0', '#c4bfb5'],
  industrial: ['#8c5040', '#a26a52', '#7a6a5e', '#9c8b78', '#8a4a3a', '#b38463'],
  siding: ['#d8c7a0', '#b5c7c9', '#e0b8a0', '#c9d6b5', '#e8e2d4', '#a8b8d0', '#d9b3b3', '#c7c0e0'],
};

export const STYLE_PALETTE = {
  tower: ['glass', 'glass', 'modern', 'limestone'],
  modern: ['modern', 'glass', 'modern'],
  prewar: ['limestone', 'brick', 'limestone'],
  tenement: ['brick'],
  brownstone: ['brownstone', 'brownstone', 'brick'],
  castiron: ['castiron'],
  warehouse: ['industrial', 'brick'],
  rowhouse: ['siding', 'siding', 'brick'],
};
