// The Game: owns the renderer, world, simulation systems and the main loop.
// UI modules call the action methods here (buy, sleep, work, travel, sign lease...).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CityModel } from './world/cityModel.js';
import { CityMeshes } from './world/cityMeshes.js';
import { Landmarks } from './world/landmarkMeshes.js';
import { BridgeMeshes } from './world/bridgeMeshes.js';
import { Environment } from './world/environment.js';
import { WeatherFx } from './world/weatherFx.js';
import { Pedestrians } from './world/pedestrians.js';
import { Traffic } from './world/traffic.js';
import { EventFx } from './world/eventFx.js';
import { Markers } from './world/markers.js';
import { WORLD_UNIFORMS } from './world/materials.js';

import { Player } from './player/player.js';
import { CameraRig } from './player/cameraRig.js';
import { Input } from './player/input.js';
import { CharacterModel } from './player/characterModel.js';

import { Clock, TIME_SPEEDS } from './systems/clock.js';
import { Weather } from './systems/weather.js';
import { Economy } from './systems/economy.js';
import { Career, EMPLOYER_BY_ID } from './systems/career.js';
import { Housing, HOOD_BY_ID } from './systems/housing.js';
import { Needs } from './systems/needs.js';
import { Transit, STATION_BY_ID, BUS_BY_ID } from './systems/transit.js';
import { CityEvents } from './systems/cityEvents.js';
import { Gigs } from './systems/gigs.js';
import { Discovery } from './systems/discovery.js';
import { Inventory } from './systems/inventory.js';
import { writeSave, loadSettings, saveSettings } from './systems/save.js';

import { AudioEngine } from './audio/audio.js';
import { BACKGROUNDS } from './data/backgrounds.js';
import { PLACE_TYPES, SPECIAL_PLACES } from './data/places.js';
import { ITEMS } from './data/items.js';
import { COURSES, CAREERS } from './data/careers.js';
import { LANDMARKS } from './data/landmarks.js';
import { money, clockTime } from './core/format.js';
import { clamp } from './core/math.js';

const TITLE_FOCUS = new THREE.Vector3(-60, 0, 180);

