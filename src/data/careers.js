// Careers, ladders, employers, courses and interview questions.
// Salaries are annual USD (2026-ish NYC). Days = weekday indexes (0 = Sunday).

export const SKILLS = {
  service: 'Service',
  tech: 'Tech',
  finance: 'Finance',
  care: 'Care',
  trades: 'Trades',
  creative: 'Creative',
  teaching: 'Teaching',
};

export const SCHEDULES = {
  office: { label: 'Mon–Fri, 9 AM – 5 PM', days: [1, 2, 3, 4, 5], start: 9, end: 17 },
  finance: { label: 'Mon–Fri, 8 AM – 6:30 PM', days: [1, 2, 3, 4, 5], start: 8, end: 18.5 },
  early: { label: 'Wed–Sun, 6:30 AM – 2:30 PM', days: [0, 3, 4, 5, 6], start: 6.5, end: 14.5 },
  retail: { label: 'Thu–Mon, 10 AM – 6 PM', days: [0, 1, 4, 5, 6], start: 10, end: 18 },
  late: { label: 'Tue–Sat, 3 PM – 11 PM', days: [2, 3, 4, 5, 6], start: 15, end: 23 },
  hospital: { label: 'Mon, Wed, Sat — 7 AM – 7 PM', days: [1, 3, 6], start: 7, end: 19 },
  school: { label: 'Mon–Fri, 7:45 AM – 3:15 PM', days: [1, 2, 3, 4, 5], start: 7.75, end: 15.25 },
  construction: { label: 'Mon–Fri, 7 AM – 3:30 PM', days: [1, 2, 3, 4, 5], start: 7, end: 15.5 },
  creative: { label: 'Mon–Fri, 10 AM – 6 PM', days: [1, 2, 3, 4, 5], start: 10, end: 18 },
  hotel: { label: 'Fri–Tue, 7 AM – 3 PM', days: [0, 1, 2, 5, 6], start: 7, end: 15 },
};

