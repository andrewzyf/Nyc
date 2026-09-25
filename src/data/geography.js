// A stylized, compressed New York. World units are meters; +x is east, +z is south
// (so "uptown" is -z). Manhattan is ~1.5km x 4km, a full borough walk is ~15 minutes.
//
// Everything here is hand-authored data. The procedural city model (world/cityModel.js)
// turns grids + neighborhoods into blocks, lots and buildings.

/** Scale factor used for fares and travel time: 1 game meter ≈ this many real meters. */
export const REAL_SCALE = 2.6;

// ---------------------------------------------------------------------------------
// Land masses
// ---------------------------------------------------------------------------------
export const ISLANDS = [
  {
    id: 'manhattan',
    name: 'Manhattan',
    walkable: true,
    poly: [
      [-790, -1900], [640, -1900], [640, 600], [720, 680], [720, 1150], [600, 1300],
      [470, 1520], [330, 1720], [200, 1900], [40, 2060], [-140, 2170], [-330, 2150],
      [-470, 2020], [-560, 1800], [-640, 1450], [-720, 1100], [-790, 800],
    ],
  },
  {
    id: 'brooklyn',
    name: 'Brooklyn',
    walkable: true,
    poly: [
      [880, 470], [2800, 470], [2800, 3100], [1000, 3100], [900, 2640], [870, 2250],
      [880, 1900], [900, 1560], [880, 1150], [870, 800],
    ],
  },
  {
    id: 'queens',
    name: 'Queens',
    walkable: true,
    poly: [[850, -1300], [2400, -1300], [2400, 440], [880, 440], [850, 120], [830, -500], [840, -1000]],
  },
  { id: 'roosevelt', name: 'Roosevelt Island', walkable: false, poly: [[700, -760], [760, -800], [790, -700], [770, 60], [720, 120], [700, 40]] },
  {
    id: 'liberty',
    name: 'Liberty Island',
    walkable: false,
    poly: [[-800, 2830], [-720, 2800], [-660, 2840], [-650, 2920], [-720, 2960], [-800, 2920]],
  },
  { id: 'ellis', name: 'Ellis Island', walkable: false, poly: [[-900, 2400], [-820, 2390], [-810, 2470], [-900, 2480]] },
  { id: 'governors', name: 'Governors Island', walkable: false, poly: [[250, 2380], [420, 2330], [520, 2420], [470, 2600], [300, 2620], [230, 2500]] },
  // Backdrop land (visible across the water, not walkable)
  { id: 'newjersey', name: 'New Jersey', walkable: false, backdrop: true, poly: [[-2400, -2600], [-1000, -2600], [-980, 0], [-1020, 1400], [-1100, 2400], [-1200, 3400], [-2400, 3400]] },
  { id: 'bronx', name: 'The Bronx', walkable: false, backdrop: true, poly: [[-700, -3200], [2600, -3200], [2600, -1380], [2420, -1380], [2420, -1960], [-700, -1960]] },
  { id: 'longisland', name: 'Eastern Queens', walkable: false, backdrop: true, poly: [[2420, -1380], [4200, -1380], [4200, 4300], [2820, 4300], [2820, 450], [2420, 450]] },
  { id: 'southbrooklyn', name: 'South Brooklyn', walkable: false, backdrop: true, poly: [[1040, 3120], [2820, 3120], [2820, 4300], [1200, 4300]] },
];

// ---------------------------------------------------------------------------------
// Street grids. Each line: {p: position, w: width, name: string | (other) => string,
// range?: [min, max] along the other axis}.
// ---------------------------------------------------------------------------------
const MAJOR = 18;
const MINOR = 12;
const AVE = 20;

const nameBy = (table) => (v) => {
  for (const [lim, name] of table) if (v <= lim) return name;
  return table[table.length - 1][1];
};

const manhattanUpperZs = [
  [1000, 'E Houston St', MAJOR], [930, 'Bleecker St'], [860, 'W 4th St'], [790, '8th St'], [725, '10th St'],
  [650, '14th St', MAJOR], [585, '17th St'], [520, '20th St'], [450, '23rd St', MAJOR], [385, '26th St'],
  [320, '29th St'], [255, '32nd St'], [200, '34th St', MAJOR], [135, '38th St'], [75, '40th St'],
  [15, '42nd St', MAJOR], [-45, '45th St'], [-105, '47th St'], [-170, '50th St'], [-235, '53rd St'],
  [-300, '57th St', MAJOR], [-360, '59th St', MAJOR], [-425, '62nd St'], [-490, '65th St'], [-555, '68th St'],
  [-620, '72nd St', MAJOR], [-685, '75th St'], [-750, '79th St', MAJOR], [-815, '82nd St'], [-880, '86th St', MAJOR],
  [-945, '89th St'], [-1010, '92nd St'], [-1075, '96th St', MAJOR], [-1140, '99th St'], [-1205, '102nd St'],
  [-1270, '105th St'], [-1335, '108th St'], [-1400, '110th St', MAJOR], [-1465, '113th St'], [-1530, '116th St', MAJOR],
  [-1595, '119th St'], [-1660, '122nd St'], [-1725, '125th St', MAJOR], [-1790, '128th St'], [-1855, '131st St'],
];

