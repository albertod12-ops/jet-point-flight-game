// Small deterministic RNG (mulberry32) so one seed always builds the same
// route, traffic and clouds — screenshots are reproducible.
export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) {
      return min + this.next() * (max - min);
    },
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
  };
}

// Smooth 1-D value noise from a seeded table, for hills, gusts and routes.
export function makeNoise(random, size = 256) {
  const table = new Float32Array(size);
  for (let i = 0; i < size; i += 1) table[i] = random.next() * 2 - 1;
  function at(t) {
    const x = ((t % size) + size) % size;
    const i = Math.floor(x);
    const f = x - i;
    const a = table[i];
    const b = table[(i + 1) % size];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  }
  return function noise(t) {
    return at(t * 0.5) * 0.6 + at(t * 0.13) * 0.4;
  };
}