function detectQuality() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.quality = this.settings.quality === 'auto' ? detectQuality() : this.settings.quality;
    this.mode = 'loading';
    this.busy = false;
    this.fpsSamples = [];
    this.pixelRatioTarget = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.75 : this.quality === 'medium' ? 1.35 : 1);
    this.pixelRatio = this.pixelRatioTarget;
    this.interactTarget = null;
    this.waypoint = null;
    this.markerList = [];
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this._eventSyncTimer = 0;
    this._hudTimer = 0;
    this._discoverTimer = 0;
    this._gigTimer = 0;
    this._near = [];
    this.elapsed = 0;
  }

  // ---------------------------------------------------------------------------
  async init(progress = () => {}) {
    const q = this.quality;
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'low', powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(this.pixelRatio);
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = q !== 'low';
    r.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 3000);
    window.addEventListener('resize', () => this._resize());

    await progress(0.05, 'Surveying the five boroughs…');
    this.model = new CityModel({ seed: 20260 }).generate();
    await progress(0.3, 'Pouring sidewalks & raising skyscrapers…');
    this.city = new CityMeshes(this.scene, this.model, { quality: q });
    await progress(0.55, 'Building landmarks & bridges…');
    this.landmarks = new Landmarks(this.scene, this.model);
    this.bridges = new BridgeMeshes(this.scene, this.model);
    await progress(0.7, 'Painting the sky…');
    this.env = new Environment(this.scene, r, { quality: q });
    this.weatherFx = new WeatherFx(this.scene);
    this.weatherFx.setPixelRatio(this.pixelRatio);
    this.weatherFx.setSteamSources(this.model.steamStacks);
    await progress(0.8, 'Filling the sidewalks with New Yorkers…');
    this.pedestrians = new Pedestrians(this.scene, this.model, { capacity: q === 'low' ? 110 : q === 'high' ? 300 : 210 });
    this.traffic = new Traffic(this.scene, this.model, { capacity: q === 'low' ? 30 : q === 'high' ? 80 : 55 });
    this.eventFx = new EventFx(this.scene, this.model);
    this.markers = new Markers(this.scene);
    this.rig = new CameraRig(this.camera, this.model);
    this.rig.sensitivity = this.settings.sensitivity;
    this.rig.invertY = this.settings.invertY;
    this.rig.autoFollow = this.settings.autoCamera;
    this._setupComposer();

    // A default clock/weather so the title screen has a living city
    this.clock = new Clock({ calendar: 'compact', minutes: Clock.fromDate('compact', 2026, 9, 3, 16 * 60 + 40) });
    this.weather = new Weather(this.clock, { seed: 7 });
    this.weather.state.segments = [{ kind: 'clear', start: this.clock.t - 60, end: this.clock.t + 10000, intensity: 0.5, wind: 3 }];

    await progress(0.92, 'Warming up the renderer…');
    this.renderer.compile(this.scene, this.camera);
    this._setupStudio();
    await progress(1, 'Ready');
    this.mode = 'title';
    this.last = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _setupComposer() {
    this.composer = null;
    if (this.quality !== 'high') return;
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.86);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.composer = c;
  }

  _setupStudio() {
    // Separate little scene for the character creator preview
    const s = new THREE.Scene();
    s.background = new THREE.Color('#e9e2d4');
    s.add(new THREE.HemisphereLight('#ffffff', '#c9b79a', 1.6));
    const key = new THREE.DirectionalLight('#fff4e0', 2.2);
    key.position.set(2, 4, 3);
    s.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#d8cfbe' }));
    s.add(floor);
    this.studio = { scene: s, camera: new THREE.PerspectiveCamera(30, 1, 0.1, 50), model: new CharacterModel(), rot: 0.4 };
    s.add(this.studio.model.root);
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  setQuality(q) {
    this.settings.quality = q;
    saveSettings(this.settings);
  }

  // ---------------------------------------------------------------------------
  // New game / load
  // ---------------------------------------------------------------------------
  newGame(profile) {
    const bg = BACKGROUNDS.find((b) => b.id === profile.background) || BACKGROUNDS[0];
    const startMonth = { spring: 2, summer: 5, fall: 8, winter: 11 }[profile.season || 'fall'];
    const startDay = profile.calendar === 'compact' ? 2 : { spring: 20, summer: 21, fall: 22, winter: 5 }[profile.season || 'fall'];
    this.profile = { ...profile, background: bg.id, startedAt: Date.now() };
    this.clock = new Clock({ calendar: profile.calendar || 'compact', minutes: Clock.fromDate(profile.calendar || 'compact', 2026, startMonth, startDay, 8 * 60 + 30), speed: this.settings.timeSpeed });
    this._createSystems(null);
    this.profile.startDay = this.clock.dayIndex;
    this.economy.state.cash = bg.money;
    if (bg.loans) this.economy.state.loans = bg.loans;
    this.career.state.education = bg.education;
    for (const [k, v] of Object.entries(bg.skills)) this.career.state.skills[k] = v;
    if (bg.education === 'degree') this.career.state.certs.push('degree');
    // Starting home
    const start = bg.start;
    let spawn = null;
    if (start.kind === 'hostel') {
      const hostel = this.model.pois.find((p) => p.type === 'hostel' && p.name === 'Big Apple Backpackers') || this.model.pois.find((p) => p.type === 'hostel');
      this.housing.setTemporary('hostel', { nights: start.nights, hostelPoi: hostel.id });
      spawn = { x: -314, z: 196 };
    } else {
      this.housing.setTemporary(start.kind, { near: start.near, days: start.days, host: start.host });
      const h = this.housing.home;
      spawn = { x: h.x, z: h.z };
    }
    // Optional pre-arranged job
    if (profile.startJob && CAREERS[profile.startJob]) {
      const emp = Object.values(EMPLOYER_BY_ID).find((e) => e.career === profile.startJob && e.levels.includes(0));
      if (emp) this.career.hire(emp.id, 0);
    }
    this.housing.refreshListings(true);
    this.events.planDay();
    this._startPlay(spawn.x, spawn.z, Math.PI);
    this.ui.toast(`Welcome to New York, ${profile.name}!`, { icon: '🗽', big: true });
    setTimeout(() => this.ui.toast(bg.greeting, { icon: '📍', duration: 9000 }), 1500);
    setTimeout(() => this.ui.toast('Press Tab (or tap the phone) to open your phone. M for the map, E to interact.', { icon: '📱', duration: 9000 }), 4000);
    this.discovery.log(this.clock.dayIndex, `Arrived in New York from ${profile.origin || 'somewhere else'}.`);
    this.save(true);
  }

  loadFromSave(save) {
    this.profile = save.profile;
    this.clock = new Clock({ calendar: save.clock.calendar, minutes: save.clock.t, speed: this.settings.timeSpeed });
    this._createSystems(save);
    this.events.planDay();
    this._startPlay(save.player.x, save.player.z, save.player.heading || 0);
    if (save.player.onBridge) this.player.onBridge = null;
    this.ui.toast(`Welcome back, ${this.profile.name}.`, { icon: '🗽' });
  }

  _createSystems(save) {
    const s = save || {};
    this.weather = new Weather(this.clock, { seed: (this.profile.startedAt || 1) & 0xffff, state: s.weather || null });
    this.economy = new Economy(this.clock, s.economy || null);
    this.career = new Career(this, s.career || null);
    this.housing = new Housing(this, s.housing || null);
    this.needs = new Needs(s.needs || null);
    this.transit = new Transit(this, s.transit || null);
    this.events = new CityEvents(this, s.events || null);
    this.gigs = new Gigs(this, s.gigs || null);
    this.discovery = new Discovery(s.discovery || null);
    this.inventory = new Inventory(s.inventory || null);
    this.waypoint = s.waypoint || null;
    this.clock.on('hour', (h) => this._onHour(h));
    this.clock.on('day', (d) => this._onDay(d));
  }

  _startPlay(x, z, heading) {
    if (!this.player) this.player = new Player(this.scene, this.model, this.profile.appearance);
    else this.player.setAppearance(this.profile.appearance);
    this.player.object.visible = true;
    this.player.teleport(x, z, heading);
    this.rig.yaw = heading;
    this.rig.focus.set(x, 1.5, z);
    this.rig.currentDistance = null;
    this.mode = 'play';
    this.pedestrians.clear();
    this.traffic.clear();
    this.city.update(x, z);
    this.city.setSeason(this.clock.season);
    this._lastPos = { x, z };
    this.ui.enterPlay();
    this._syncEvents(true);
    this._refreshMarkers();
  }

  serialize() {
    return {
      profile: this.profile,
      player: { x: this.player.pos.x, z: this.player.pos.z, heading: this.player.heading },
      clock: this.clock.serialize(),
      weather: this.weather.serialize(),
      economy: this.economy.serialize(),
      career: this.career.serialize(),
      housing: this.housing.serialize(),
      needs: this.needs.serialize(),
      transit: this.transit.serialize(),
      events: this.events.serialize(),
      gigs: this.gigs.serialize(),
      discovery: this.discovery.serialize(),
      inventory: this.inventory.serialize(),
      waypoint: this.waypoint,
    };
  }

  save(silent = false) {
    if (this.mode !== 'play') return false;
    // Never save while standing on a bridge mid-span; the player respawns at its end on load.
    const data = this.serialize();
    if (this.player.onBridge) {
      const b = this.player.onBridge;
      const p = this.model.bridgePoint(b, this.player.bridgeS < b.length / 2 ? 0 : b.length);
      data.player.x = p.x;
      data.player.z = p.z;
    }
    const ok = writeSave(data);
    if (!silent) this.ui.toast(ok ? 'Game saved.' : 'Saved for this session (browser storage unavailable).', { icon: '💾' });
    return ok;
  }

  // ---------------------------------------------------------------------------
  // Clock hooks
  // ---------------------------------------------------------------------------
  _onHour(h) {
    if (this.mode !== 'play') return;
    for (const m of this.events.hourly()) this.ui.toast(m.text, { icon: m.type === 'delay' ? '🚇' : '🚨', kind: 'news' });
    // Interview reminders
    for (const a of this.career.state.applications) {
      if (a.status !== 'interview') continue;
      const w = this.career.interviewWindow(a);
      const mins = w.at - this.clock.t;
      if (mins > 0 && mins <= 60) this.ui.toast(`Interview at ${EMPLOYER_BY_ID[a.employer].name} at ${clockTime(a.start)}. Don't be late!`, { icon: '💼' });
    }
    // Shift reminder
    const next = this.career.nextShift();
    if (next && next.day === this.clock.dayIndex) {
      const mins = next.start - this.clock.minuteOfDay;
      if (mins > 0 && mins <= 60) this.ui.toast(`Your shift at ${EMPLOYER_BY_ID[this.career.job.employer].name} starts at ${clockTime(next.start)}.`, { icon: '⏰' });
    }
    if (Math.round(h) === 18 && this.clock.weekday >= 1 && this.clock.weekday <= 4) {
      const enrolled = Object.entries(this.career.state.courses).find(([, st]) => !st.done);
      if (enrolled) this.ui.toast(`Class tonight: ${COURSES.find((c) => c.id === enrolled[0]).name} (6–9 PM at Borough Community College).`, { icon: '🎓' });
    }
  }

  _onDay(dayIndex) {
    if (this.mode !== 'play') return;
    const prev = dayIndex - 1;
    for (const m of this.career.dailyCheck(prev)) {
      this.ui.toast(m.text, { icon: m.type === 'fired' ? '📦' : '⚠️', duration: 8000 });
      if (m.pending > 0) {
        const last = this.career.state.history.at(-1);
        this.lastPaystub = this.economy.payroll(m.pending, last?.salary || 40000, `${EMPLOYER_BY_ID[last?.employer]?.name || 'Employer'} (final pay)`);
      }
    }
    const period = this.clock.calendar === 'compact' ? 5 : 14;
    const gross = this.career.payday(dayIndex, period);
    if (gross > 0) {
      const salary = this.career.salary() || 40000;
      const stub = this.economy.payroll(gross, salary, EMPLOYER_BY_ID[this.career.job?.employer]?.name || 'Employer');
      this.lastPaystub = stub;
      this.ui.toast(`Payday! ${money(stub.net, { cents: true })} deposited (gross ${money(stub.gross, { cents: true })}, taxes ${money(stub.withheld, { cents: true })}).`, { icon: '💵', kind: 'money' });
      this.audio.cash();
    }
    for (const m of this.housing.daily()) this.ui.toast(m.text, { icon: '🏠', duration: 8000 });
    const { day } = this.clock.date;
    if (day === 1) {
      for (const m of this.housing.monthly()) this.ui.toast(m.text, { icon: m.type === 'evicted' ? '📦' : '🏠', duration: 9000 });
      const bills = this.economy.monthlyBills();
      if (bills.length) this.ui.toast(`Monthly bills paid: ${bills.map((b) => `${b.name} ${money(b.amount)}`).join(', ')}.`, { icon: '🧾' });
      const interest = this.economy.accrueInterest();
      if (interest > 1) this.ui.toast(`Savings earned ${money(interest, { cents: true })} in interest.`, { icon: '🏦' });
    }
    this.events.planDay(dayIndex);
    this.housing.refreshListings();
    this.discovery.stat('daysInCity');
    if (this.clock.season !== this._season) {
      this._season = this.clock.season;
      this.city.setSeason(this._season);
      this.pedestrians.season = this._season;
      this.ui.toast(seasonGreeting(this._season), { icon: { spring: '🌸', summer: '☀️', fall: '🍂', winter: '❄️' }[this._season], big: true });
    }
    const today = this.events.state.today.filter((e) => e.source !== 'recurring').slice(0, 2);
    for (const e of today) this.ui.toast(`Today: ${e.name}. ${e.desc}`, { icon: '📰', kind: 'news', duration: 8000 });
    this.save(true);
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;
    try {
      this._update(dt);
      this._render();
    } catch (err) {
      console.error(err);
      if (!this._errorShown) {
        this._errorShown = true;
        this.ui?.toast(`Something went wrong: ${err.message}`, { icon: '⚠️' });
      }
    }
    this.input.endFrame();
    this._adaptResolution(dt);
  }

  _adaptResolution(dt) {
    if (this.mode !== 'play') return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length < 90) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples.length = 0;
    this.fps = 1 / avg;
    let pr = this.pixelRatio;
    if (avg > 1 / 40 && pr > 0.65) pr = Math.max(0.65, pr - 0.15);
    else if (avg < 1 / 58 && pr < this.pixelRatioTarget) pr = Math.min(this.pixelRatioTarget, pr + 0.1);
    if (pr !== this.pixelRatio) {
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.composer?.setPixelRatio?.(pr);
      this.weatherFx.setPixelRatio(pr);
    }
  }

  _render() {
    if (this.mode === 'creator') {
      const st = this.studio;
      const el = this.ui.creatorViewport();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const r = this.renderer;
      const size = r.getSize(new THREE.Vector2());
      r.setScissorTest(true);
      r.setViewport(rect.left, size.y - rect.bottom, rect.width, rect.height);
      r.setScissor(rect.left, size.y - rect.bottom, rect.width, rect.height);
      st.camera.aspect = rect.width / Math.max(1, rect.height);
      st.camera.updateProjectionMatrix();
      r.render(st.scene, st.camera);
      r.setScissorTest(false);
      r.setViewport(0, 0, size.x, size.y);
      return;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    WORLD_UNIFORMS.uTime.value += dt;
    if (this.mode === 'title' || this.mode === 'loading') {
      this.clock.advance(dt * 0.4);
      this.rig.orbit(dt, TITLE_FOCUS, 560, 230);
      this._updateWorld(dt, TITLE_FOCUS, false);
      return;
    }
    if (this.mode === 'creator') {
      const st = this.studio;
      st.rot += dt * 0.35;
      st.model.root.rotation.y = st.rot;
      st.model.animate(dt, 0);
      const h = st.model.appearance.height || 1;
      st.camera.position.set(0, 1.2 * h, 5.2);
      st.camera.lookAt(0, 0.95 * h, 0);
      return;
    }
    if (this.mode !== 'play') return;

    const blocking = this.ui.isBlocking();
    const frozen = this.busy || (blocking && this.settings.pauseInMenus);
    this.input.enabled = !blocking && !this.busy;

    // Camera look & zoom
    const look = this.input.consumeLook();
    const wheel = this.input.consumeWheel();
    if (!blocking) {
      this.rig.applyLook(look.dx, look.dy);
      if (wheel) this.rig.zoom(wheel);
      if (this.input.wasPressed('KeyQ')) this.rig.yaw += 0.35;
      if (this.input.wasPressed('KeyE') && !this.interactTarget) this.rig.yaw -= 0.35;
    }

    // Player
    const p = this.player;
    p.speedMul = this.needs.speedMultiplier() * (this.weather.state.snowCover > 0.5 ? 0.9 : 1);
    this._near.length = 0;
    this.pedestrians.obstaclesNear(p.pos.x, p.pos.z, 3, this._near);
    this.traffic.obstaclesNear(p.pos.x, p.pos.z, 6, this._near);
    p.dynamicObstacles = this._near;
    p.update(dt, this.input, this.rig.yaw, { firstPerson: this.rig.firstPerson });
    p.object.visible = !this.rig.firstPerson;
    const moved = Math.hypot(p.pos.x - this._lastPos.x, p.pos.z - this._lastPos.z);
    if (moved < 50) this.discovery.stat('walked', moved);
    this._lastPos = { x: p.pos.x, z: p.pos.z };

    // Time
    if (!frozen) {
      const mins = this.clock.tick(dt);
      this._simulate(mins, { asleep: false, running: p.speed > 5 });
    }

    // Camera
    this.rig.update(dt, p.pos, p.heading, { moving: p.speed > 0.5 });

    // Appearance: umbrella & coat
    const snap = this.weather.snapshot();
    const raining = snap.kind === 'rain' || snap.kind === 'storm';
    p.character.setUmbrella(raining && this.inventory.isEquipped('umbrella') && !p.onBridge);
    const wantCoat = this.inventory.isEquipped('coat') && snap.temperature < 52;
    if (wantCoat !== !!p.character.coatOn) p.character.setCoat(wantCoat, '#3b4a5a');

    this._updateWorld(dt, p.pos, true, snap);
    this._updateInteractions();
    this._periodic(dt);
  }

  _simulate(mins, { asleep = false, running = false, sleepQuality = 1, indoors = false } = {}) {
    if (mins <= 0) return;
    this.weather.update(mins);
    const snap = this.weather.snapshot();
    const temp = snap.temperature;
    const pos = this.player.pos;
    const inPark = !!this.model.parkAt(pos.x, pos.z);
    const day = this.env.state.night < 0.5;
    this.needs.update(mins, {
      asleep,
      sleepQuality,
      running,
      outdoors: !indoors && !asleep,
      raining: snap.kind === 'rain' || snap.kind === 'storm',
      umbrella: this.inventory.isEquipped('umbrella'),
      cold: temp < 38,
      coat: this.inventory.isEquipped('coat'),
      heat: temp > 88,
      niceOut: day && (snap.kind === 'clear' || snap.kind === 'cloudy') && temp > 55 && temp < 84,
      inPark,
      homeQuality: this.housing.qualityScore(),
      now: this.clock.t,
    });
    // Gig order expiry is soft (late deliveries just tip less)
  }

  _updateWorld(dt, focus, playing, snap = this.weather.snapshot()) {
    const clock = this.clock;
    const sun = clock.sun();
    WORLD_UNIFORMS.uSnow.value = snap.snowCover;
    WORLD_UNIFORMS.uWet.value = snap.wetness;
    this.env.update(dt, { minuteOfDay: clock.minuteOfDay, sunrise: sun.sunrise, sunset: sun.sunset, maxAlt: sun.maxAlt, weather: snap, focus, camera: this.camera });
    this.city.update(focus.x, focus.z);
    if (this._season !== clock.season) {
      this._season = clock.season;
      this.city.setSeason(this._season);
      this.pedestrians.season = this._season;
    }
    const date = clock.date;
    this.landmarks.update(dt, { month: date.month, day: date.day, minuteOfDay: clock.minuteOfDay, season: clock.season, totalMinutes: clock.t });
    this.weatherFx.update(dt, { camera: this.camera, weather: snap, temperature: snap.temperature });
    const night = this.env.state.night;
    this.pedestrians.update(dt, {
      player: playing ? this.player.pos : focus,
      minuteOfDay: clock.minuteOfDay,
      weather: snap,
      season: clock.season,
      temperature: snap.temperature,
      camera: this.camera,
      playerSpeed: playing ? this.player.speed : 0,
      eventNearby: this._eventNearby,
    });
    this.traffic.update(dt, {
      player: playing ? this.player.pos : { x: focus.x, y: 0, z: focus.z },
      timeSec: this.elapsed,
      onHonk: (x, z) => {
        if (!playing) return;
        const d = Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
        this.audio.horn(d);
      },
    });
    this.eventFx.update(dt, { night, minuteOfDay: clock.minuteOfDay });
    this.markers.update(dt, this.elapsed, this.camera.position);
    // Lightning
    if (snap.kind === 'storm') {
      this._lightning = (this._lightning ?? 6) - dt;
      if (this._lightning <= 0) {
        this._lightning = 5 + Math.random() * 14;
        this.env.flash();
        setTimeout(() => this.audio.thunder(), 400 + Math.random() * 1800);
      }
    }
    // Audio scene
    if (this.audio.ready) {
      const hood = this.model.hoodAt(focus.x, focus.z);
      const park = playing && this.model.parkAt(focus.x, focus.z);
      this.audio.setScene({
        density: hood.density,
        rain: this.weatherFx.rainAmt,
        wind: (snap.wind || 2) / 10 + (snap.kind === 'snow' ? 0.3 : 0),
        park: park ? 1 : hood.trees * 0.5,
        night,
        speed: playing ? this.player.speed : 0,
        surface: snap.snowCover > 0.3 ? 'snow' : park ? 'grass' : 'concrete',
        indoors: this.ui?.isBlocking?.() || false,
      });
      this.audio.update(dt);
    }
    // Events (every ~2s)
    this._eventSyncTimer -= dt;
    if (this._eventSyncTimer <= 0 && this.events) {
      this._eventSyncTimer = 2;
      this._syncEvents();
    }
  }

  _syncEvents(force = false) {
    if (!this.events || this.mode !== 'play') return;
    if (force) this.events.planDay();
    const crowd = this.eventFx.sync(this.events.active(), this.events.incidents());
    this.pedestrians.setAttractors(crowd.attractors);
    this.pedestrians.setMarchers(crowd.marchers);
    this.traffic.setClosures(crowd.closures);
  }

  _periodic(dt) {
    const p = this.player.pos;
    this._discoverTimer -= dt;
    if (this._discoverTimer <= 0) {
      this._discoverTimer = 0.5;
      for (const l of this.discovery.checkLandmarks(p.x, p.z)) {
        this.needs.apply({ mood: 6 });
        this.ui.discover(l);
        this.audio.achievement();
        this.discovery.log(this.clock.dayIndex, `Visited ${l.name}.`);
      }
      const hood = this.model.hoodAt(p.x, p.z);
      if (this.discovery.visitHood(hood.id) && !['manhattan', 'brooklyn', 'central-park'].includes(hood.id) && this.discovery.state.hoods.length > 1) {
        this.ui.toast(`${hood.name} — ${hood.vibe}`, { icon: '📍', kind: 'hood', duration: 6000 });
      }
      // Events
      const joined = this.events.checkParticipation(p.x, p.z);
      this._eventNearby = this.events.active().some((e) => e.at && Math.hypot(e.at[0] - p.x, e.at[1] - p.z) < 150);
      for (const e of joined) {
        this.needs.apply({ mood: e.mood });
        if (e.experience) this.discovery.experience(e.experience);
        this.ui.toast(`You joined: ${e.name}. ${e.desc}`, { icon: '🎉', kind: 'event', duration: 7000 });
        this.discovery.log(this.clock.dayIndex, `Joined ${e.name}.`);
        this.audio.achievement();
      }
      for (const w of this.needs.warnings()) this.ui.toast(w.text, { icon: w.icon, kind: 'need' });
      // Pass out from exhaustion (gentle)
      if (this.needs.energy <= 0.5 && !this.busy) this._passOut();
    }
    // Gig offers
    if (this.gigs.state.online && !this.gigs.order && !this.ui.pendingOffer) {
      this._gigTimer -= dt;
      if (this._gigTimer <= 0) {
        this._gigTimer = 6 + Math.random() * 8;
        const o = this.gigs.offer();
        if (o) this.ui.offerGig(o);
      }
    }
    this._hudTimer -= dt;
    if (this._hudTimer <= 0) {
      this._hudTimer = 0.25;
      this.ui.updateHud();
    }
    this.ui.updateFrame(dt);
  }

  // ---------------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------------
  dynamicInteractables() {
    const out = [];
    const h = this.housing.home;
    if (h && h.x != null && ['lease', 'sublet', 'couch', 'family'].includes(h.kind)) out.push({ id: 'home', kind: 'home', x: h.x, z: h.z, name: 'Home', label: 'Go inside — Home' });
    for (const l of this.housing.state.listings) out.push({ id: `view-${l.id}`, kind: 'listing', listing: l, x: l.x, z: l.z, name: l.address, label: `View apartment — ${l.address}, ${l.unit}`, radius: 2.4 });
    const o = this.gigs.order;
    if (o) {
      if (o.stage === 'pickup') out.push({ id: 'gig-pickup', kind: 'gig-pickup', x: o.pickup.x, z: o.pickup.z, label: `Pick up order for ${o.customer}`, priority: 2 });
      else out.push({ id: 'gig-drop', kind: 'gig-drop', x: o.dropoff.x, z: o.dropoff.z, label: `Deliver to ${o.customer}`, priority: 2 });
    }
    return out;
  }

  _updateInteractions() {
    const p = this.player.pos;
    let best = null;
    let bd = Infinity;
    const consider = (it, r) => {
      const d = Math.hypot(it.x - p.x, it.z - p.z) - (it.priority || 0);
      if (d < r && d < bd) {
        bd = d;
        best = it;
      }
    };
    if (!this.player.onBridge) {
      for (const poi of this.model.poisNear(p.x, p.z, 4)) consider(poi, poi.kind === 'subway' ? 3.4 : poi.kind === 'bus' ? 2.6 : 2.3);
      for (const it of this.dynamicInteractables()) if (Math.abs(it.x - p.x) < 6 && Math.abs(it.z - p.z) < 6) consider(it, it.radius || 2.4);
      // Park benches
      for (const b of this.model.benches) {
        if (Math.abs(b.x - p.x) < 2 && Math.abs(b.z - p.z) < 2) consider({ id: `bench-${b.x}`, kind: 'bench', x: b.x, z: b.z, label: 'Sit on the bench' }, 1.8);
      }
      // Events you can join more actively
      for (const e of this.events.active()) {
        if (!e.at || !['concert', 'festival', 'movie', 'theater', 'blockparty', 'skating'].includes(e.kind)) continue;
        if (Math.hypot(e.at[0] - p.x, e.at[1] - p.z) < (e.radius || 40) * 0.7) consider({ id: `ev-${e.key}`, kind: 'event', event: e, x: p.x, z: p.z, label: `${e.kind === 'skating' ? 'Go skating' : 'Stay for the show'} — ${e.name}` }, 50);
      }
    }
    this.interactTarget = best;
    if (best && best.kind !== 'event') this.markers.showRing(best.doorX ?? best.x, this.model.groundHeightAt(best.x, best.z), best.doorZ ?? best.z);
    else this.markers.hideRing();
    this.ui.setPrompt(best ? this.promptFor(best) : null);
    if (best && !this.ui.isBlocking() && !this.busy && (this.input.wasPressed('KeyE') || this.input.wasPressed('Enter'))) this.interact(best);
  }

  promptFor(it) {
    if (it.label) return it.label;
    if (it.kind === 'subway') return `Enter subway — ${it.name}`;
    if (it.kind === 'bus') return `Wait for the ${it.route} bus`;
    if (it.kind === 'work') return `${it.name}`;
    if (it.kind === 'place') {
      const def = it.special ? SPECIAL_PLACES[it.type] : PLACE_TYPES[it.type];
      const open = this.isOpen(it);
      return `${it.name}${open ? '' : ' (closed)'}`;
    }
    return it.name || 'Interact';
  }

  placeDef(poi) {
    if (poi.special || SPECIAL_PLACES[poi.type]) return SPECIAL_PLACES[poi.type];
    return PLACE_TYPES[poi.type];
  }

  isOpen(poi) {
    const def = this.placeDef(poi);
    if (!def?.hours) return true;
    if (def.seasons && !def.seasons.includes(this.clock.season)) return false;
    const [o, c] = def.hours;
    const h = this.clock.hour;
    if (c > 24) return h >= o || h < c - 24;
    return h >= o && h < c;
  }

  interact(it) {
    this.audio.init();
    this.audio.open();
    switch (it.kind) {
      case 'place':
      case 'landmark':
        return this.ui.showPlace(it);
      case 'work':
        return this.ui.showWorkplace(it);
      case 'subway':
        return this.ui.showSubway(it);
      case 'bus':
        return this.ui.showBus(it);
      case 'home':
        return this.ui.showHome();
      case 'listing':
        this.housing.markViewed(it.listing.id);
        return this.ui.showListing(it.listing, { inPerson: true });
      case 'gig-pickup':
        this.gigs.pickup();
        this.audio.notify();
        this.ui.toast(`Picked up: ${this.gigs.order.items}. Deliver to ${this.gigs.order.dropoff.address}.`, { icon: '🛵' });
        this._refreshMarkers();
        return;
      case 'gig-drop': {
        const r = this.gigs.deliver();
        if (r) {
          this.discovery.stat('deliveries');
          this.audio.cash();
          this.ui.toast(`Delivered! Earned ${money(r.total, { cents: true })}${r.late ? ' (late — smaller tip)' : ` incl. ${money(r.tip, { cents: true })} tip`}.`, { icon: '💵', kind: 'money' });
        }
        this._refreshMarkers();
        return;
      }
      case 'bench':
        return this.ui.showBench(it);
      case 'event':
        return this.ui.showEventJoin(it.event);
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  /** Skip game time with a fade; simulates needs/weather along the way. */
  async advanceTime(minutes, { asleep = false, sleepQuality = 1, label = '', indoors = true, fade = true } = {}) {
    if (minutes <= 0) return;
    this.busy = true;
    if (fade) await this.ui.fade(true, label);
    let left = minutes;
    while (left > 0) {
      const step = Math.min(30, left);
      this.clock.advance(step);
      this._simulate(step, { asleep, sleepQuality, indoors });
      left -= step;
    }
    this._syncEvents(true);
    if (fade) await this.ui.fade(false);
    this.busy = false;
    this.ui.updateHud();
  }

  applyEffects(e = {}) {
    this.needs.apply(e);
  }

  /** Buy/perform a place action. Returns {ok, msg}. */
  async doPlaceAction(poi, action) {
    if (!this.isOpen(poi)) return { ok: false, msg: 'They’re closed right now.' };
    if (action.requires && !this.inventory.has(action.requires)) return { ok: false, msg: `You need a ${ITEMS[action.requires].name.toLowerCase()} for that.` };
    if (action.seasons && !action.seasons.includes(this.clock.season)) return { ok: false, msg: 'Not this time of year.' };
    if (action.once === 'day') {
      const k = `${poi.id}-${action.id}-${this.clock.dayIndex}`;
      this._once = this._once || new Set();
      if (this._once.has(k)) return { ok: false, msg: 'You already did that today.' };
      this._once.add(k);
    }
    if (action.kind === 'sleep') return this.sleepAt(action.sleep, poi, action.price);
    if (action.kind === 'courses') {
      this.ui.showCourses(poi);
      return { ok: true, silent: true };
    }
    if (action.kind === 'lottery') {
      if (!this.economy.spend(action.price, 'Scratch-off ticket', 'fun')) return { ok: false, msg: 'Not enough cash.' };
      const r = Math.random();
      const win = r < 0.002 ? 1000 : r < 0.03 ? 20 : r < 0.18 ? 2 : 0;
      if (win) {
        this.economy.earn(win, 'Scratch-off winnings', 'fun');
        this.audio.cash();
      }
      return { ok: true, msg: win ? `You won ${money(win)}! ${win >= 1000 ? 'The whole bodega cheers.' : ''}` : 'Not a winner. The cat judges you silently.' };
    }
    const price = action.price || 0;
    if (price > 0 && !this.economy.spend(price, `${poi.name} — ${action.label}`, action.kind === 'food' || action.kind === 'drink' ? 'food' : action.kind)) {
      this.audio.error();
      return { ok: false, msg: 'Not enough money in checking.' };
    }
    if (price > 0) this.audio.cash();
    if (action.item) this.inventory.add(action.item, action.qty || 1);
    if (action.effects) this.applyEffects(action.effects);
    if (action.fitness) this.needs.apply({ fitness: action.fitness });
    if (action.skillStudy) {
      const skill = action.studySkill || this.studySkill();
      this.career.addSkill(skill, action.skillStudy);
    }
    if (action.jobBoost) this.career.state.jobBoostUntil = this.clock.t + 3 * 1440;
    if (action.kind === 'food') {
      this.discovery.stat('meals');
      if (/slice/i.test(action.label)) this.discovery.stat('slices');
    }
    if (action.id === 'pet-cat') this.discovery.stat('bodegaCats');
    if (action.experience) this.discovery.experience(action.experience);
    if (action.discover) {
      const l = this.discovery.discover(action.discover);
      if (l) setTimeout(() => this.ui.discover(l), 600);
    }
    if (action.bankAdvice) {
      this.ui.showAdvice();
      return { ok: true, silent: true };
    }
    if (action.caseworker) {
      this.ui.showCaseworker();
      return { ok: true, silent: true };
    }
    if (action.wardrobe || action.hair) {
      await this.advanceTime(action.minutes || 30, { label: action.label });
      this.ui.showWardrobe({ hairOnly: !!action.hair, clothesOnly: !!action.wardrobe });
      return { ok: true, silent: true };
    }
    if (action.minutes >= 25) await this.advanceTime(action.minutes, { label: `${action.label}…` });
    else if (action.minutes) {
      this.clock.advance(action.minutes);
      this._simulate(action.minutes, { indoors: true });
    }
    return { ok: true, msg: resultText(action) };
  }

  studySkill() {
    const j = this.career.job;
    if (j) return CAREERS[j.career].skill;
    const skills = this.career.state.skills;
    return Object.entries(skills).sort((a, b) => b[1] - a[1])[0][0];
  }

  useItem(id) {
    const it = ITEMS[id];
    if (!it?.use) return { ok: false };
    if (it.use.needsHome && !this.isAtHome()) return { ok: false, msg: 'You need a kitchen — do this at home.' };
    const u = it.use;
    this.inventory.remove(id);
    this.applyEffects({ satiety: u.satiety || 0, mood: u.mood || 0, energy: u.energy || 0 });
    if (u.skillBook) this.career.addSkill(this.studySkill(), u.skillBook);
    if (u.satiety) this.discovery.stat('meals');
    this.clock.advance(u.minutes || 5);
    this._simulate(u.minutes || 5, { indoors: true });
    return { ok: true, msg: `${u.verb === 'Cook' ? 'You cooked a meal at home.' : `${u.verb}: ${it.name}.`}` };
  }

  isAtHome() {
    const h = this.housing.home;
    if (!h || h.x == null) return false;
    return Math.hypot(h.x - this.player.pos.x, h.z - this.player.pos.z) < 6;
  }

  /** Sleep: at home (quality by apartment), hostel (pay), shelter (free), bench (poor). */
  async sleepAt(where, poi, price = 0, wakeMinute = 7 * 60) {
    const qualities = { home: 1.1, hostel: 0.85, shelter: 0.7, bench: 0.45, couch: 0.9, family: 1.0, sublet: 1.0, lease: 1.1 };
    let quality = qualities[where] ?? 1;
    if (where === 'home') {
      const h = this.housing.home;
      quality = qualities[h.kind] ?? 1;
      if (h.kind === 'lease') quality = 0.9 + (h.quality || 3) * 0.06;
    }
    if (where === 'hostel') {
      const h = this.housing.home;
      if (h.kind === 'hostel' && h.nights > 0 && h.poi === poi?.id) h.nights -= 1;
      else if (!this.economy.spend(price, `${poi?.name || 'Hostel'} — dorm bed`, 'housing')) return { ok: false, msg: 'Not enough money for a bed.' };
      if (h.kind !== 'lease' && h.kind !== 'sublet' && h.kind !== 'couch' && h.kind !== 'family') {
        this.housing.state.home = { ...h, kind: 'hostel', poi: poi?.id, x: poi?.x, z: poi?.z, address: poi?.address, nights: h.kind === 'hostel' ? h.nights : 0 };
      }
    }
    if (where === 'shelter' && !['lease', 'sublet', 'couch', 'family'].includes(this.housing.home.kind)) {
      this.housing.state.home = { kind: 'shelter', x: poi?.x, z: poi?.z, address: poi?.address };
    }
    const mins = Math.max(60, this.clock.minutesUntil(wakeMinute));
    const hours = mins / 60;
    await this.advanceTime(mins, { asleep: true, sleepQuality: quality, label: 'Sleeping…' });
    const mood = where === 'bench' ? -8 : where === 'shelter' ? -2 : 3;
    this.applyEffects({ mood });
    this.save(true);
    return { ok: true, msg: `You slept ${hours.toFixed(1)} hours. ${morningLine(this)}` };
  }

  async _passOut() {
    this.ui.toast('You’re so exhausted you nod off where you are…', { icon: '💤' });
    await this.advanceTime(180, { asleep: true, sleepQuality: 0.6, label: 'Passed out…' });
    this.applyEffects({ mood: -10 });
  }

  /** Work a shift. */
  async work(effort) {
    const status = this.career.shiftStatus();
    if (!status.can) return { ok: false, msg: status.reason };
    const res = this.career.workShift(effort, { mood: this.needs.mood, energy: this.needs.energy, satiety: this.needs.satiety });
    await this.advanceTime(res.minutes, { label: `Working (${effort === 'hard' ? 'going above & beyond' : effort === 'coast' ? 'coasting' : 'steady'})…`, indoors: true });
    this.applyEffects({ energy: -res.energyCost + (res.minutes / 60) * 3.4, satiety: -res.satietyCost + (res.minutes / 60) * 4.0, mood: res.moodDelta });
    this.discovery.stat('shifts');
    if (res.promoted) {
      this.audio.achievement();
      this.discovery.log(this.clock.dayIndex, `Promoted to ${res.promoted.title}!`);
    }
    return { ok: true, res };
  }

  applyForJob(employerId, level) {
    const app = this.career.apply(employerId, level);
    const poi = this.model.poiById.get(`work-${employerId}`);
    if (poi) this.setWaypoint({ x: poi.x, z: poi.z, label: `Interview: ${EMPLOYER_BY_ID[employerId].name}`, kind: 'interview' });
    return app;
  }

  // Travel ------------------------------------------------------------------------
  async rideSubway(fromId, toId) {
    const plan = this.transit.planSubway(fromId, toId);
    if (!plan) return { ok: false, msg: 'No route — service may be suspended.' };
    const fare = this.transit.payFare(`Subway — ${STATION_BY_ID[fromId].name}`);
    if (!fare) return { ok: false, msg: 'Not enough money for the fare.' };
    this.audio.chime();
    this.busy = true;
    await this.ui.subwayRide(plan);
    this.clock.advance(plan.minutes);
    this._simulate(plan.minutes, { indoors: true });
    const moodHit = plan.delays.length ? -3 : this.inventory.has('headphones') ? 2 : 0;
    this.applyEffects({ mood: moodHit });
    const e = this.model.poiById.get(`sub-${toId}`);
    this.player.teleport(e.x, e.z + 3.5, this.player.heading);
    this.pedestrians.clear();
    this.traffic.clear();
    this.transit.state.rides += 1;
    this.discovery.stat('subwayRides');
    this._syncEvents(true);
    await this.ui.fade(false);
    this.busy = false;
    return { ok: true, msg: `Arrived at ${STATION_BY_ID[toId].name}. ${fare.charged ? `Fare ${money(fare.charged, { cents: true })}` : 'Free ride — you hit the weekly fare cap!'}` };
  }

  async rideBus(routeId, fromStop, toStop) {
    const q = this.transit.busQuote(routeId, fromStop, toStop);
    const fare = this.transit.payFare(`${routeId} bus`);
    if (!fare) return { ok: false, msg: 'Not enough money for the fare.' };
    const route = BUS_BY_ID[routeId];
    await this.advanceTime(q.minutes, { label: `Riding the ${routeId} (${route.desc})…` });
    const stop = this.model.busStops.find((s) => s.route === routeId && s.stop === toStop);
    this.player.teleport(stop.x - 1.5, stop.z, this.player.heading);
    this.pedestrians.clear();
    this.traffic.clear();
    this.discovery.stat('busRides');
    return { ok: true, msg: `You got off the ${routeId}.` };
  }

  async takeTaxi(x, z, label) {
    const p = this.player.pos;
    const q = this.transit.taxiQuote(p.x, p.z, x, z);
    if (!this.economy.spend(q.total, `Taxi to ${label}`, 'transit')) return { ok: false, msg: `A cab costs about ${money(q.total, { cents: true })} — not enough cash.` };
    this.audio.cash();
    await this.advanceTime(q.minutes, { label: `Taxi to ${label}…` });
    const spot = this.nearestWalkable(x, z);
    this.player.teleport(spot.x, spot.z, this.player.heading);
    this.pedestrians.clear();
    this.traffic.clear();
    this.discovery.stat('taxiRides');
    return { ok: true, msg: `You arrived at ${label}. Fare + tip: ${money(q.total, { cents: true })}.` };
  }

  nearestWalkable(x, z) {
    if (this.model.isWalkable(x, z) && !this._insideCollider(x, z)) return { x, z };
    const nodes = this.model.nodesNear(x, z, 150);
    let best = null;
    let bd = Infinity;
    for (const i of nodes) {
      const n = this.model.nodes[i];
      if (n.kind === 'bridge') continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best ? { x: best.x, z: best.z } : { x, z };
  }

  _insideCollider(x, z) {
    return this.model.collidersNear(x, z, 0.5).some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && c.y0 < 1);
  }

  // Waypoints & markers ------------------------------------------------------------
  setWaypoint(wp) {
    this.waypoint = wp;
    this._refreshMarkers();
  }

  _refreshMarkers() {
    const list = [];
    if (this.waypoint) list.push({ id: 'wp', x: this.waypoint.x, z: this.waypoint.z, kind: this.waypoint.kind || 'waypoint' });
    const o = this.gigs?.order;
    if (o) list.push({ id: 'gig', x: o.stage === 'pickup' ? o.pickup.x : o.dropoff.x, z: o.stage === 'pickup' ? o.pickup.z : o.dropoff.z, kind: 'gig' });
    this.markers.set(list);
  }

  checkWaypointArrival() {
    const wp = this.waypoint;
    if (!wp) return;
    if (Math.hypot(wp.x - this.player.pos.x, wp.z - this.player.pos.z) < 8) {
      this.ui.toast(`You've arrived: ${wp.label || 'destination'}.`, { icon: '📍' });
      this.setWaypoint(null);
    }
  }

  // Misc ------------------------------------------------------------------------------
  hoodName(id) {
    return HOOD_BY_ID[id]?.name || '';
  }

  lifeSummary() {
    const debt = this.housing.state.arrears;
    return {
      netWorth: this.economy.netWorth(debt),
      title: this.career.title(),
      employer: this.career.job ? EMPLOYER_BY_ID[this.career.job.employer].name : null,
      home: this.housing.homeLabel(),
      landmarks: this.discovery.state.landmarks.length,
      totalLandmarks: LANDMARKS.filter((l) => l.radius > 0).length + 1,
    };
  }

  setTimeSpeed(key) {
    if (!TIME_SPEEDS[key]) return;
    this.settings.timeSpeed = key;
    this.clock.speed = key;
    saveSettings(this.settings);
  }

  applySettings() {
    this.rig.sensitivity = this.settings.sensitivity;
    this.rig.invertY = this.settings.invertY;
    this.rig.autoFollow = this.settings.autoCamera;
    this.audio.setVolume('master', this.settings.volMaster);
    this.audio.setVolume('ambience', this.settings.volAmbience);
    this.audio.setVolume('sfx', this.settings.volSfx);
    this.audio.setVolume('music', this.settings.volMusic);
    this.audio.setMusic(this.settings.music);
    saveSettings(this.settings);
  }
}

function resultText(action) {
  switch (action.kind) {
    case 'food':
      return ['Delicious.', 'That hit the spot.', 'New York does it best.', 'Worth every penny.'][Math.floor(Math.random() * 4)];
    case 'drink':
      return 'Refreshing.';
    case 'buy':
      return `Added to your bag: ${ITEMS[action.item]?.name || action.label}.`;
    case 'show':
      return 'What a show. You leave buzzing.';
    case 'fun':
      return 'A little New York magic.';
    case 'study':
      return 'You learned something useful.';
    case 'chore':
      return 'Chores done. Adulting!';
    default:
      return 'Done.';
  }
}

function morningLine(game) {
  const snap = game.weather.snapshot();
  const t = snap.temperature;
  const next = game.career.nextShift();
  let s = `It's ${t}°F and ${snap.label.toLowerCase()} out.`;
  if (next && next.day === game.clock.dayIndex) s += ` Work at ${clockTime(next.start)}.`;
  return s;
}

function seasonGreeting(season) {
  return {
    spring: 'Spring has sprung — cherry blossoms, outdoor markets and open windows.',
    summer: 'Summer in the city: street fairs, rooftop bars and free concerts in the park.',
    fall: 'Fall arrives: crisp air, changing leaves and the best season in New York.',
    winter: 'Winter is here. Bundle up — heating bills go up, but so do the holiday lights.',
  }[season];
}

export { clamp };