export const CAREERS = {
  food: {
    name: 'Food & Beverage',
    skill: 'service',
    icon: '☕',
    levels: [
      { title: 'Barista', salary: 37000, skill: 0, days: 0, schedule: 'early' },
      { title: 'Line Cook', salary: 44000, skill: 10, days: 8, schedule: 'late' },
      { title: 'Sous Chef', salary: 62000, skill: 28, days: 20, schedule: 'late' },
      { title: 'Head Chef', salary: 86000, skill: 50, days: 35, schedule: 'late' },
      { title: 'Executive Chef', salary: 125000, skill: 72, days: 50, schedule: 'late' },
    ],
  },
  retail: {
    name: 'Retail',
    skill: 'service',
    icon: '🛍️',
    levels: [
      { title: 'Sales Associate', salary: 36000, skill: 0, days: 0, schedule: 'retail' },
      { title: 'Key Holder', salary: 41000, skill: 8, days: 8, schedule: 'retail' },
      { title: 'Assistant Manager', salary: 55000, skill: 22, days: 18, schedule: 'retail' },
      { title: 'Store Manager', salary: 78000, skill: 42, days: 32, schedule: 'retail' },
      { title: 'District Manager', salary: 118000, skill: 65, days: 50, schedule: 'office' },
    ],
  },
  tech: {
    name: 'Tech',
    skill: 'tech',
    icon: '💻',
    levels: [
      { title: 'IT Support Technician', salary: 62000, skill: 5, days: 0, schedule: 'office' },
      { title: 'Junior Developer', salary: 98000, skill: 25, days: 12, schedule: 'office', cert: ['bootcamp', 'degree'] },
      { title: 'Software Engineer', salary: 148000, skill: 45, days: 25, schedule: 'office' },
      { title: 'Senior Engineer', salary: 192000, skill: 65, days: 40, schedule: 'office' },
      { title: 'Engineering Manager', salary: 245000, skill: 80, days: 60, schedule: 'office' },
    ],
  },
  finance: {
    name: 'Finance',
    skill: 'finance',
    icon: '📈',
    levels: [
      { title: 'Bank Teller', salary: 41000, skill: 0, days: 0, schedule: 'office' },
      { title: 'Financial Analyst', salary: 105000, skill: 20, days: 12, schedule: 'finance', cert: ['degree'] },
      { title: 'Associate', salary: 165000, skill: 42, days: 28, schedule: 'finance', cert: ['degree'] },
      { title: 'Vice President', salary: 245000, skill: 62, days: 45, schedule: 'finance', cert: ['degree'] },
      { title: 'Managing Director', salary: 420000, skill: 82, days: 65, schedule: 'finance', cert: ['degree'] },
    ],
  },
  healthcare: {
    name: 'Healthcare',
    skill: 'care',
    icon: '🩺',
    levels: [
      { title: 'Home Health Aide', salary: 38000, skill: 0, days: 0, schedule: 'hospital' },
      { title: 'Nursing Assistant (CNA)', salary: 47000, skill: 10, days: 6, schedule: 'hospital', cert: ['cna', 'rn'] },
      { title: 'Registered Nurse', salary: 118000, skill: 30, days: 12, schedule: 'hospital', cert: ['rn'] },
      { title: 'Charge Nurse', salary: 138000, skill: 50, days: 30, schedule: 'hospital', cert: ['rn'] },
      { title: 'Nurse Manager', salary: 165000, skill: 70, days: 45, schedule: 'office', cert: ['rn'] },
    ],
  },
  education: {
    name: 'Education',
    skill: 'teaching',
    icon: '🍎',
    levels: [
      { title: 'Teaching Assistant', salary: 36000, skill: 0, days: 0, schedule: 'school' },
      { title: 'Substitute Teacher', salary: 52000, skill: 8, days: 5, schedule: 'school', cert: ['degree'] },
      { title: 'Teacher', salary: 72000, skill: 25, days: 12, schedule: 'school', cert: ['teaching'] },
      { title: 'Lead Teacher', salary: 98000, skill: 45, days: 30, schedule: 'school', cert: ['teaching'] },
      { title: 'Assistant Principal', salary: 150000, skill: 68, days: 50, schedule: 'school', cert: ['teaching'] },
    ],
  },
  construction: {
    name: 'Construction',
    skill: 'trades',
    icon: '🏗️',
    levels: [
      { title: 'Laborer', salary: 48000, skill: 0, days: 0, schedule: 'construction' },
      { title: 'Apprentice Electrician', salary: 58000, skill: 10, days: 8, schedule: 'construction', cert: ['electrician'] },
      { title: 'Journeyman Electrician', salary: 98000, skill: 38, days: 25, schedule: 'construction', cert: ['electrician'] },
      { title: 'Foreman', salary: 128000, skill: 58, days: 40, schedule: 'construction' },
      { title: 'Superintendent', salary: 158000, skill: 78, days: 55, schedule: 'construction' },
    ],
  },
  creative: {
    name: 'Creative & Media',
    skill: 'creative',
    icon: '🎨',
    levels: [
      { title: 'Production Assistant', salary: 38000, skill: 0, days: 0, schedule: 'creative' },
      { title: 'Junior Designer', salary: 60000, skill: 18, days: 10, schedule: 'creative' },
      { title: 'Designer', salary: 84000, skill: 38, days: 25, schedule: 'creative' },
      { title: 'Art Director', salary: 128000, skill: 60, days: 40, schedule: 'creative' },
      { title: 'Creative Director', salary: 188000, skill: 80, days: 60, schedule: 'creative' },
    ],
  },
  hospitality: {
    name: 'Hospitality',
    skill: 'service',
    icon: '🛎️',
    levels: [
      { title: 'Front Desk Agent', salary: 45000, skill: 0, days: 0, schedule: 'hotel' },
      { title: 'Concierge', salary: 56000, skill: 12, days: 8, schedule: 'hotel' },
      { title: 'Guest Services Manager', salary: 74000, skill: 28, days: 20, schedule: 'hotel' },
      { title: 'Hotel Manager', salary: 108000, skill: 50, days: 35, schedule: 'office' },
      { title: 'General Manager', salary: 165000, skill: 72, days: 55, schedule: 'office' },
    ],
  },
};