// E/W prefix for numbered streets depends on the side of Fifth Avenue.
function crossStreetName(base) {
  return (x) => {
    if (!/^\d/.test(base)) return base;
    if (base === '59th St' && x > -330 && x < 0) return 'Central Park South';
    if (base === '110th St' && x > -330 && x < 0) return 'Central Park North';
    return `${x < 0 ? 'W' : 'E'} ${base}`;
  };
}

export const GRIDS = [
  {
    id: 'manhattan-upper',
    island: 'manhattan',
    xs: [
      { p: -740, w: 26, name: '12th Ave' },
      { p: -660, w: AVE, name: (z) => (z < -360 ? 'West End Ave' : '11th Ave') },
      { p: -550, w: AVE, name: (z) => (z < -360 ? 'Amsterdam Ave' : '10th Ave') },
      { p: -440, w: AVE, name: (z) => (z < -360 ? 'Columbus Ave' : '9th Ave') },
      { p: -330, w: AVE, name: (z) => (z < -1400 ? 'Frederick Douglass Blvd' : z < -360 ? 'Central Park West' : '8th Ave') },
      { p: -220, w: AVE, name: (z) => (z < -1400 ? 'Adam Clayton Powell Jr Blvd' : '7th Ave') },
      { p: -110, w: AVE, name: (z) => (z < -1400 ? 'Malcolm X Blvd' : z > 790 ? 'Ave of the Americas' : '6th Ave') },
      { p: 0, w: AVE, name: '5th Ave' },
      { p: 80, w: 16, name: 'Madison Ave', range: [-2000, 441] },
      { p: 160, w: AVE, name: (z) => (z > 441 ? 'Park Ave South' : 'Park Ave') },
      { p: 240, w: AVE, name: 'Lexington Ave' },
      { p: 330, w: AVE, name: '3rd Ave' },
      { p: 420, w: AVE, name: '2nd Ave' },
      { p: 510, w: AVE, name: '1st Ave' },
      { p: 590, w: AVE, name: (z) => (z > 650 ? 'Avenue A' : 'York Ave') },
      { p: 670, w: AVE, name: 'Avenue B', range: [650, 2000] },
    ],
    zs: manhattanUpperZs.map(([p, n, w]) => ({ p, w: w || MINOR, name: crossStreetName(n) })),
  },
  {
    id: 'manhattan-lower',
    island: 'manhattan',
    xs: [
      { p: -700, w: 26, name: 'West St' },
      { p: -620, w: MINOR, name: 'Greenwich St' },
      { p: -540, w: MINOR, name: 'Hudson St' },
      { p: -460, w: MINOR, name: (z) => (z > 1500 ? 'Church St' : 'Varick St') },
      { p: -380, w: 14, name: (z) => (z > 1640 ? 'Trinity Pl' : 'Church St') },
      { p: -300, w: MINOR, name: (z) => (z > 1640 ? 'Greenwich St' : 'W Broadway') },
      { p: -220, w: MINOR, name: (z) => (z > 1640 ? 'Nassau St' : 'Thompson St') },
      { p: -60, w: MINOR, name: (z) => (z > 1640 ? 'Broad St' : 'Centre St') },
      { p: 20, w: MINOR, name: (z) => (z > 1640 ? 'William St' : 'Lafayette St') },
      { p: 100, w: MINOR, name: (z) => (z > 1640 ? 'Pearl St' : 'Mulberry St') },
      { p: 180, w: MAJOR, name: (z) => (z > 1640 ? 'Water St' : 'Bowery') },
      { p: 260, w: MINOR, name: (z) => (z > 1640 ? 'Front St' : 'Chrystie St') },
      { p: 340, w: MINOR, name: (z) => (z > 1640 ? 'South St' : 'Allen St') },
      { p: 420, w: MINOR, name: 'Orchard St' },
      { p: 500, w: MINOR, name: 'Essex St' },
      { p: 580, w: MINOR, name: 'Clinton St' },
      { p: 660, w: MINOR, name: 'Montgomery St' },
    ],
    zs: [
      { p: 1000, w: MAJOR, name: 'Houston St' },
      { p: 1070, w: MINOR, name: nameBy([[150, 'Spring St'], [Infinity, 'Delancey St']]) },
      { p: 1140, w: MAJOR, name: 'Canal St' },
      { p: 1210, w: MINOR, name: nameBy([[150, 'Walker St'], [Infinity, 'East Broadway']]) },
      { p: 1280, w: MINOR, name: nameBy([[150, 'Worth St'], [Infinity, 'Henry St']]) },
      { p: 1350, w: MINOR, name: nameBy([[150, 'Duane St'], [Infinity, 'Madison St']]) },
      { p: 1420, w: MAJOR, name: 'Chambers St' },
      { p: 1490, w: MINOR, name: 'Warren St' },
      { p: 1560, w: MINOR, name: 'Park Pl' },
      { p: 1630, w: MINOR, name: 'Fulton St' },
      { p: 1700, w: MINOR, name: 'John St' },
      { p: 1770, w: MINOR, name: 'Wall St' },
      { p: 1840, w: MINOR, name: 'Exchange Pl' },
      { p: 1910, w: MINOR, name: 'Beaver St' },
      { p: 1980, w: MINOR, name: 'Stone St' },
      { p: 2050, w: MINOR, name: 'Battery Pl' },
    ],
  },
  {
    id: 'brooklyn',
    island: 'brooklyn',
    xs: Array.from({ length: 19 }, (_, i) => 960 + i * 100).map((p, i) => ({
      p,
      w: i % 4 === 0 ? 16 : MINOR,
      name: (z) => brooklynXName(i, z),
    })),
    zs: Array.from({ length: 38 }, (_, i) => 470 + i * 70).map((p, i) => ({
      p,
      w: [5, 9, 14, 20, 26, 31].includes(i) ? 16 : MINOR,
      name: (x) => brooklynZName(i, x),
    })),
  },
  {
    id: 'queens',
    island: 'queens',
    xs: [900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300].map((p, i) => ({
      p,
      w: i === 2 || i === 6 ? 16 : MINOR,
      name: ['Vernon Blvd', '11th St', '21st St', 'Crescent St', '31st St', '33rd St', 'Steinway St', '41st St', '45th St', '48th St', '52nd St', '58th St', '61st St', '65th St', '69th St'][i],
    })),
    zs: Array.from({ length: 25 }, (_, i) => 440 - i * 70).map((p, i) => ({
      p,
      w: [3, 9, 13, 18].includes(i) ? 16 : MINOR,
      name: [
        'Borden Ave', '50th Ave', '48th Ave', 'Jackson Ave', '44th Dr', 'Queens Plaza S', 'Queens Plaza N', '41st Ave', '40th Ave',
        'Northern Blvd', '37th Ave', '36th Ave', '35th Ave', 'Broadway', '34th Ave', '31st Ave', '30th Ave', 'Newtown Ave',
        'Astoria Blvd', '24th Ave', '23rd Ave', '21st Ave', 'Ditmars Blvd', '20th Ave', '19th Ave',
      ][i],
    })),
  },
];

