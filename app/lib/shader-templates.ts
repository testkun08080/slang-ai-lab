export const glslTemplates = {
  /**
   * paletteFlow — "Shader Art Coding" tribute
   * Inspired by: kishimisu "An Introduction to Shader Art Coding"
   *              (https://www.shadertoy.com/view/mtyGWy)
   *            + Inigo Quilez cosine palettes
   *              (https://iquilezles.org/articles/palettes/)
   * Technique: cosine palette + fract(length) concentric rings with layered loop
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  paletteFlow: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
// @param u_speed {type: "float", min: 0.1, max: 2.5, step: 0.05, value: 1.0, label: "Flow Speed"}
uniform float u_speed;
// @param u_density {type: "float", min: 4.0, max: 16.0, step: 0.25, value: 8.0, label: "Ring Density"}
uniform float u_density;
// @param u_intensity {type: "float", min: 0.4, max: 2.2, step: 0.05, value: 1.2, label: "Glow Intensity"}
uniform float u_intensity;

vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.263, 0.416, 0.557);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  vec2 uv0 = uv;
  vec3 finalCol = vec3(0.0);

  for (int i = 0; i < 4; i++) {
    uv = fract(uv * 1.5) - 0.5;

    float d = length(uv) * exp(-length(uv0));
    vec3 col = palette(length(uv0) + float(i) * 0.4 + u_time * 0.4 * u_speed);

    d = sin(d * u_density + u_time * u_speed) / u_density;
    d = abs(d);
    d = pow(0.01 / d, u_intensity);

    finalCol += col * d;
  }

  finalCol = pow(clamp(finalCol, 0.0, 1.0), vec3(0.9));
  gl_FragColor = vec4(finalCol, 1.0);
}`,

  /**
   * creationPulse — "Creation" tribute
   * Inspired by: Silexars / Danguafer "Creation"
   *              (https://www.shadertoy.com/view/XsXXDn)
   * Technique: iterative uv folding with sin-based scale-invariant pattern
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  creationPulse: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
// @param u_speed {type: "float", min: 0.1, max: 2.0, step: 0.05, value: 0.5, label: "Pulse Speed"}
uniform float u_speed;
// @param u_fold {type: "float", min: 0.5, max: 1.4, step: 0.01, value: 0.9, label: "Fold Offset"}
uniform float u_fold;
// @param u_contrast {type: "float", min: 0.6, max: 2.0, step: 0.05, value: 1.0, label: "Contrast"}
uniform float u_contrast;

void main() {
  vec3 col = vec3(0.0);
  vec2 p = (gl_FragCoord.xy - u_resolution.xy * 0.5) / u_resolution.y;
  float t = u_time * u_speed;

  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    p = abs(p) / dot(p, p) - vec2(u_fold + 0.05 * sin(t));
    float d = length(p);
    col += 0.5 + 0.5 * cos(t + fi * 0.4 + vec3(0.0, 0.5, 1.0) + d);
  }

  col = col / 10.0;
  col *= col * u_contrast;
  col = pow(clamp(col, 0.0, 1.0), vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * hyperspace — "Star Nest" tribute
   * Inspired by: Pablo Roman Andrioli / Kali "Star Nest"
   *              (https://www.shadertoy.com/view/XlfGRj)
   * Technique: 3D folded fractal p = abs(p)/dot(p,p) - offset with accumulated emission
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  hyperspace: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
// @param u_speed {type: "float", min: 0.1, max: 2.0, step: 0.05, value: 0.1, label: "Travel Speed"}
uniform float u_speed;
// @param u_stepSize {type: "float", min: 0.06, max: 0.22, step: 0.01, value: 0.12, label: "Step Size"}
uniform float u_stepSize;
// @param u_fade {type: "float", min: 0.65, max: 0.95, step: 0.01, value: 0.82, label: "Fade Rate"}
uniform float u_fade;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  float t = u_time * u_speed;

  vec3 dir = normalize(vec3(uv, 1.0));
  vec3 from = vec3(0.0, 0.0, t * 2.0);

  float s = 0.1;
  float fade = 1.0;
  vec3 col = vec3(0.0);

  for (int r = 0; r < 12; r++) {
    vec3 p = from + s * dir * 0.5;
    p = abs(vec3(0.85) - mod(p, vec3(1.7)));

    float pa = 0.0;
    float a = 0.0;
    for (int i = 0; i < 6; i++) {
      p = abs(p) / dot(p, p) - 0.53;
      float d = length(p);
      a += abs(d - pa);
      pa = d;
    }
    a *= a * a * 0.0015;

    col += vec3(s, s * s, s * s * s * s) * a * fade;
    fade *= u_fade;
    s += u_stepSize;
  }

  col = mix(vec3(length(col)), col, 0.6) * 0.02;
  col = pow(clamp(col, 0.0, 1.0), vec3(0.9));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * seascape — "Seascape" tribute
   * Inspired by: TDM "Seascape"
   *              (https://www.shadertoy.com/view/Ms2SD1)
   * Technique: raymarched ocean surface with layered noise waves + fresnel + sky blend
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  seascape: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0, 0)), hash(i + vec2(1, 0)), u.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x),
    u.y
  );
}

float waveHeight(vec2 p, float t) {
  float h = 0.0;
  float amp = 0.6;
  float freq = 1.0;
  vec2 shift = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    h += amp * noise(p * freq + shift + t * 0.5);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    amp *= 0.55;
    freq *= 1.9;
    shift += vec2(2.3, 1.7);
  }
  return h;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * 0.3;

  // horizon at y = 0.05
  float horizon = 0.05;
  vec3 skyTop = vec3(0.05, 0.08, 0.20);
  vec3 skyBot = vec3(0.95, 0.55, 0.35);
  vec3 sun = vec3(1.0, 0.85, 0.55);

  vec3 col;

  if (p.y > horizon) {
    // Sky
    float sy = smoothstep(horizon, 0.6, p.y);
    col = mix(skyBot, skyTop, sy);
    // sun disc
    vec2 sunPos = vec2(0.0, 0.12);
    float sd = length(p - sunPos);
    col += sun * smoothstep(0.12, 0.0, sd) * 0.9;
    col += sun * smoothstep(0.35, 0.05, sd) * 0.25;
  } else {
    // Sea — parallax-stretched coordinates
    float depth = 1.0 / (-p.y + horizon + 0.01);
    vec2 sp = vec2(p.x * depth, depth + t);
    float h = waveHeight(sp * 0.6, t);
    float sparkle = noise(sp * 8.0 - t * 2.0);

    vec3 seaDeep = vec3(0.02, 0.08, 0.18);
    vec3 seaShallow = vec3(0.25, 0.55, 0.75);
    col = mix(seaDeep, seaShallow, smoothstep(0.0, 1.2, h));

    // sun reflection column
    float reflCol = exp(-p.x * p.x * 30.0) * exp(p.y * 6.0);
    col += sun * reflCol * (0.4 + 0.6 * sparkle);

    // fresnel rim at horizon
    float fres = smoothstep(0.0, 0.03, horizon - p.y);
    col = mix(skyBot * 0.7, col, fres);
  }

  col = pow(clamp(col, 0.0, 1.0), vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * proteanClouds — "Protean Clouds" tribute
   * Inspired by: nimitz "Protean Clouds"
   *              (https://www.shadertoy.com/view/3l23Rh)
   * Technique: FBM volumetric raymarch + camera flight + color-temperature gradient
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  proteanClouds: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
      mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
      f.y
    ),
    mix(
      mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
      mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  float t = u_time * 0.25;

  vec3 ro = vec3(0.0, 0.0, t);
  vec3 rd = normalize(vec3(uv, 1.2));

  vec3 col = vec3(0.0);
  float transmit = 1.0;

  for (int i = 0; i < 32; i++) {
    float fi = float(i);
    vec3 p = ro + rd * (fi * 0.22 + 0.4);
    float density = fbm(p * 0.9) - 0.45 - p.y * 0.25;
    density = clamp(density, 0.0, 1.0);

    if (density > 0.01) {
      vec3 warm = vec3(1.0, 0.55, 0.30);
      vec3 cool = vec3(0.45, 0.55, 0.90);
      vec3 cloudCol = mix(cool, warm, smoothstep(-0.2, 0.4, p.y + sin(t) * 0.3));
      cloudCol *= 1.0 - density * 0.5;

      float a = density * 0.35;
      col += cloudCol * a * transmit;
      transmit *= 1.0 - a;
      if (transmit < 0.02) break;
    }
  }

  // sky background where clouds didn't cover
  vec3 sky = mix(vec3(0.95, 0.55, 0.35), vec3(0.10, 0.18, 0.40), smoothstep(-0.2, 0.8, rd.y));
  col += sky * transmit;

  col = pow(clamp(col, 0.0, 1.0), vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * apollonian — "Apollonian" tribute
   * Inspired by: Inigo Quilez "Apollonian"
   *              (https://www.shadertoy.com/view/4ds3zn)
   *            + https://iquilezles.org/articles/apollonian/
   * Technique: p = p*s - r*floor(p/s*r+0.5) iterated distance field coloring
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  apollonian: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

float apollonian(vec2 uv, float s) {
  vec3 p = vec3(uv, 0.5 + 0.3 * sin(u_time * 0.2));
  float scale = 1.0;

  for (int i = 0; i < 10; i++) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    float r2 = dot(p, p);
    float k = s / r2;
    p *= k;
    scale *= k;
  }

  return 0.25 * abs(p.y) / scale;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  uv *= 1.3;

  float s = 1.2 + 0.25 * sin(u_time * 0.15);
  float d = apollonian(uv, s);

  float glow = 1.0 / (d * 12.0 + 0.02);
  vec3 col = vec3(0.0);
  col += vec3(0.9, 0.4, 0.2) * glow * 0.25;
  col += vec3(0.3, 0.6, 1.0) * pow(glow, 0.6) * 0.15;
  col += vec3(0.9, 0.9, 1.0) * smoothstep(0.0, 0.002, 0.003 - d);

  // vignette
  col *= 1.0 - 0.4 * dot(uv, uv) * 0.3;

  col = pow(clamp(col, 0.0, 1.0), vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * hexTruchet — "Hexagonal Truchet" tribute
   * Inspired by: Shane's hexagonal truchet shader series
   *              (https://www.shadertoy.com/user/Shane)
   * Technique: hex grid with per-cell random arc rotation for seamless neon curves
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  hexTruchet: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Returns (local coords xy, cell id zw)
vec4 hexCoords(vec2 p) {
  vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  if (dot(h.xy, h.xy) < dot(h.zw, h.zw)) {
    return vec4(h.xy, hC.xy);
  } else {
    return vec4(h.zw, hC.zw + 0.5);
  }
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  uv *= 3.0;
  float t = u_time * 0.4;

  // slow drift
  uv += vec2(cos(t * 0.3), sin(t * 0.4)) * 0.5;

  vec4 h = hexCoords(uv);
  vec2 local = h.xy;
  vec2 id = h.zw;

  float r = hash(id);
  // rotate local by 60deg steps based on random
  float ang = floor(r * 3.0) * 1.0472;
  float ca = cos(ang), sa = sin(ang);
  local = mat2(ca, -sa, sa, ca) * local;

  // draw two arcs on opposite hex corners (centers at distance ~0.866)
  vec2 c1 = vec2(0.866, 0.5);
  vec2 c2 = vec2(-0.866, -0.5);
  float d1 = abs(length(local - c1) - 1.0);
  float d2 = abs(length(local - c2) - 1.0);
  float d = min(d1, d2);

  // animated thickness pulse per-cell
  float thick = 0.08 + 0.04 * sin(t * 2.0 + r * 6.28);
  float line = smoothstep(thick, thick - 0.02, d);

  // glow
  float glow = exp(-d * 8.0) * 0.6;

  // palette per-cell
  vec3 c = 0.5 + 0.5 * cos(6.2832 * (r + vec3(0.0, 0.33, 0.67)) + t);
  vec3 bg = vec3(0.03, 0.03, 0.06);

  vec3 col = bg;
  col += c * glow;
  col = mix(col, c * 1.4, line);

  col = pow(clamp(col, 0.0, 1.0), vec3(0.88));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * happyCreature — "Happy Jumping" tribute
   * Inspired by: Inigo Quilez "Happy Jumping" live-coding session
   *              (https://www.shadertoy.com/view/3lsSzf)
   * Technique: 2D SDF primitives with smooth union + bouncing animation
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  happyCreature: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdEllipse(vec2 p, vec2 ab) {
  return (length(p / ab) - 1.0) * min(ab.x, ab.y);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  float t = u_time;

  // bounce
  float bounce = abs(sin(t * 2.0));
  float squash = 1.0 - 0.15 * (1.0 - bounce);
  vec2 c = vec2(0.0, -0.25 + bounce * 0.35);

  // body
  vec2 bp = (uv - c) / vec2(1.0 / squash, squash);
  float body = sdCircle(bp, 0.35);

  // feet (appear when squashed)
  float feet = sdEllipse(uv - c - vec2(-0.15, -0.32), vec2(0.09, 0.04));
  feet = min(feet, sdEllipse(uv - c - vec2(0.15, -0.32), vec2(0.09, 0.04)));

  float d = smin(body, feet, 0.08);

  // eyes
  vec2 eyeL = uv - c - vec2(-0.12, 0.05);
  vec2 eyeR = uv - c - vec2( 0.12, 0.05);
  float eyeWL = sdCircle(eyeL, 0.06);
  float eyeWR = sdCircle(eyeR, 0.06);
  float eyeW = min(eyeWL, eyeWR);
  // pupils look towards ground horizon
  vec2 look = normalize(vec2(sin(t * 0.8) * 0.5, -0.8)) * 0.02;
  float pupL = sdCircle(eyeL - look, 0.025);
  float pupR = sdCircle(eyeR - look, 0.025);
  float pup = min(pupL, pupR);

  // mouth (smile arc)
  vec2 mp = uv - c - vec2(0.0, -0.05);
  float mouth = abs(length(mp) - 0.12) - 0.012;
  mouth = max(mouth, mp.y);

  // ground
  float ground = uv.y + 0.6;

  // compose colors
  vec3 sky = mix(vec3(0.95, 0.82, 0.65), vec3(0.55, 0.75, 0.95), uv.y * 0.5 + 0.5);
  vec3 col = sky;

  // ground fill
  col = mix(col, vec3(0.25, 0.45, 0.25), smoothstep(0.01, -0.01, ground));

  // shadow
  float sh = smoothstep(0.15, 0.0, length((uv - vec2(c.x, -0.58)) * vec2(1.0, 4.0)));
  col *= 1.0 - sh * 0.35 * (1.0 - bounce * 0.5);

  // body
  vec3 bodyCol = vec3(1.0, 0.55, 0.35);
  col = mix(col, bodyCol, smoothstep(0.005, -0.005, d));
  // body outline
  col = mix(col, vec3(0.2, 0.08, 0.06), smoothstep(0.012, 0.0, abs(d)) * 0.6);

  // eyes white
  col = mix(col, vec3(1.0), smoothstep(0.005, -0.005, eyeW));
  // pupils
  col = mix(col, vec3(0.05), smoothstep(0.005, -0.005, pup));
  // mouth
  col = mix(col, vec3(0.15, 0.05, 0.05), smoothstep(0.006, 0.0, mouth));

  col = pow(clamp(col, 0.0, 1.0), vec3(0.9));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * plasmaBall — Interactive Tesla plasma ball
   * Inspired by: various nimitz-style plasma / Tesla coil shaders on Shadertoy
   * Technique: FBM-warped radial branches, u_mouse drives discharge center
   *
   * Original implementation, not a copy of any specific referenced work.
   */
  plasmaBall: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), f.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  vec2 m = (u_mouse * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * 0.6;

  // Sphere boundary
  float sphere = length(uv);
  float ball = smoothstep(0.82, 0.78, sphere);
  float rim = smoothstep(0.82, 0.78, sphere) - smoothstep(0.78, 0.74, sphere);

  // Branches from mouse to surface
  vec2 dir = uv - m;
  float dist = length(dir);
  float ang = atan(dir.y, dir.x);

  // warp angular coordinate with fbm to get branching lightning
  float warp = fbm(vec2(ang * 3.0 + t * 0.4, dist * 4.0 - t * 0.8));
  warp += fbm(vec2(ang * 6.0 - t * 0.5, dist * 8.0 + t)) * 0.5;

  float bolt = exp(-abs(warp - 0.5) * 18.0);
  bolt *= smoothstep(0.9, 0.1, dist);
  bolt *= ball;

  // flickering intensity
  float flicker = 0.7 + 0.3 * sin(t * 13.0 + warp * 20.0);
  bolt *= flicker;

  // core glow at mouse
  float core = exp(-length(uv - m) * 8.0) * ball;

  // base colors
  vec3 col = vec3(0.02, 0.02, 0.06);
  vec3 plasma = mix(vec3(0.35, 0.55, 1.0), vec3(0.9, 0.4, 1.0), warp);
  col += plasma * bolt * 1.8;
  col += vec3(0.9, 0.95, 1.0) * core * 0.6;

  // glass rim highlight
  col += vec3(0.3, 0.45, 0.9) * rim * 1.2;

  // outer soft glow around sphere
  float outerGlow = exp(-(sphere - 0.8) * 6.0) * (1.0 - ball);
  col += vec3(0.15, 0.2, 0.5) * max(outerGlow, 0.0);

  col = pow(clamp(col, 0.0, 1.0), vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * noiseCloudPaint — Interactive colorful FBM clouds
   * Technique: domain-warped 2D FBM; pointer pulls UV and seeds extra turbulence (mouse + touch via u_mouse)
   */
  noiseCloudPaint: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 23.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * 0.18;
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  vec2 m = (u_mouse - 0.5) * aspect;

  vec2 toward = m - p;
  float dist = length(toward);
  float brush = smoothstep(0.52, 0.0, dist);

  vec2 q = p;
  q += toward * brush * 0.38;
  q += vec2(fbm(p + vec2(t, 0.0)), fbm(p + vec2(0.0, t))) * 0.28;

  vec2 warp = vec2(
    fbm(q * 2.0 + m * 3.2 + t),
    fbm(q * 2.0 - m.yx * 2.7 - t * 0.65)
  );
  q += (warp - 0.5) * (0.42 + brush * 0.55);

  float n = fbm(q * 1.75 + vec2(t * 0.45, -t * 0.32));
  n = mix(n, fbm(q * 5.2 + m * 1.5 + t * 0.4), 0.32 + brush * 0.5);
  float soft = smoothstep(0.22, 0.78, n);

  vec3 palA = vec3(0.5, 0.5, 0.5);
  vec3 palB = vec3(0.5, 0.5, 0.5);
  vec3 palC = vec3(1.0 + 0.35 * m.x, 1.0, 1.0 + 0.25 * m.y);
  vec3 palD = vec3(0.15 + 0.25 * m.y, 0.25 + 0.2 * m.x, 0.5 + 0.15 * sin(t + dot(m, vec2(1.2))));
  float phase = soft * 1.35 + n * 0.35 + t * 0.1;
  vec3 col = palA + palB * cos(6.28318 * (palC * phase + palD));

  col += vec3(0.2, 0.12, 0.35) * brush * n;
  col *= 0.82 + 0.38 * soft;

  col = pow(clamp(col, 0.0, 1.0), vec3(0.9));
  gl_FragColor = vec4(col, 1.0);
}`,

  /**
   * caustics — Underwater caustics tribute
   * Inspired by: Inigo Quilez domain warping techniques
   *              (https://iquilezles.org/articles/warp/)
   *            + classic water-caustic Shadertoy approach
   * Technique: periodic length(vec3) approximation of refraction pattern, time-animated
   *
   * Original implementation inspired by the above, not a verbatim copy.
   */
  caustics: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 6.0;
  float t = u_time * 0.5 + 23.0;

  vec2 i = p;
  float c = 0.0;
  float inten = 0.005;

  for (int n = 0; n < 6; n++) {
    float fn = float(n);
    float t2 = t * (1.0 - (3.0 / (fn + 2.0)));
    i = p + vec2(
      cos(t2 - i.x) + sin(t2 + i.y),
      sin(t2 - i.y) + cos(t2 + i.x)
    );
    c += 1.0 / length(vec2(
      p.x / (sin(i.x + t2) / inten),
      p.y / (cos(i.y + t2) / inten)
    ));
  }

  c /= 6.0;
  c = 1.17 - pow(c, 1.4);
  vec3 col = vec3(pow(abs(c), 8.0));

  // tint: aqua -> deep teal
  vec3 tint = mix(vec3(0.08, 0.25, 0.35), vec3(0.45, 0.95, 1.0), col.r);
  col = clamp(tint + col * 0.4, 0.0, 1.0);

  // depth vignette
  float v = 1.0 - 0.4 * length(uv - 0.5);
  col *= v;

  col = pow(clamp(col, 0.0, 1.0), vec3(0.9));
  gl_FragColor = vec4(col, 1.0);
}`
}