// Employers. `near` = approximate world position; cityModel assigns the nearest building.
// `at` = landmark id to use instead. `levels` = positions they hire for directly.
export const EMPLOYERS = [
  { id: 'bean-there', name: 'Bean There Coffee', career: 'food', near: [60, 330], levels: [0, 1], kind: 'shop', blurb: 'Third-wave coffee with a line out the door at 8:45.' },
  { id: 'vinnys', name: "Vinny's Slice House", career: 'food', near: [400, 800], levels: [0, 1, 2], kind: 'shop', blurb: 'Coal oven, cash-friendly, open until 3am.' },
  { id: 'il-vicolo', name: 'Il Vicolo', career: 'food', near: [-330, 870], levels: [0, 1, 2, 3], kind: 'shop', blurb: 'A candlelit West Village trattoria with a 3-week waitlist.' },
  { id: 'gilded-fork', name: 'The Gilded Fork', career: 'food', near: [-420, 1320], levels: [1, 2, 3, 4], kind: 'shop', blurb: 'Two Michelin stars and a tasting menu that changes weekly.' },
  { id: 'starlite', name: 'Starlite Diner', career: 'food', near: [1300, -800], levels: [0, 1, 2], kind: 'shop', blurb: 'Astoria institution. Pancakes the size of hubcaps.' },
  { id: 'smokehouse', name: 'Smokehouse Brooklyn', career: 'food', near: [1250, 1120], levels: [0, 1, 2, 3], kind: 'shop', blurb: 'Brisket, picnic tables and a Sunday blues brunch.' },
  { id: 'fifth-main', name: 'Fifth & Main', career: 'retail', near: [20, -60], levels: [0, 1, 2, 3, 4], kind: 'office', blurb: 'Flagship department store. The holiday windows are famous.' },
  { id: 'bowery-threads', name: 'Bowery Threads', career: 'retail', near: [-250, 1100], levels: [0, 1, 2, 3], kind: 'shop', blurb: 'Streetwear boutique with sneaker drops that shut down the block.' },
  { id: 'greenway', name: 'Greenway Grocers', career: 'retail', near: [1560, 2560], levels: [0, 1, 2, 3], kind: 'shop', blurb: 'Neighborhood grocery with the best produce section in Park Slope.' },
  { id: 'bits-bytes', name: 'Bits & Bytes', career: 'retail', near: [1450, 2100], levels: [0, 1, 2], kind: 'shop', blurb: 'Electronics and repairs; the staff fixes everyone’s cracked screens.' },
  { id: 'loop-labs', name: 'Loop Labs', career: 'tech', near: [-60, 480], levels: [0, 1, 2, 3], kind: 'office', blurb: 'Series B startup building scheduling software. Kombucha on tap.' },
  { id: 'brickwork', name: 'Brickwork Software', career: 'tech', near: [1110, 1780], levels: [1, 2, 3, 4], kind: 'office', blurb: 'Developer tools company in a converted DUMBO warehouse.' },
  { id: 'pigeon-ai', name: 'Pigeon AI', career: 'tech', near: [-640, 160], levels: [1, 2, 3, 4], kind: 'office', blurb: 'Machine learning for logistics. Their mascot is, yes, a pigeon.' },
  { id: 'bodega-cloud', name: 'Bodega Cloud', career: 'tech', near: [1150, 220], levels: [0, 1, 2], kind: 'office', blurb: 'Point-of-sale software for corner stores, built by kids of bodega owners.' },
  { id: 'knickerbocker', name: 'Knickerbocker Bank', career: 'finance', near: [-100, -250], levels: [0, 1], kind: 'office', blurb: 'A 150-year-old New York bank with marble floors.' },
  { id: 'brightline', name: 'Brightline Capital', career: 'finance', at: 'one-wtc', levels: [1, 2, 3, 4], kind: 'office', blurb: 'Asset manager on the 64th floor of One World Trade.' },
  { id: 'hudson-pierce', name: 'Hudson & Pierce', career: 'finance', near: [160, -250], levels: [1, 2, 3, 4], kind: 'office', blurb: 'Investment bank on Park Avenue. Long hours, big bonuses.' },
  { id: 'atlas-trust', name: 'Atlas Trust', career: 'finance', near: [-150, 1860], levels: [0, 1, 2, 3], kind: 'office', blurb: 'Custody bank a block from the Stock Exchange.' },
  { id: 'mercy-hudson', name: 'Mercy Hudson Hospital', career: 'healthcare', near: [-500, 350], levels: [0, 1, 2, 3, 4], kind: 'office', blurb: 'Level 1 trauma center on the West Side.' },
  { id: 'prospect-general', name: 'Prospect General Hospital', career: 'healthcare', near: [1700, 2800], levels: [0, 1, 2, 3], kind: 'office', blurb: 'Community hospital beside Prospect Park.' },
  { id: 'astoria-clinic', name: 'Astoria Family Clinic', career: 'healthcare', near: [1500, -700], levels: [0, 1, 2], kind: 'shop', blurb: 'Neighborhood clinic that speaks eleven languages.' },
  { id: 'harlem-care', name: 'Harlem Home Care', career: 'healthcare', near: [-150, -1600], levels: [0, 1], kind: 'shop', blurb: 'Home health agency serving uptown seniors.' },
  { id: 'harbor-school', name: 'PS 312 Harbor School', career: 'education', near: [450, 1250], levels: [0, 1, 2, 3], kind: 'office', blurb: 'Public elementary school with a rooftop garden.' },
  { id: 'bushwick-academy', name: 'PS 187 Bushwick Academy', career: 'education', near: [2200, 1200], levels: [0, 1, 2, 3, 4], kind: 'office', blurb: 'Bilingual public school; the art program is legendary.' },
  { id: 'riverside-prep', name: 'Riverside Prep', career: 'education', near: [-500, -1000], levels: [1, 2, 3, 4], kind: 'office', blurb: 'Private K-12 school on the Upper West Side.' },
  { id: 'five-boro-builders', name: 'Five Boro Builders', career: 'construction', near: [-570, 110], levels: [0, 1, 2, 3], kind: 'site', blurb: 'General contractor putting up the next Hudson Yards tower.' },
  { id: 'skyward', name: 'Skyward Construction', career: 'construction', near: [1250, 300], levels: [0, 1, 2, 3, 4], kind: 'site', blurb: 'High-rise builder behind half the LIC skyline.' },
  { id: 'kings-electric', name: 'Kings Electric', career: 'construction', near: [2000, 800], levels: [0, 1, 2], kind: 'shop', blurb: 'Union electrical contractor, family owned since 1961.' },
  { id: 'stoopside', name: 'Stoopside Studio', career: 'creative', near: [1150, 1600], levels: [0, 1, 2, 3], kind: 'office', blurb: 'Design agency for indie brands, with a studio dog named Biscuit.' },
  { id: 'hudson-media', name: 'Hudson Street Media', career: 'creative', near: [-560, 1360], levels: [0, 1, 2, 3, 4], kind: 'office', blurb: 'Magazine publisher and video studio in a Tribeca loft.' },
  { id: 'canal-gallery', name: 'Canal Street Gallery', career: 'creative', near: [-150, 1120], levels: [0, 1], kind: 'shop', blurb: 'Contemporary art gallery that hires artists as assistants.' },
  { id: 'grand-knickerbocker', name: 'The Grand Knickerbocker', career: 'hospitality', near: [-150, 100], levels: [0, 1, 2, 3, 4], kind: 'office', blurb: 'A 1920s grand hotel steps from Times Square.' },
  { id: 'bowery-loft', name: 'Bowery Loft Hotel', career: 'hospitality', near: [200, 1110], levels: [0, 1, 2], kind: 'office', blurb: 'Boutique hotel with a lobby bar full of musicians.' },
  { id: 'kent-ave-hotel', name: 'Kent Ave Hotel', career: 'hospitality', near: [1060, 960], levels: [0, 1, 2, 3], kind: 'office', blurb: 'Waterfront hotel with a rooftop pool and Manhattan views.' },
];