function brooklynXName(i, z) {
  if (z < 1480) {
    return ['Kent Ave', 'Wythe Ave', 'Berry St', 'Bedford Ave', 'Driggs Ave', 'Roebling St', 'Union Ave', 'Lorimer St', 'Graham Ave', 'Bushwick Ave', 'Evergreen Ave', 'Morgan Ave', 'Knickerbocker Ave', 'Irving Ave', 'Wyckoff Ave', 'Cypress Ave', 'Seneca Ave', 'Onderdonk Ave', 'Woodward Ave'][i];
  }
  if (z < 2330) {
    return ['Furman St', 'Columbia Hts', 'Hicks St', 'Henry St', 'Court St', 'Jay St', 'Flatbush Ave', 'Ashland Pl', 'Fort Greene Pl', 'Clermont Ave', 'Vanderbilt Ave', 'Classon Ave', 'Franklin Ave', 'Bedford Ave', 'Nostrand Ave', 'Marcy Ave', 'Tompkins Ave', 'Throop Ave', 'Lewis Ave'][i];
  }
  return ['Van Brunt St', 'Columbia St', 'Hicks St', 'Court St', 'Smith St', 'Hoyt St', '3rd Ave', '4th Ave', '5th Ave', '6th Ave', '7th Ave', '8th Ave', 'Prospect Park West', 'Center Dr', 'West Dr', 'Flatbush Ave', 'Washington Ave', 'Classon Ave', 'Franklin Ave'][i];
}

function brooklynZName(i, x) {
  const names = [
    'Greenpoint Ave', 'Kent St', 'Java St', 'India St', 'Huron St', 'Nassau Ave', 'Norman Ave', 'N 12th St', 'N 10th St', 'N 7th St',
    'N 4th St', 'Metropolitan Ave', 'Grand St', 'S 2nd St', 'Broadway', 'S 5th St', 'S 9th St', 'Division Ave', 'Wallabout St', 'Flushing Ave',
    'Water St', 'Front St', 'York St', 'Tillary St', 'Cadman Plaza', 'Pierrepont St', 'Montague St', 'Joralemon St', 'State St', 'Atlantic Ave',
    'Pacific St', 'Dean St', 'Bergen St', 'Union St', 'Carroll St', '3rd St', '7th St', '9th St',
  ];
  if (x > 1900 && i >= 20 && i <= 29) {
    return ['Myrtle Ave', 'Willoughby Ave', 'DeKalb Ave', 'Lafayette Ave', 'Greene Ave', 'Gates Ave', 'Madison St', 'Halsey St', 'Macon St', 'Fulton St'][i - 20];
  }
  return names[i];
}

// Broadway cuts diagonally across the grid (Times Square, Herald Square, Flatiron...)
export const BROADWAY = {
  width: 22,
  points: [
    [-130, 2060], [-110, 1600], [50, 1000], [50, 740], [78, 650], [18, 441], [-110, 200], [-220, -45],
    [-330, -360], [-460, -560], [-560, -650], [-605, -800], [-605, -1900],
  ],
};

