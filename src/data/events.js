// Scheduled city events (calendar) and templates for random incidents.
// Dates: {month (0-11), day} or {month, weekday (0=Sun), nth (1..4, -1 = last)}.
// Routes are [x, z] polylines along avenues. Hours are 24h (can exceed 24).

export const CALENDAR_EVENTS = [
  {
    id: 'lunar-new-year', name: 'Lunar New Year Parade', kind: 'parade', date: { month: 1, weekday: 0, nth: 3 }, start: 13, end: 16,
    route: [[100, 1400], [100, 1000]], theme: 'lunar', mood: 14, experience: 'lunar-new-year',
    desc: 'Lion dancers, drums and confetti cannons wind through Chinatown.',
  },
  {
    id: 'st-patricks', name: "St. Patrick's Day Parade", kind: 'parade', date: { month: 2, day: 17 }, start: 11, end: 16,
    route: [[0, -45], [0, -750]], theme: 'green', mood: 12, experience: 'st-patricks',
    desc: 'Bagpipes and a sea of green march up Fifth Avenue — the oldest parade in the city.',
  },
  {
    id: 'easter-parade', name: 'Easter Bonnet Parade', kind: 'parade', date: { month: 3, weekday: 0, nth: 1 }, start: 10, end: 16,
    route: [[0, -105], [0, -300]], theme: 'pastel', mood: 10, experience: 'easter-bonnets',
    desc: 'Outrageous hats stroll up Fifth Avenue by St. Patrick’s Cathedral.',
  },
  {
    id: 'cherry-blossoms', name: 'Cherry Blossom Weekend', kind: 'festival', date: { month: 3, weekday: 6, nth: 3 }, start: 10, end: 18,
    at: [2250, 2560], radius: 120, theme: 'blossom', mood: 12, experience: 'cherry-blossoms',
    desc: 'Pink canopies in Prospect Park and picnics everywhere. Spring has arrived.',
  },
  {
    id: 'fleet-week', name: 'Fleet Week', kind: 'fleet', date: { month: 4, weekday: 3, nth: -1 }, start: 9, end: 20, duration: 4,
    at: [-820, 300], radius: 200, mood: 8, experience: 'fleet-week',
    desc: 'Navy ships dock on the Hudson and sailors in dress whites flood Times Square.',
  },
  {
    id: 'puerto-rican-day', name: 'Puerto Rican Day Parade', kind: 'parade', date: { month: 5, weekday: 0, nth: 2 }, start: 11, end: 17,
    route: [[0, -45], [0, -750]], theme: 'puerto-rico', mood: 14, experience: 'pr-parade',
    desc: 'Flags, salsa and floats up Fifth Avenue — one of the biggest parties of the year.',
  },
  {
    id: 'pride', name: 'NYC Pride March', kind: 'parade', date: { month: 5, weekday: 0, nth: -1 }, start: 12, end: 19,
    route: [[0, 400], [0, 790], [-220, 790]], theme: 'rainbow', mood: 18, experience: 'pride',
    desc: 'Rainbow floats down Fifth Avenue to Stonewall. Everyone is welcome.',
  },
  {
    id: 'july-4', name: 'Fourth of July Fireworks', kind: 'fireworks', date: { month: 6, day: 4 }, start: 21.2, end: 22,
    at: [700, 900], radius: 900, mood: 18, experience: 'fireworks',
    desc: 'The big show over the East River. Find a rooftop or the waterfront early.',
  },
  {
    id: 'west-indian-day', name: 'West Indian Day Parade', kind: 'parade', date: { month: 8, weekday: 1, nth: 1 }, start: 11, end: 18,
    route: [[2760, 2500], [1960, 2500]], theme: 'caribbean', mood: 16, experience: 'west-indian-day',
    desc: 'Steel pans, feathers and jerk smoke along Eastern Parkway for Labor Day.',
  },
  {
    id: 'san-gennaro', name: 'Feast of San Gennaro', kind: 'fair', date: { month: 8, day: 14 }, start: 11, end: 23, duration: 4,
    route: [[100, 1140], [100, 1000]], theme: 'italian', mood: 12, experience: 'san-gennaro',
    desc: 'Eleven days of cannoli, sausage-and-peppers and lights over Mulberry Street.',
  },
  {
    id: 'halloween', name: 'Village Halloween Parade', kind: 'parade', date: { month: 9, day: 31 }, start: 19, end: 23,
    route: [[-110, 1070], [-110, 600]], theme: 'halloween', mood: 18, experience: 'halloween',
    desc: 'Fifty thousand costumed New Yorkers march up Sixth Avenue. Anyone in costume can join.',
  },
  {
    id: 'marathon', name: 'NYC Marathon', kind: 'marathon', date: { month: 10, weekday: 0, nth: 1 }, start: 9, end: 15,
    route: [[510, -300], [510, -1400], [0, -1400], [0, -500], [-160, -380]], theme: 'marathon', mood: 12, experience: 'marathon',
    desc: '50,000 runners, 26.2 miles, and the loudest cheering section on First Avenue.',
  },
  {
    id: 'thanksgiving', name: 'Thanksgiving Day Parade', kind: 'parade', date: { month: 10, weekday: 4, nth: 4 }, start: 9, end: 12,
    route: [[-330, -720], [-330, -360], [-110, -300], [-110, 200]], theme: 'balloons', balloons: true, mood: 20, experience: 'thanksgiving',
    desc: 'Giant balloons float down Central Park West and Sixth Avenue.',
  },
  {
    id: 'tree-lighting', name: 'Rockefeller Tree Lighting', kind: 'festival', date: { month: 11, weekday: 3, nth: 1 }, start: 19, end: 22,
    at: [-35, -137], radius: 80, theme: 'holiday', mood: 16, experience: 'tree-lighting',
    desc: 'Fifty thousand LEDs flicker on at once. The crowd sings. Everyone cries a little.',
  },
  {
    id: 'holiday-market', name: 'Holiday Market', kind: 'market', date: { month: 11, day: 1 }, start: 10, end: 21, duration: 30,
    at: [120, 616], radius: 50, theme: 'holiday', mood: 6, experience: 'holiday-market',
    desc: 'Red-and-white stalls fill Union Square with ornaments, mulled cider and gifts.',
  },
  {
    id: 'nye', name: "New Year's Eve Ball Drop", kind: 'balldrop', date: { month: 11, day: 31 }, start: 22, end: 24.5,
    at: [-205, -40], radius: 140, theme: 'nye', mood: 24, experience: 'ball-drop',
    desc: 'A million people, one glowing ball, and confetti at midnight in Times Square.',
  },
];

