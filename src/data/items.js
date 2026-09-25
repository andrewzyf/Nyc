// Inventory items. `use` describes what happens when used from the bag.
export const ITEMS = {
  sandwich: { name: 'Deli sandwich', icon: '🥪', desc: 'Turkey club, wrapped in paper.', use: { verb: 'Eat', satiety: 40, mood: 3, minutes: 10 } },
  bagel: { name: 'Bagel', icon: '🥯', desc: 'Everything bagel. Crumbs everywhere.', use: { verb: 'Eat', satiety: 25, mood: 3, minutes: 5 } },
  apple: { name: 'Apple', icon: '🍎', desc: 'The Big Apple, but small.', use: { verb: 'Eat', satiety: 10, mood: 1, minutes: 2 } },
  granola: { name: 'Granola bar', icon: '🍫', desc: 'For emergencies on the subway.', use: { verb: 'Eat', satiety: 12, mood: 1, minutes: 2 } },
  groceries: { name: 'Groceries', icon: '🛒', desc: 'Cook at home for a cheap, healthy meal.', use: { verb: 'Cook', satiety: 55, mood: 5, minutes: 40, needsHome: true } },
  umbrella: { name: 'Umbrella', icon: '☂️', desc: 'Keeps the rain off (and your mood up).', equip: 'umbrella' },
  coat: { name: 'Winter coat', icon: '🧥', desc: 'Puffer coat. Winter doesn’t bother you as much.', equip: 'coat' },
  suit: { name: 'Interview suit', icon: '👔', desc: 'Makes a strong first impression in interviews.', passive: true },
  laptop: { name: 'Laptop', icon: '💻', desc: 'Study at home or at cafes. Needed for some freelance work.', passive: true },
  headphones: { name: 'Headphones', icon: '🎧', desc: 'Commutes are nicer with a good playlist.', passive: true },
  guidebook: { name: 'Career guide', icon: '📘', desc: 'Read to improve the skill for your current (or dream) career.', use: { verb: 'Read', minutes: 90, skillBook: 5, mood: 1 } },
  novel: { name: 'Novel', icon: '📕', desc: 'A paperback for the subway.', use: { verb: 'Read', minutes: 60, mood: 10 } },
  flowers: { name: 'Bodega flowers', icon: '💐', desc: 'Brightens up any apartment.', use: { verb: 'Arrange', minutes: 5, mood: 8, needsHome: true } },
};
