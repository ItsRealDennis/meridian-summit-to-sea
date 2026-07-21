// ── Shared GLSL — noise, atmosphere, fog ─────────────────────
// Single source of truth: the sky mesh, terrain, ocean and the
// composite pass all read the same atmosphere, so fog can never
// mismatch the background at any scroll position.

export const NOISE_GLSL = /* glsl */`
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
      mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm2(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; }
    return s;
  }
  // 2-octave variant for high-frequency detail — half the cost
  float fbm2b(vec2 p) {
    return 0.62 * vnoise(p) + 0.38 * vnoise(p * 2.03 + 17.7);
  }
`;

// Act blends + full sky in one chunk.
// p: journey progress 0..1 · rd: view ray · sun: dir toward sun
export const ATMO_GLSL = /* glsl */`
  // dawn palette (linear-ish)
  const vec3 DAWN_ZEN  = vec3(0.038, 0.082, 0.205);
  const vec3 DAWN_MID  = vec3(0.185, 0.215, 0.36);
  const vec3 DAWN_HOR  = vec3(1.08, 0.60, 0.34);
  // grey palette
  const vec3 GREY_ZEN  = vec3(0.520, 0.560, 0.610);
  const vec3 GREY_MID  = vec3(0.660, 0.690, 0.720);
  const vec3 GREY_HOR  = vec3(0.780, 0.795, 0.805);
  // marine palette
  const vec3 MAR_ZEN   = vec3(0.290, 0.355, 0.410);
  const vec3 MAR_MID   = vec3(0.470, 0.540, 0.575);
  const vec3 MAR_HOR   = vec3(0.665, 0.720, 0.730);

  float actGrey(float p)   { return smoothstep(0.20, 0.46, p); }
  float actMarine(float p) { return smoothstep(0.52, 0.70, p); }

  vec3 zenithCol(float p) {
    vec3 c = mix(DAWN_ZEN, GREY_ZEN, actGrey(p));
    return mix(c, MAR_ZEN, actMarine(p));
  }
  vec3 midCol(float p) {
    vec3 c = mix(DAWN_MID, GREY_MID, actGrey(p));
    return mix(c, MAR_MID, actMarine(p));
  }
  vec3 horizonCol(float p) {
    vec3 c = mix(DAWN_HOR, GREY_HOR, actGrey(p));
    return mix(c, MAR_HOR, actMarine(p));
  }

  // Sky without sun disk — safe as a fog/reflection target.
  // At dawn the gold pools toward the sun; the far side stays rose-grey.
  vec3 skyBaseDir(vec3 rd, vec3 sun, float p) {
    float y = clamp(rd.y, -1.0, 1.0);
    float hz = pow(1.0 - max(y, 0.0), 7.5);            // horizon band
    float mz = pow(1.0 - max(y, 0.0), 2.4);            // mid falloff
    float azim = dot(normalize(rd.xz + vec2(1e-5)), normalize(sun.xz)) * 0.5 + 0.5;
    float dawn = (1.0 - actGrey(p)) * (1.0 - actMarine(p));
    vec3 hor = mix(horizonCol(p),
                   mix(vec3(0.42, 0.36, 0.44), horizonCol(p), pow(azim, 1.6)),
                   dawn);
    vec3 c = mix(zenithCol(p), midCol(p), mz);
    c = mix(c, hor, hz);
    // below the horizon: settle into a slightly deepened horizon tone
    float below = smoothstep(0.0, -0.22, y);
    c = mix(c, hor * 0.72, below);
    return c;
  }
  vec3 skyBase(vec3 rd, float p) { return skyBaseDir(rd, vec3(0.79, 0.2, -0.53), p); }

  // Full sky: base + sun. Dawn sun is a low warm blaze; in the
  // grey act it becomes a diffuse smudge; marine act hides it.
  vec3 skyFull(vec3 rd, vec3 sun, float p) {
    vec3 c = skyBase(rd, p);
    float sd = max(dot(rd, sun), 0.0);
    float grey = actGrey(p), mar = actMarine(p);
    float sunAmt = (1.0 - grey * 0.82) * (1.0 - mar);
    // blaze + halo
    c += vec3(1.25, 0.82, 0.48) * pow(sd, 260.0) * 2.6 * sunAmt;
    c += vec3(1.05, 0.63, 0.33) * pow(sd, 24.0) * 0.55 * sunAmt;
    c += vec3(0.95, 0.60, 0.34) * pow(sd, 5.0) * 0.22 * sunAmt;
    // grey act: pale smudge where the sun hides
    c += vec3(0.9) * pow(sd, 9.0) * 0.10 * grey * (1.0 - mar);
    return c;
  }

  // The colour fog resolves to — must equal what sky shows there.
  vec3 fogColor(vec3 rd, vec3 sun, float p) {
    vec3 rdF = normalize(vec3(rd.x, max(rd.y, 0.015), rd.z));
    vec3 c = skyBase(rdF, p);
    float sd = max(dot(rd, sun), 0.0);
    float mar = actMarine(p);
    c += vec3(1.0, 0.62, 0.34) * pow(sd, 5.0) * 0.18 * (1.0 - actGrey(p) * 0.8) * (1.0 - mar);
    return c;
  }
`;

// Height fog with closed-form integral — shared by composite.
export const FOG_GLSL = /* glsl */`
  // ro: ray origin, rd: dir, d: surface distance
  // base/H: fog floor + scale height, den: density
  float heightFog(vec3 ro, vec3 rd, float d, float base, float H, float den) {
    float invH = 1.0 / H;
    float dy = rd.y;
    float f;
    if (abs(dy) < 1e-4) {
      f = den * exp(-(ro.y - base) * invH) * d;
    } else {
      f = den * exp(-(ro.y - base) * invH) *
          (1.0 - exp(-d * dy * invH)) / (dy * invH);
    }
    return 1.0 - exp(-max(f, 0.0));
  }
`;