export const COURSES = [
  { id: 'bootcamp', name: 'Coding Bootcamp', skill: 'tech', gain: 22, cost: 2400, sessions: 8, cert: 'bootcamp', blurb: 'Evenings of JavaScript and existential dread. Graduates get Junior Developer interviews.' },
  { id: 'cna', name: 'CNA Certification', skill: 'care', gain: 12, cost: 1200, sessions: 6, cert: 'cna', blurb: 'Become a certified nursing assistant in six evenings.' },
  { id: 'rn', name: 'Nursing Program (ADN)', skill: 'care', gain: 25, cost: 6500, sessions: 18, cert: 'rn', requires: 'cna', blurb: 'The path to Registered Nurse. Requires a CNA first.' },
  { id: 'electrician', name: 'Electrician Apprenticeship Prep', skill: 'trades', gain: 15, cost: 900, sessions: 6, cert: 'electrician', blurb: 'Code, safety and wiring basics. Unlocks apprenticeships.' },
  { id: 'teaching', name: 'Teaching Certificate', skill: 'teaching', gain: 15, cost: 3000, sessions: 10, cert: 'teaching', requires: 'degree', blurb: 'State certification for classroom teachers. Requires a degree.' },
  { id: 'finmodel', name: 'Financial Modeling', skill: 'finance', gain: 18, cost: 1800, sessions: 8, cert: 'finmodel', blurb: 'Spreadsheets until you dream in cell references.' },
  { id: 'design', name: 'Graphic Design Certificate', skill: 'creative', gain: 18, cost: 1500, sessions: 8, cert: 'design', blurb: 'Typography, layout and a portfolio you can actually show.' },
  { id: 'hospitality', name: 'Hospitality Management', skill: 'service', gain: 12, cost: 800, sessions: 5, cert: 'hospitality', blurb: 'Front-of-house to back office. Helps service and hotel careers.' },
  { id: 'degree', name: "Bachelor's Degree (Night School)", skill: null, gain: 0, cost: 11500, sessions: 30, cert: 'degree', blurb: 'The long game. Opens finance, teaching and more.' },
];