// Recurring weekly events (seasonal).
export const RECURRING_EVENTS = [
  { id: 'greenmarket', name: 'Union Square Greenmarket', kind: 'market', weekdays: [1, 3, 5, 6], start: 8, end: 18, at: [120, 616], radius: 45, mood: 4, desc: 'Farmers from upstate selling apples, cider donuts and flowers.' },
  { id: 'gap-market', name: 'Grand Army Plaza Greenmarket', kind: 'market', weekdays: [6], start: 8, end: 16, at: [2010, 2395], radius: 40, mood: 4, desc: 'Saturday farmers market at the gates of Prospect Park.' },
  { id: 'summerstage', name: 'SummerStage Concert', kind: 'concert', seasons: ['summer'], weekdays: [5, 6], start: 19, end: 22, at: [-90, -600], radius: 60, mood: 16, experience: 'summerstage', desc: 'Free outdoor concert in Central Park. Bring a blanket.' },
  { id: 'bryant-movies', name: 'Bryant Park Movie Night', kind: 'movie', seasons: ['summer'], weekdays: [1], start: 20, end: 22.5, at: [-75, 46], radius: 40, mood: 12, experience: 'park-movie', desc: 'A classic film on the lawn, surrounded by skyscrapers.' },
  { id: 'celebrate-brooklyn', name: 'Celebrate Brooklyn!', kind: 'concert', seasons: ['summer'], weekdays: [4, 6], start: 19, end: 22, at: [2140, 2560], radius: 60, mood: 16, experience: 'summerstage', desc: 'Outdoor concert at the Prospect Park Bandshell.' },
  { id: 'shakespeare', name: 'Shakespeare in the Park', kind: 'theater', seasons: ['summer'], weekdays: [2, 3, 4, 5], start: 20, end: 23, at: [-200, -815], radius: 40, mood: 16, experience: 'shakespeare', desc: 'Free Shakespeare at the Delacorte. The line forms at dawn.' },
  { id: 'jazz-wsp', name: 'Jazz in Washington Square', kind: 'concert', seasons: ['spring', 'summer', 'fall'], weekdays: [0, 6], start: 14, end: 18, at: [-15, 825], radius: 40, mood: 8, desc: 'A brass band by the fountain draws a crowd.' },
  { id: 'smorgasburg', name: 'Smorgasburg', kind: 'fair', seasons: ['spring', 'summer', 'fall'], weekdays: [6], start: 11, end: 18, at: [915, 1100], radius: 50, mood: 10, experience: 'smorgasburg', desc: '100 food vendors on the Williamsburg waterfront. Come hungry.' },
  { id: 'wollman', name: 'Ice Skating at Wollman Rink', kind: 'skating', seasons: ['winter'], weekdays: [0, 1, 2, 3, 4, 5, 6], start: 10, end: 22, at: [-90, -430], radius: 40, mood: 10, experience: 'skating', desc: 'Skate under the skyline at the south end of Central Park.' },
];

