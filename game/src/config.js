// Tuning for Jet Point — Point to Point (v1).
// A jet flies point to point: take off from runway A, follow the lit route
// (waypoint rings + a heading bug), dodge traffic and weather, and land on
// runway B. Units are metres, seconds, degrees, knots where the HUD says so.
export const STEP = 1 / 60;
export const BEST_KEY = 'jet-point-best';

// Five legs, ONE map (v10: the user's 20:40 WIB correction — one GTA-style
// map for all legs, not five separate worlds). Each leg is a ROUTE inside
// the same map: it starts at the main airport (runway A) and lands on a
// strip in another district (runway B). start: [x, z] of runway A (map
// metres); heading: the leg direction in radians (0 = north, +pi/2 = east,
// -pi/2 = west) — runway A and B are both aligned with it. strip: the
// name of the landing strip. ridge: the distant-ridge palette for drawSky.
// wind: base wind vector (m/s) the gusts ride on. storm: rain + low cloud.
// traffic: how many other aircraft share the sky. weave: how far the route
// snakes sideways. ceiling: highest the jet may climb on this leg.
// ringBase: the base altitude (m) of the waypoint rings on this leg.
export const LEVELS = [
  {
    id: 1, name: 'Metro Hop', place: 'City — day, clear',
    sky: ['#2f6fd0', '#7fb2e5', '#bcd9f2'], sun: [0.78, 92], ridge: 'city',
    start: [0, 0], heading: 0, strip: 'Metro Field',
    wind: 4, gust: 3, storm: false, traffic: 6, weave: 400, ceiling: 320,
    time: 300, fogFar: 2600, ringBase: 140,
    note: 'Follow the route ribbon over downtown, land at Metro Field.',
  },
  {
    id: 2, name: 'Sunset Coast', place: 'Beach — golden hour',
    sky: ['#e8863a', '#f2a65e', '#ffd9a0'], sun: [0.2, 120], ridge: 'beach',
    start: [-150, -250], heading: -Math.PI / 2, strip: 'Island Strip',
    wind: 8, gust: 6, storm: false, traffic: 6, weave: 460, ceiling: 340,
    time: 300, fogFar: 2400, ringBase: 110,
    note: 'Coastline on your left, waypoints over the surf, land on the island.',
  },
  {
    id: 3, name: 'Storm Crossing', place: 'Open sea — thunderstorm',
    sky: ['#3a4552', '#5a6675', '#8a97a5'], sun: [0.5, 60], ridge: 'sea',
    start: [150, -250], heading: -Math.PI / 4, strip: 'North Island Strip',
    wind: 14, gust: 14, storm: true, traffic: 7, weave: 520, ceiling: 300,
    time: 330, fogFar: 1500, ringBase: 130,
    note: 'Rain, lightning and a rough sea. Fly the waypoints, stay dry.',
  },
  {
    id: 4, name: 'Alpine Pass', place: 'Mountains — high wind',
    sky: ['#4a7ec2', '#8fb4d8', '#d7e8f5'], sun: [0.82, 80], ridge: 'mountain',
    start: [-150, 250], heading: Math.PI / 4, strip: 'Alpine Strip',
    wind: 12, gust: 16, storm: false, traffic: 7, weave: 480, ceiling: 380,
    time: 330, fogFar: 2200, ringBase: 150,
    note: 'Peaks on both sides. The gusts will shove you — correct.',
  },
  {
    id: 5, name: 'Desert Dash', place: 'Desert — dusk, busy sky',
    sky: ['#c96a3a', '#e8a05e', '#f5cf9a'], sun: [0.15, 150], ridge: 'desert',
    start: [150, 250], heading: Math.PI / 2, strip: 'Desert Strip',
    wind: 10, gust: 9, storm: false, traffic: 8, weave: 460, ceiling: 340,
    time: 300, fogFar: 2300, ringBase: 110,
    note: 'Canyons below, six aircraft sharing the route.',
  },
  {
    id: 0, name: 'Free Roam', place: 'Adventure — the whole map',
    sky: ['#2f6fd0', '#7fb2e5', '#bcd9f2'], sun: [0.78, 92], ridge: 'city',
    start: [0, 0], heading: 0, strip: 'Main Airport',
    wind: 6, gust: 6, storm: false, traffic: 8, weave: 0, ceiling: 420,
    time: 600, fogFar: 2600, ringBase: 110,
    note: 'No fixed route. Explore, thread any waypoint, land when ready.',
  },
];

export const WORLD = {
  legLength: 5600, // metres from runway A to runway B
  ringCount: 7,
  ringRadius: 18,
  runwayLength: 900,
  runwayHalfWidth: 11,
  routeSpacing: 780,
};

export const JET = {
  minSpeed: 30, // m/s — below this the wing stops flying
  cruiseSpeed: 118,
  maxSpeed: 175,
  takeoffSpeed: 55,
  landingMaxSpeed: 78,
  landingMinSpeed: 32,
  maxBank: 1.0, // radians of visual bank
  turnRate: 0.55, // rad/s of heading at full bank
  maxClimb: 22, // m/s vertical
  maxSink: 26,
  startFuel: 100,
  fuelDrain: 0.70, // per second at cruise — a full leg now costs real fuel
  fuelDrainThrottle: 0.45, // extra per second at full throttle
  ringFuel: 2, // waypoints top up a little fuel, they no longer refill it
  minAltitude: 5, // m above terrain — any lower is a crash
};

export const SCORE = {
  ringCentre: 100,
  ringEdge: 50,
  ringNear: 15,
  nearMiss: 25,
  landing: 500,
  fuelBonusPerUnit: 5,
  timeBonusPerSecond: 4,
};

export const FIELD = { width: 1280, height: 720 };
export const HORIZON_Y = 330; // horizon line on the 1280x720 frame
export const FOCAL = 640; // pseudo-3D focal length in pixels