// ---------------------------------------------------------------------------------
// Neighborhoods: first match wins. Rent in $/month for [room, studio, 1br, 2br] (low, high).
// styles: weights of building archetypes. h: height range in meters.
// ---------------------------------------------------------------------------------
export const NEIGHBORHOODS = [
  // Manhattan ---------------------------------------------------------------------
  { id: 'harlem', name: 'Harlem', borough: 'Manhattan', rect: [-800, 800, -1950, -1400], styles: { tenement: 3, brownstone: 4, prewar: 2, modern: 1 }, h: [12, 42], shops: 0.45, density: 0.6, trees: 0.45, rent: { room: [1050, 1350], studio: [1850, 2250], br1: [2200, 2800], br2: [2900, 3600] }, vibe: 'Brownstones, jazz history, soul food and 125th Street energy.' },
  { id: 'central-park', name: 'Central Park', borough: 'Manhattan', rect: [-320, -10, -1391, -369], styles: { prewar: 1 }, h: [20, 40], shops: 0, density: 0.5, trees: 1, rent: { room: [1500, 1800], studio: [2500, 3000], br1: [3200, 4000], br2: [4500, 6000] }, vibe: 'The city\u2019s backyard.' },
  { id: 'upper-west-side', name: 'Upper West Side', borough: 'Manhattan', rect: [-800, -330, -1400, -365], styles: { prewar: 5, brownstone: 3, modern: 2 }, h: [18, 75], shops: 0.5, density: 0.55, trees: 0.6, rent: { room: [1500, 1800], studio: [2500, 3100], br1: [3300, 4300], br2: [4800, 6500] }, vibe: 'Leafy blocks, prewar grandeur, museums and Riverside strolls.' },
  { id: 'upper-east-side', name: 'Upper East Side', borough: 'Manhattan', rect: [-10, 800, -1400, -365], styles: { prewar: 6, brownstone: 2, modern: 3 }, h: [18, 85], shops: 0.5, density: 0.55, trees: 0.55, rent: { room: [1450, 1750], studio: [2400, 3000], br1: [3100, 4100], br2: [4600, 6400] }, vibe: 'Museum Mile, doormen, and quiet brunch-y side streets.' },
  { id: 'hudson-yards', name: 'Hudson Yards', borough: 'Manhattan', rect: [-800, -600, 120, 330], styles: { tower: 6, modern: 4 }, h: [80, 290], shops: 0.3, density: 0.6, trees: 0.2, rent: { room: [1900, 2300], studio: [3600, 4300], br1: [4600, 5800], br2: [7000, 9500] }, vibe: 'Glass towers, the Vessel and the end of the High Line.' },
  { id: 'times-square', name: 'Times Square', borough: 'Manhattan', rect: [-300, -140, -125, 35], styles: { tower: 6, prewar: 3 }, h: [60, 180], shops: 1, density: 1, trees: 0, rent: { room: [1800, 2100], studio: [3000, 3600], br1: [3800, 4800], br2: [5500, 7200] }, vibe: 'Neon, crowds, Broadway marquees. The crossroads of the world.' },
  { id: 'hells-kitchen', name: "Hell's Kitchen", borough: 'Manhattan', rect: [-800, -300, -365, 200], styles: { tenement: 4, prewar: 3, modern: 3 }, h: [14, 65], shops: 0.65, density: 0.7, trees: 0.35, rent: { room: [1500, 1850], studio: [2600, 3100], br1: [3300, 4200], br2: [4700, 6000] }, vibe: 'Restaurant Row, theater folks and walk-ups west of the lights.' },
  { id: 'midtown', name: 'Midtown', borough: 'Manhattan', rect: [-300, 290, -365, 200], styles: { tower: 7, prewar: 3 }, h: [50, 270], shops: 0.8, density: 0.95, trees: 0.1, rent: { room: [1700, 2000], studio: [2800, 3400], br1: [3700, 4700], br2: [5300, 7000] }, vibe: 'Skyscrapers, Fifth Avenue windows and the lunchtime rush.' },
  { id: 'midtown-east', name: 'Midtown East', borough: 'Manhattan', rect: [290, 800, -365, 200], styles: { prewar: 4, modern: 3, tower: 3 }, h: [30, 160], shops: 0.55, density: 0.7, trees: 0.3, rent: { room: [1450, 1750], studio: [2500, 2950], br1: [3200, 3900], br2: [4500, 5800] }, vibe: 'Turtle Bay, the U.N. and quieter towers by the river.' },
  { id: 'chelsea', name: 'Chelsea', borough: 'Manhattan', rect: [-800, -110, 200, 650], styles: { tenement: 3, warehouse: 3, prewar: 2, modern: 2 }, h: [14, 60], shops: 0.55, density: 0.7, trees: 0.45, rent: { room: [1550, 1900], studio: [2700, 3300], br1: [3500, 4400], br2: [5000, 6800] }, vibe: 'Galleries, the High Line and converted warehouses.' },
  { id: 'flatiron', name: 'Flatiron', borough: 'Manhattan', rect: [-110, 200, 200, 650], styles: { prewar: 5, castiron: 2, tower: 2, modern: 2 }, h: [28, 100], shops: 0.75, density: 0.85, trees: 0.2, rent: { room: [1650, 1950], studio: [2800, 3400], br1: [3700, 4600], br2: [5400, 7000] }, vibe: 'Startups, Madison Square Park and the famous wedge.' },
  { id: 'gramercy', name: 'Gramercy & Murray Hill', borough: 'Manhattan', rect: [200, 800, 200, 650], styles: { prewar: 4, brownstone: 3, modern: 3 }, h: [18, 60], shops: 0.5, density: 0.6, trees: 0.45, rent: { room: [1450, 1750], studio: [2500, 2900], br1: [3200, 3800], br2: [4500, 5600] }, vibe: 'Bars full of recent grads, tree-lined side streets.' },
  { id: 'west-village', name: 'West Village', borough: 'Manhattan', rect: [-800, -110, 650, 1000], styles: { brownstone: 5, tenement: 4, modern: 1 }, h: [10, 26], shops: 0.7, density: 0.75, trees: 0.7, rent: { room: [1700, 2000], studio: [2900, 3500], br1: [3800, 4900], br2: [5500, 7800] }, vibe: 'Crooked charm, jazz clubs and impossibly cute stoops.' },
  { id: 'greenwich-village', name: 'Greenwich Village', borough: 'Manhattan', rect: [-110, 200, 650, 1000], styles: { prewar: 4, tenement: 4, modern: 2 }, h: [14, 45], shops: 0.75, density: 0.85, trees: 0.5, rent: { room: [1600, 1900], studio: [2700, 3200], br1: [3500, 4300], br2: [5000, 6500] }, vibe: 'Washington Square, NYU and folk-song history.' },
  { id: 'east-village', name: 'East Village', borough: 'Manhattan', rect: [200, 800, 650, 1000], styles: { tenement: 8, modern: 2 }, h: [12, 28], shops: 0.8, density: 0.8, trees: 0.5, rent: { room: [1350, 1650], studio: [2400, 2800], br1: [2900, 3600], br2: [4100, 5200] }, vibe: 'Punk roots, dumplings at 2am, Tompkins Square.' },
  { id: 'soho', name: 'SoHo', borough: 'Manhattan', rect: [-800, -20, 1000, 1200], styles: { castiron: 8, modern: 2 }, h: [18, 34], shops: 0.95, density: 0.85, trees: 0.2, rent: { room: [1800, 2100], studio: [3100, 3700], br1: [4000, 5200], br2: [6000, 8200] }, vibe: 'Cast-iron lofts, cobblestones and flagship stores.' },
  { id: 'tribeca', name: 'Tribeca', borough: 'Manhattan', rect: [-800, -100, 1200, 1500], styles: { warehouse: 5, castiron: 2, modern: 3 }, h: [18, 60], shops: 0.5, density: 0.55, trees: 0.35, rent: { room: [1850, 2200], studio: [3300, 3900], br1: [4300, 5500], br2: [6500, 9000] }, vibe: 'Warehouse lofts and celebrity sightings.' },
  { id: 'chinatown', name: 'Chinatown & Little Italy', borough: 'Manhattan', rect: [-100, 260, 1000, 1420], styles: { tenement: 8, modern: 2 }, h: [14, 30], shops: 0.95, density: 0.95, trees: 0.1, rent: { room: [1150, 1450], studio: [2100, 2500], br1: [2600, 3200], br2: [3500, 4400] }, vibe: 'Dim sum, fish markets, red lanterns and Mulberry Street.' },
  { id: 'lower-east-side', name: 'Lower East Side', borough: 'Manhattan', rect: [260, 800, 1000, 1420], styles: { tenement: 7, modern: 3 }, h: [12, 42], shops: 0.8, density: 0.8, trees: 0.3, rent: { room: [1300, 1600], studio: [2300, 2700], br1: [2800, 3500], br2: [3900, 5000] }, vibe: 'Tenement history, pickles, and bars that open late.' },
  { id: 'seaport', name: 'South Street Seaport', borough: 'Manhattan', rect: [260, 800, 1420, 1700], styles: { tenement: 3, prewar: 3, modern: 4 }, h: [14, 90], shops: 0.6, density: 0.65, trees: 0.25, rent: { room: [1450, 1750], studio: [2600, 3100], br1: [3300, 4100], br2: [4700, 6200] }, vibe: 'Cobblestones, tall ships and fish-market history under the Brooklyn Bridge.' },
  { id: 'world-trade', name: 'World Trade Center', borough: 'Manhattan', rect: [-560, -300, 1420, 1680], styles: { tower: 8, modern: 2 }, h: [70, 230], shops: 0.4, density: 0.8, trees: 0.2, rent: { room: [1800, 2100], studio: [3000, 3600], br1: [3900, 4800], br2: [5600, 7400] }, vibe: 'Memorial pools, the Oculus and One World Trade.' },
  { id: 'battery-park-city', name: 'Battery Park City', borough: 'Manhattan', rect: [-800, -520, 1500, 2200], styles: { modern: 8, prewar: 2 }, h: [40, 100], shops: 0.2, density: 0.4, trees: 0.6, rent: { room: [1700, 2000], studio: [3000, 3500], br1: [3800, 4700], br2: [5500, 7200] }, vibe: 'Quiet riverfront towers and sunset over the Hudson.' },
  { id: 'civic-center', name: 'Civic Center', borough: 'Manhattan', rect: [-300, 260, 1420, 1640], styles: { prewar: 6, tower: 4 }, h: [40, 140], shops: 0.4, density: 0.75, trees: 0.2, rent: { room: [1600, 1900], studio: [2700, 3200], br1: [3500, 4300], br2: [5000, 6400] }, vibe: 'Courthouses, City Hall and the foot of the Brooklyn Bridge.' },
  { id: 'financial-district', name: 'Financial District', borough: 'Manhattan', rect: [-800, 800, 1640, 2200], styles: { tower: 7, prewar: 3 }, h: [60, 250], shops: 0.55, density: 0.85, trees: 0.1, rent: { room: [1600, 1900], studio: [2800, 3300], br1: [3500, 4400], br2: [5000, 6600] }, vibe: 'Canyons of finance, the Charging Bull and the harbor breeze.' },
  { id: 'manhattan', name: 'Manhattan', borough: 'Manhattan', rect: [-800, 800, -2000, 2200], styles: { prewar: 1, tenement: 1 }, h: [15, 50], shops: 0.5, density: 0.6, trees: 0.3, rent: { room: [1500, 1800], studio: [2500, 3000], br1: [3200, 4000], br2: [4500, 6000] }, vibe: 'The city that never sleeps.' },

  // Brooklyn ----------------------------------------------------------------------
  { id: 'greenpoint', name: 'Greenpoint', borough: 'Brooklyn', rect: [860, 1800, 460, 850], styles: { tenement: 4, rowhouse: 4, warehouse: 2 }, h: [8, 20], shops: 0.55, density: 0.5, trees: 0.5, rent: { room: [1200, 1450], studio: [2100, 2500], br1: [2600, 3100], br2: [3400, 4200] }, vibe: 'Polish bakeries, waterfront parks and vinyl-sided walk-ups.' },
  { id: 'williamsburg', name: 'Williamsburg', borough: 'Brooklyn', rect: [860, 1800, 850, 1460], styles: { tenement: 4, warehouse: 3, modern: 3 }, h: [10, 42], shops: 0.75, density: 0.75, trees: 0.4, rent: { room: [1350, 1650], studio: [2500, 3000], br1: [3000, 3800], br2: [4000, 5200] }, vibe: 'Vintage shops, rooftop bars and the Domino waterfront.' },
  { id: 'bushwick', name: 'Bushwick', borough: 'Brooklyn', rect: [1800, 2850, 460, 1700], styles: { rowhouse: 4, warehouse: 4, tenement: 2 }, h: [8, 18], shops: 0.5, density: 0.5, trees: 0.35, rent: { room: [950, 1250], studio: [1800, 2150], br1: [2100, 2600], br2: [2700, 3300] }, vibe: 'Murals, DIY venues and lofts with more roommates than rooms.' },
  { id: 'dumbo', name: 'DUMBO', borough: 'Brooklyn', rect: [860, 1250, 1460, 1880], styles: { warehouse: 8, modern: 2 }, h: [18, 45], shops: 0.6, density: 0.7, trees: 0.2, rent: { room: [1600, 1900], studio: [3000, 3500], br1: [3800, 4700], br2: [5500, 7000] }, vibe: 'Cobblestones framed by the Manhattan Bridge.' },
  { id: 'brooklyn-heights', name: 'Brooklyn Heights', borough: 'Brooklyn', rect: [860, 1250, 1880, 2350], styles: { brownstone: 8, prewar: 2 }, h: [10, 32], shops: 0.4, density: 0.5, trees: 0.7, rent: { room: [1400, 1700], studio: [2500, 2900], br1: [3100, 3800], br2: [4300, 5600] }, vibe: 'Historic brownstones and the Promenade skyline view.' },
  { id: 'downtown-brooklyn', name: 'Downtown Brooklyn', borough: 'Brooklyn', rect: [1250, 1680, 1600, 2280], styles: { modern: 5, prewar: 3, tower: 2 }, h: [30, 150], shops: 0.7, density: 0.8, trees: 0.2, rent: { room: [1350, 1600], studio: [2600, 3100], br1: [3100, 3800], br2: [4200, 5300] }, vibe: 'New towers, Borough Hall and Barclays Center.' },
  { id: 'fort-greene', name: 'Fort Greene', borough: 'Brooklyn', rect: [1250, 1950, 1460, 2350], styles: { brownstone: 7, prewar: 3 }, h: [10, 24], shops: 0.5, density: 0.55, trees: 0.65, rent: { room: [1250, 1500], studio: [2200, 2600], br1: [2700, 3300], br2: [3600, 4600] }, vibe: 'Brownstones, a hilltop park and the flea market.' },
  { id: 'bed-stuy', name: 'Bed-Stuy', borough: 'Brooklyn', rect: [1950, 2850, 1700, 2430], styles: { brownstone: 9, tenement: 1 }, h: [10, 18], shops: 0.45, density: 0.5, trees: 0.6, rent: { room: [950, 1200], studio: [1800, 2150], br1: [2100, 2600], br2: [2700, 3400] }, vibe: 'Block parties, stoops and some of the city’s prettiest brownstones.' },
  { id: 'park-slope', name: 'Park Slope', borough: 'Brooklyn', rect: [1250, 1900, 2350, 3150], styles: { brownstone: 9, prewar: 2 }, h: [10, 22], shops: 0.55, density: 0.55, trees: 0.75, rent: { room: [1300, 1600], studio: [2300, 2700], br1: [2900, 3500], br2: [3800, 4800] }, vibe: 'Strollers, food co-ops and Prospect Park at the end of the block.' },
  { id: 'carroll-gardens', name: 'Carroll Gardens', borough: 'Brooklyn', rect: [860, 1250, 2350, 3150], styles: { brownstone: 7, rowhouse: 3 }, h: [9, 18], shops: 0.45, density: 0.45, trees: 0.65, rent: { room: [1250, 1500], studio: [2200, 2600], br1: [2700, 3300], br2: [3600, 4500] }, vibe: 'Front gardens, old Italian bakeries and Court Street.' },
  { id: 'crown-heights', name: 'Crown Heights', borough: 'Brooklyn', rect: [1900, 2850, 2430, 3150], styles: { brownstone: 6, prewar: 4 }, h: [10, 26], shops: 0.5, density: 0.5, trees: 0.55, rent: { room: [1000, 1250], studio: [1850, 2200], br1: [2150, 2650], br2: [2800, 3500] }, vibe: 'Caribbean flavors, Eastern Parkway and the Botanic Garden.' },
  { id: 'brooklyn', name: 'Brooklyn', borough: 'Brooklyn', rect: [860, 2850, 460, 3150], styles: { brownstone: 1, rowhouse: 1 }, h: [9, 20], shops: 0.4, density: 0.45, trees: 0.5, rent: { room: [1100, 1400], studio: [2000, 2400], br1: [2400, 3000], br2: [3200, 4000] }, vibe: 'Brooklyn.' },

  // Queens -------------------------------------------------------------------------
  { id: 'long-island-city', name: 'Long Island City', borough: 'Queens', rect: [820, 1450, -260, 450], styles: { modern: 6, warehouse: 4 }, h: [18, 150], shops: 0.45, density: 0.55, trees: 0.25, rent: { room: [1300, 1600], studio: [2500, 3000], br1: [3000, 3700], br2: [4000, 5000] }, vibe: 'Glass towers with the best Manhattan view, and old factory lofts.' },
  { id: 'sunnyside', name: 'Sunnyside', borough: 'Queens', rect: [1450, 2450, -260, 450], styles: { rowhouse: 4, prewar: 4, tenement: 2 }, h: [8, 24], shops: 0.45, density: 0.45, trees: 0.5, rent: { room: [900, 1150], studio: [1600, 1900], br1: [1900, 2300], br2: [2400, 2900] }, vibe: 'Garden apartments under the 7 train.' },
  { id: 'astoria', name: 'Astoria', borough: 'Queens', rect: [820, 2450, -1320, -260], styles: { rowhouse: 5, tenement: 3, prewar: 2 }, h: [8, 22], shops: 0.55, density: 0.5, trees: 0.5, rent: { room: [950, 1200], studio: [1650, 2000], br1: [2000, 2450], br2: [2500, 3100] }, vibe: 'Greek tavernas, beer gardens and friendly blocks.' },
];