export const PROTEST_CAUSES = [
  'Fair Rent Now', 'Fund Our Libraries', 'Climate Action March', 'Workers’ Rights Rally', 'Safe Streets for Cyclists', 'Fund Our Schools',
  'Save the Neighborhood Garden', 'Better Subways Now', 'Healthcare for All Rally', 'Stop the Luxury Rezoning',
];

export const PROTEST_SITES = [
  { name: 'Union Square', at: [120, 616], route: [[160, 640], [160, 200]] },
  { name: 'City Hall', at: [-28, 1560], route: [[20, 1490], [20, 1140]] },
  { name: 'Washington Square', at: [-15, 825], route: [[0, 790], [0, 450]] },
  { name: 'Times Square', at: [-205, -40], route: [[-220, 15], [-220, -300]] },
  { name: 'Grand Army Plaza', at: [2010, 2395], route: [[1960, 2360], [1960, 2780]] },
  { name: 'Foley Square', at: [-60, 1420], route: [[-60, 1420], [-60, 1140]] },
];

export const RANDOM_EVENT_TEMPLATES = [
  { kind: 'protest', weight: 1.2, hours: [11, 17], duration: [2, 3.5] },
  { kind: 'streetfair', weight: 1.2, seasons: ['spring', 'summer', 'fall'], weekend: true, hours: [11, 12], duration: [6, 7] },
  { kind: 'filming', weight: 1.4, hours: [8, 20], duration: [3, 6] },
  { kind: 'blockparty', weight: 1.0, seasons: ['summer'], weekend: true, hours: [13, 15], duration: [5, 6] },
  { kind: 'popupconcert', weight: 0.8, seasons: ['spring', 'summer', 'fall'], hours: [16, 19], duration: [2, 3] },
];

export const INCIDENT_TEMPLATES = [
  { kind: 'accident', weight: 1, duration: [0.6, 1.4] },
  { kind: 'subwayDelay', weight: 1.4, duration: [1, 3] },
  { kind: 'waterMain', weight: 0.25, duration: [2, 5] },
];

export const SUBWAY_DELAY_REASONS = [
  'signal problems', 'a sick passenger', 'track maintenance', 'an earlier incident', 'police activity', 'a train with mechanical problems',
  'a switch problem', 'debris on the tracks',
];

export const FILMING_SHOWS = ['Law & Order: Special Pigeons Unit', 'Gossip Stoop', 'Succession (The Musical)', 'Broad City Limits', 'Blue Bloods & Bagels', 'Only Murders in the Bodega', 'Sex and the Subway'];