export const COURSE_HOURS = { start: 18, end: 21, days: [1, 2, 3, 4] };

const Q = (q, a) => ({ q, a });
const A = (text, score) => ({ text, score });

export const INTERVIEW_QUESTIONS = {
  general: [
    Q('So — why do you want to work here?', [A('I’ve followed what you do for a while and I think I can help it grow.', 2), A('Honestly? Rent is due. But I work hard.', 1), A('My horoscope said "new beginnings."', 0)]),
    Q('Where do you see yourself in five years?', [A('Still learning, with more responsibility — ideally here.', 2), A('Somewhere with a dishwasher and in-unit laundry.', 1), A('In your chair, probably.', 0)]),
    Q('Tell me about a time things went wrong at work.', [A('I owned the mistake, fixed it and changed the process so it wouldn’t repeat.', 2), A('It wasn’t really my fault, but it got sorted.', 1), A('Things don’t go wrong when I’m around.', 0)]),
    Q('What’s your biggest weakness?', [A('I over-commit. I’ve started saying no to protect quality.', 2), A('Pizza. Specifically, the dollar slice.', 1), A('I’m too perfect.', 0)]),
    Q('How do you handle a packed schedule?', [A('I prioritize, communicate early, and ask for help when it matters.', 2), A('Lots of coffee.', 1), A('I don’t really do schedules.', 0)]),
  ],
  food: [
    Q('A customer says their latte is "too hot." What do you do?', [A('Apologize, offer to add some cold milk or remake it. Keep the line moving.', 2), A('Tell them to wait a minute.', 1), A('Explain the physics of coffee.', 0)]),
    Q('Friday dinner rush, the ticket rail is full. You…', [A('Stay calm, call back tickets, fire in order and communicate with the pass.', 2), A('Work faster and hope.', 1), A('Take a smoke break to reset.', 0)]),
  ],
  retail: [
    Q('A customer wants to return shoes they clearly wore in the rain.', [A('Stay friendly, explain the policy and offer an exchange or store credit option.', 2), A('Call the manager immediately.', 1), A('Tell them no and walk away.', 0)]),
  ],
  tech: [
    Q('The site goes down at 2 AM. What’s your first move?', [A('Check monitoring, roll back the latest deploy if it lines up, and communicate status.', 2), A('Restart servers until it works.', 1), A('Wait until morning — it’s probably fine.', 0)]),
    Q('How do you approach code review?', [A('Small PRs, clear context, and kind but specific feedback.', 2), A('I approve if the tests pass.', 1), A('I don’t like people reading my code.', 0)]),
  ],
  finance: [
    Q('Walk me through how the three financial statements connect.', [A('Net income flows to retained earnings and the cash flow statement; cash ties to the balance sheet.', 2), A('They’re all in the annual report.', 1), A('Balance is key. Like yoga.', 0)]),
    Q('Your model shows a deal won’t work, but the MD loves it.', [A('Present the numbers clearly with the assumptions that would need to change.', 2), A('Quietly tweak the growth rate.', 0), A('Say nothing — not my call.', 1)]),
  ],
  healthcare: [
    Q('A patient’s family member is angry about wait times.', [A('Listen, empathize, give them a real update and escalate if needed.', 2), A('Tell them everyone is waiting.', 1), A('Avoid eye contact until they leave.', 0)]),
  ],
  education: [
    Q('A student keeps disrupting class. What do you try?', [A('Talk one-on-one, find out what’s going on, set clear expectations together.', 2), A('Move their seat.', 1), A('Send them to the principal every time.', 0)]),
  ],
  construction: [
    Q('You notice a coworker without fall protection on the scaffold.', [A('Stop work, get them clipped in, report it to the foreman.', 2), A('Mention it at lunch.', 1), A('Not my business.', 0)]),
  ],
  creative: [
    Q('A client hates the concept you love.', [A('Ask what’s not working, find the goal underneath, and show options.', 2), A('Change it to whatever they want.', 1), A('Explain why they’re wrong.', 0)]),
  ],
  hospitality: [
    Q('A guest arrives but their room isn’t ready.', [A('Apologize, store their bags, offer a drink voucher and a clear ETA.', 2), A('Ask them to wait in the lobby.', 1), A('Suggest another hotel.', 0)]),
  ],
};

// Gig work (no application needed).
export const GIG = {
  name: 'DashRun',
  blurb: 'Deliver food on foot. Pick up at a restaurant, drop off before it gets cold. Paid per delivery + tips.',
  base: 3.5,
  perMeter: 0.009, // on game-meter distance (≈ $2.30 per real mile)
  tipRange: [1, 9],
};