// Height "attractors" push skyline clusters up (Midtown, FiDi, Downtown Brooklyn, LIC).
export const SKYLINE = [
  { x: -80, z: -120, r: 420, boost: 1.6 },
  { x: -80, z: -330, r: 260, boost: 1.5 },
  { x: -30, z: 1800, r: 330, boost: 1.5 },
  { x: -700, z: 220, r: 170, boost: 1.4 },
  { x: 1450, z: 1950, r: 220, boost: 1.4 },
  { x: 1150, z: 150, r: 260, boost: 1.4 },
  { x: -400, z: 1560, r: 200, boost: 1.3 },
];

// ---------------------------------------------------------------------------------
// Parks & plazas. rect: [x0, x1, z0, z1] or poly. kind: park|plaza|waterfront
// ---------------------------------------------------------------------------------
export const PARKS = [
  {
    id: 'central-park', name: 'Central Park', kind: 'park', rect: [-320, -10, -1391, -369], trees: 1,
    water: [
      { x: -170, z: -1060, rx: 105, rz: 78, name: 'The Reservoir' },
      { x: -200, z: -662, rx: 62, rz: 24, name: 'The Lake' },
      { x: -42, z: -398, rx: 24, rz: 14, name: 'The Pond' },
      { x: -55, z: -1345, rx: 38, rz: 22, name: 'Harlem Meer' },
    ],
    lawns: [
      { x: -205, z: -500, rx: 62, rz: 36, name: 'Sheep Meadow' },
      { x: -165, z: -860, rx: 72, rz: 46, name: 'Great Lawn' },
    ],
  },
  { id: 'washington-square', name: 'Washington Square Park', kind: 'park', rect: [-100, 70, 796, 854], trees: 0.6 },
  { id: 'union-square', name: 'Union Square', kind: 'park', rect: [90, 150, 591, 641], trees: 0.7 },
  { id: 'madison-square', name: 'Madison Square Park', kind: 'park', rect: [10, 72, 391, 441], trees: 0.8 },
  { id: 'bryant-park', name: 'Bryant Park', kind: 'park', rect: [-100, -50, 24, 69], trees: 0.6, lawns: [{ x: -75, z: 46, rx: 18, rz: 14 }] },
  { id: 'tompkins-square', name: 'Tompkins Square Park', kind: 'park', rect: [600, 660, 731, 784], trees: 0.9 },
  { id: 'hudson-river-park', name: 'Hudson River Park', kind: 'waterfront', rect: [-800, -754, -1900, 820], trees: 0.4, clipToLand: true },
  { id: 'east-river-esplanade', name: 'East River Esplanade', kind: 'waterfront', rect: [612, 740, -1900, 1100], trees: 0.3, clipToLand: true },
  { id: 'city-hall-park', name: 'City Hall Park', kind: 'park', rect: [-90, 34, 1496, 1624], trees: 0.7 },
  { id: 'battery-park', name: 'The Battery', kind: 'park', poly: [[-470, 2030], [-330, 2150], [-140, 2170], [-60, 2120], [-150, 2056], [-330, 2056]], trees: 0.6 },
  { id: 'bowling-green', name: 'Bowling Green', kind: 'plaza', rect: [-150, -100, 1986, 2044], trees: 0.3 },
  { id: 'rockefeller-plaza', name: 'Rockefeller Plaza', kind: 'plaza', rect: [-60, -10, -164, -111], trees: 0 },
  { id: 'grand-central-plaza', name: 'Pershing Square', kind: 'plaza', rect: [110, 210, -39, 6], trees: 0, hidden: true },
  { id: 'lincoln-center', name: 'Lincoln Center', kind: 'plaza', rect: [-536, -454, -484, -431], trees: 0.2 },
  { id: 'wtc-plaza', name: '9/11 Memorial Plaza', kind: 'plaza', rect: [-452, -306, 1496, 1624], trees: 0.5 },
  { id: 'penn-plaza', name: 'Penn Plaza', kind: 'plaza', rect: [-320, -230, 209, 310], trees: 0, hidden: true },
  { id: 'columbus-circle', name: 'Columbus Circle', kind: 'plaza', rect: [-352, -308, -382, -338], trees: 0 },
  { id: 'grand-army-plaza', name: 'Grand Army Plaza', kind: 'plaza', rect: [1968, 2052, 2366, 2424], trees: 0.3 },
  { id: 'prospect-park', name: 'Prospect Park', kind: 'park', rect: [1968, 2452, 2436, 3100], trees: 1, water: [{ x: 2250, z: 2940, rx: 90, rz: 60, name: 'Prospect Lake' }], lawns: [{ x: 2110, z: 2640, rx: 80, rz: 90, name: 'Long Meadow' }] },
  { id: 'mccarren-park', name: 'McCarren Park', kind: 'park', rect: [1566, 1754, 828, 954], trees: 0.6 },
  { id: 'fort-greene-park', name: 'Fort Greene Park', kind: 'park', rect: [1666, 1854, 1526, 1654], trees: 0.9 },
  { id: 'transmitter-park', name: 'Transmitter Park', kind: 'waterfront', rect: [850, 952, 460, 830], trees: 0.3, clipToLand: true },
  { id: 'williamsburg-waterfront', name: 'Marsha P. Johnson State Park', kind: 'waterfront', rect: [850, 952, 830, 1040], trees: 0.3, clipToLand: true },
  { id: 'domino-park', name: 'Domino Park', kind: 'waterfront', rect: [850, 952, 1040, 1160], trees: 0.4, clipToLand: true },
  { id: 'navy-yard-greenway', name: 'Brooklyn Waterfront Greenway', kind: 'waterfront', rect: [850, 952, 1160, 1700], trees: 0.3, clipToLand: true },
  { id: 'brooklyn-bridge-park', name: 'Brooklyn Bridge Park', kind: 'waterfront', rect: [850, 952, 1700, 2350], trees: 0.5, clipToLand: true },
  { id: 'red-hook-waterfront', name: 'Valentino Pier', kind: 'waterfront', rect: [850, 952, 2350, 3100], trees: 0.3, clipToLand: true },
  { id: 'hunters-point-park', name: 'Hunters Point South Park', kind: 'waterfront', rect: [820, 894, 294, 440], trees: 0.4, clipToLand: true },
  { id: 'gantry-plaza', name: 'Gantry Plaza State Park', kind: 'waterfront', rect: [820, 894, 16, 294], trees: 0.3, clipToLand: true },
  { id: 'queensbridge-park', name: 'Queensbridge Park', kind: 'waterfront', rect: [820, 894, -1000, 16], trees: 0.5, clipToLand: true },
  { id: 'astoria-park', name: 'Astoria Park', kind: 'park', rect: [820, 994, -1300, -1000], trees: 0.8, clipToLand: true },
  { id: 'sunnyside-gardens', name: 'Sunnyside Gardens Park', kind: 'park', rect: [1906, 1994, -44, 14], trees: 0.8 },
];

