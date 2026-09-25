// Vocabulary + rules for apartment listings.
export const UNIT_TYPES = {
  room: { label: 'Room in shared apt', short: 'Room', sqft: [90, 160], income: 30, roommates: [1, 3] },
  studio: { label: 'Studio', short: 'Studio', sqft: [300, 520], income: 40 },
  br1: { label: '1 Bedroom', short: '1BR', sqft: [520, 780], income: 40 },
  br2: { label: '2 Bedroom', short: '2BR', sqft: [760, 1080], income: 40 },
};

export const FEATURES = {
  good: ['Laundry in building', 'Dishwasher', 'Elevator', 'Roof access', 'Exposed brick', 'Hardwood floors', 'Sunny, south-facing', 'Pet friendly', 'Private balcony', 'Skyline view', 'Doorman', 'Gym in building', 'Renovated kitchen', 'Near the subway', 'Tree-lined block', 'Heat & hot water included'],
  bad: ['5th-floor walk-up', 'Tiny kitchen', 'Faces an air shaft', 'Radiator clanks all night', 'Above a bar', 'Shared bathroom', 'Mouse "sometimes"', 'Window AC only', 'Long walk to the subway', 'Bedroom fits a full bed (barely)'],
};

export const HEADLINES = [
  'Sun-drenched gem', 'Charming prewar', 'Cozy nook', 'Renovated beauty', 'Classic walk-up', 'Luxury living', 'Artist’s dream',
  'Steal of a deal', 'Quiet retreat', 'Lofty ceilings', 'Jewel box', 'Brownstone floor-through', 'True bargain', 'Bright & airy',
];

export const ROOMMATE_BLURBS = [
  'two friendly grad students who are never home',
  'a nurse on night shifts and a very quiet cat',
  'a stand-up comic (you will hear the material first)',
  'a bartender and a DJ — weekends are lively',
  'a couple who bake bread every Sunday',
  'a software engineer and a houseplant collection',
  'an actor between shows and their sourdough starter',
];

export const LANDLORDS = ['Stoop Realty', 'Five Boro Mgmt', 'Knickerbocker Properties', 'Kings County Living', 'Hudson Rentals', 'Sunnyside Homes', 'Big Apple Leasing'];

// Monthly utilities on top of rent, by unit type (heat often included in NYC).
export const UTILITIES = { room: 55, studio: 85, br1: 105, br2: 140 };
export const WINTER_HEAT_EXTRA = { room: 20, studio: 35, br1: 45, br2: 60 };

// NY law caps application fees at $20 and security deposits at one month's rent.
// The FARE Act (2025) means tenants generally no longer pay the landlord's broker fee.
export const APPLICATION_FEE = 20;
export const GUARANTOR_FEE_MONTHS = 0.8;