export interface ShaderTemplatePreset {
  fragmentShader: string;
  vertexShader?: string;
}

export const glsl3DTemplates = {
  litGradient: {
    fragmentShader: `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;

void main() {
  vec3 n = normalize(v_normal);
  vec3 lightA = normalize(vec3(0.8, 1.0, 0.6));
  vec3 lightB = normalize(vec3(-0.7, 0.3, 0.9));
  vec3 viewDir = normalize(-v_position);

  float diffA = max(dot(n, lightA), 0.0);
  float diffB = max(dot(n, lightB), 0.0);
  float rim = pow(1.0 - max(dot(viewDir, n), 0.0), 2.5);

  vec3 base = mix(vec3(0.10, 0.25, 0.65), vec3(0.95, 0.35, 0.40), v_texCoord.y);
  float pulse = 0.85 + 0.15 * sin(u_time * 1.4 + v_texCoord.x * 8.0);

  vec3 col = base * (0.25 + diffA * 0.7 + diffB * 0.35) * pulse;
  col += vec3(0.45, 0.7, 1.0) * rim * 0.55;
  gl_FragColor = vec4(col, 1.0);
}`,
  },
  waveDeform: {
    vertexShader: `precision mediump float;

attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
uniform float u_time;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;
varying float v_wave;

void main() {
  vec3 pos = a_position.xyz;
  float wave = sin(pos.x * 4.0 + u_time * 1.8) * cos(pos.y * 3.0 + u_time * 1.2);
  float amp = 0.18;
  pos += a_normal * (wave * amp);

  vec3 normalObj = normalize(a_normal + vec3(-0.35 * amp * wave, 1.0, -0.35 * amp * wave));
  v_normal = normalize(u_normalMatrix * normalObj);
  v_texCoord = a_texCoord;
  v_wave = wave;

  vec4 mv = u_modelViewMatrix * vec4(pos, 1.0);
  v_position = mv.xyz;
  gl_Position = u_projectionMatrix * mv;
}`,
    fragmentShader: `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;
varying float v_wave;

void main() {
  vec3 n = normalize(v_normal);
  vec3 lightDir = normalize(vec3(0.9, 1.0, 0.5));
  vec3 viewDir = normalize(-v_position);

  float diff = max(dot(n, lightDir), 0.0);
  float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);

  vec3 deep = vec3(0.05, 0.28, 0.62);
  vec3 crest = vec3(0.30, 0.82, 1.0);
  float h = 0.5 + 0.5 * v_wave;
  vec3 base = mix(deep, crest, h);

  float stripe = 0.5 + 0.5 * sin(v_texCoord.y * 22.0 + u_time * 3.2 + v_wave * 4.0);
  base += vec3(0.15, 0.25, 0.35) * stripe * 0.25;

  vec3 col = base * (0.2 + diff * 0.9);
  col += vec3(0.8, 0.95, 1.0) * fresnel * 0.45;
  gl_FragColor = vec4(col, 1.0);
}`,
  },
  twistPulse: {
    vertexShader: `precision mediump float;

attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
uniform float u_time;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;
varying float v_twist;

void main() {
  vec3 pos = a_position.xyz;
  float twist = sin(u_time * 1.3 + pos.y * 2.8) * 0.9;
  float c = cos(twist);
  float s = sin(twist);
  mat2 rot = mat2(c, -s, s, c);
  pos.xz = rot * pos.xz;
  pos *= 1.0 + 0.08 * sin(u_time * 2.0 + pos.y * 5.0);

  vec3 n = a_normal;
  n.xz = rot * n.xz;
  v_normal = normalize(u_normalMatrix * n);
  v_texCoord = a_texCoord;
  v_twist = twist;

  vec4 mv = u_modelViewMatrix * vec4(pos, 1.0);
  v_position = mv.xyz;
  gl_Position = u_projectionMatrix * mv;
}`,
    fragmentShader: `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;
varying float v_twist;

void main() {
  vec3 n = normalize(v_normal);
  vec3 l1 = normalize(vec3(1.0, 0.7, 0.4));
  vec3 l2 = normalize(vec3(-0.6, 0.4, 1.0));
  vec3 viewDir = normalize(-v_position);

  float diff = max(dot(n, l1), 0.0) * 0.75 + max(dot(n, l2), 0.0) * 0.45;
  float spec = pow(max(dot(reflect(-l1, n), viewDir), 0.0), 18.0);
  float rim = pow(1.0 - max(dot(viewDir, n), 0.0), 2.0);

  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(1.0);
  vec3 d = vec3(0.05, 0.25, 0.55);
  float t = v_texCoord.x * 1.6 + v_texCoord.y * 0.7 + v_twist * 0.35 + u_time * 0.15;
  vec3 base = a + b * cos(6.28318 * (c * t + d));

  vec3 col = base * (0.2 + diff);
  col += vec3(1.0) * spec * 0.35;
  col += vec3(0.55, 0.75, 1.0) * rim * 0.4;
  gl_FragColor = vec4(col, 1.0);
}`,
  },
} as const satisfies Record<string, ShaderTemplatePreset>;

export const hlslTemplates = {
  basic: `struct VS_OUTPUT {
  float4 Position : SV_POSITION;
  float2 TexCoord : TEXCOORD0;
};

cbuffer Constants : register(b0) {
  float Time;
  float2 Resolution;
};

float4 PSMain(VS_OUTPUT input) : SV_Target {
  float2 uv = input.TexCoord;
  float3 col = float3(uv.x, uv.y, sin(Time) * 0.5 + 0.5);
  return float4(col, 1.0);
}`
}

export const defaultShader = glslTemplates.paletteFlow

export type ShaderTemplate = keyof typeof glslTemplates
export type Shader3DTemplate = keyof typeof glsl3DTemplates