// ---------------------------------------------------------------------------------
// Bridges & elevated walkways. a/b are ground-level endpoints. deck is max height.
// ---------------------------------------------------------------------------------
export const BRIDGES = [
  { id: 'brooklyn-bridge', name: 'Brooklyn Bridge', a: [160, 1552], b: [1060, 1850], width: 16, deck: 38, ramp: 190, style: 'brooklyn', towers: [0.33, 0.76] },
  { id: 'manhattan-bridge', name: 'Manhattan Bridge', a: [360, 1175], b: [1110, 1705], width: 18, deck: 40, ramp: 180, style: 'manhattan', towers: [0.33, 0.73] },
  { id: 'williamsburg-bridge', name: 'Williamsburg Bridge', a: [390, 1080], b: [1250, 1040], width: 18, deck: 38, ramp: 200, style: 'williamsburg', towers: [0.42, 0.56] },
  { id: 'queensboro-bridge', name: 'Queensboro Bridge', a: [430, -333], b: [1200, -333], width: 18, deck: 38, ramp: 150, style: 'queensboro', towers: [0.35, 0.5, 0.62] },
  { id: 'pulaski-bridge', name: 'Pulaski Bridge', a: [1250, 380], b: [1250, 540], width: 14, deck: 6, ramp: 50, style: 'simple', towers: [] },
  { id: 'greenpoint-ave-bridge', name: 'Greenpoint Ave Bridge', a: [2050, 380], b: [2050, 540], width: 14, deck: 5, ramp: 45, style: 'simple', towers: [] },
  { id: 'high-line', name: 'The High Line', a: [-600, 668], b: [-700, 226], via: [[-600, 226]], width: 11, deck: 9, ramp: 16, style: 'highline', towers: [] },
];

/** Where new arrivals first appear (Port Authority / Penn area). */
export const SPAWN_POINTS = {
  default: { x: -330 + 16, z: 196, heading: Math.PI },
};
