import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.183.0/three.module.min.js';

import { MONTHS, drawCalendarGrid, saddlePage, readerState, SADDLE_SHEET_COUNT, validateSaddleImposition, normalizeLayout, normalizeArtworkMetadata, DEFAULT_END_SPREAD_COLOR, END_SPREADS, CALENDAR_SELECTIONS, normalizeEndSpreadColor, calendarSelectionIndex, calendarSelectionLabel } from './layout.js';
import { backCoverUsesImage, assets, drawPhoto } from './media.js';
import { drawBackCover, normalizeBackCover } from './back-cover.js';
import { applyPaperEstimate, normalizePrintColor } from './print-color.js';
const SHEET_COUNT = 13;
const SADDLE_LEAF_COUNT = SADDLE_SHEET_COUNT * 2;
const TEXTURE_WIDTH = 1024;
const TEXTURE_PIXELS = 768 * 1024;
const TURN_DURATION = 850;
const TURN_BEND_RATIO = 0.025;
const STACK_CLEARANCE = 0.0007;
const PAPER_DENSITY_KG_M3 = 700;
const MILLIMETERS_PER_INCH = 25.4;
const HDR_WIDTH = 1024;
const HDR_HEIGHT = 512;
const DEFAULT_AZIMUTH = 0.38;
const DEFAULT_ELEVATION = 0.12;
const STUDIO_EXPOSURE = 0.72;
const STUDIO_ENVIRONMENT_INTENSITY = 0.40;
const STUDIO_KEY_INTENSITY = 0.85;
const STUDIO_RIM_INTENSITY = 2.4;
const STUDIO_REAR_FILL_INTENSITY = 0.35;
const STUDIO_FOCUS_INTENSITY = 0.70;
const AREA_COLUMNS = 4;
const AREA_ROWS = 2;
const SHADOW_SIZE = 1024;
const SHADOW_BLUR_RADIUS = 40;
const SHADOW_BLUR_SAMPLES = 32;
const SHADOW_OPACITY = 0.10;
const SHADOW_GROUND_GAP = 0.45;
const PAPER_GRAIN_SIZE = 128;
const PAPER_GRAIN_REPEAT = 6;
const PAGE_SEGMENTS_X = 12;
const PAGE_SEGMENTS_Y = 48;
const STUDIO_SPAN_MINIMUM = 12;
export const PAPER_WEIGHTS = Object.freeze([120, 170, 250, 350]);
export const PAPER_FINISHES = Object.freeze({
  matte: { roughness: 0.90, clearcoat: 0.06, coatRoughness: 0.62 },
  satin: { roughness: 0.28, clearcoat: 0.62, coatRoughness: 0.085 },
  gloss: { roughness: 0.18, clearcoat: 0.90, coatRoughness: 0.045 }
});
export const PREVIEW_DEFAULTS = Object.freeze({ previewClosed: false, paperGsm: 170, coverGsm: 250, paperFinish: 'satin', paperRoughness: 0.28 });

/** Estimate caliper from gsm at 700 kg/m³; real stock density and coatings vary. */
export function estimatedCaliperMm(gsm) { return gsm / PAPER_DENSITY_KG_M3; }
const SADDLE_CREASE_WIDTH = 0.055;
const SADDLE_STAPLE_WIDTH = 0.22;
const SADDLE_STAPLE_THICKNESS = 0.025;
const SADDLE_STAPLE_DEPTH = 0.014;
const DEFAULT_STATE = { year: 2027, month: 0, endSpread: null, endSpreadColor: DEFAULT_END_SPREAD_COLOR, width: 12, height: 12, margin: 0.5, binding: 0.5, bleed: 0.125, week: 0, guides: true, bindingStyle: 'wire', ...PREVIEW_DEFAULTS };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = value => value * value * (3 - 2 * value);

/** Create an independently disposable, fully orbitable physical calendar preview. */
export function createCalendarScene(container) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = 'The 3D calendar requires WebGL. Enable hardware acceleration or use a WebGL-capable browser.';
    container.append(message);
    return { update() {}, flip() {}, resetView() {}, dispose() { message.remove(); } };
  }
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive 3D calendar. Drag to rotate, including the back; scroll or pinch to zoom.');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;';
  container.append(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xf4f5f6, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = STUDIO_EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 600);
  const model = new THREE.Group();
  scene.add(model);
  const key = new THREE.DirectionalLight(0xfff4e7, STUDIO_KEY_INTENSITY);
  const keyDirection = new THREE.Vector3(-24, 34, 42).normalize();
  key.position.copy(keyDirection);
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  key.shadow.radius = SHADOW_BLUR_RADIUS;
  key.shadow.blurSamples = SHADOW_BLUR_SAMPLES;
  key.shadow.bias = -0.000025;
  key.shadow.normalBias = 0.001;
  key.shadow.camera.near = 0.5;
  const rim = new THREE.DirectionalLight(0xe7eeff, STUDIO_RIM_INTENSITY);
  rim.position.set(30, 18, -28);
  const rearFill = new THREE.DirectionalLight(0xfff5e9, STUDIO_REAR_FILL_INTENSITY);
  rearFill.position.set(-20, 8, -30);
  const focus = new THREE.SpotLight(0xfff7ee, 1, 0, Math.PI / 5, 0.92, 2);
  focus.position.set(-8, 14, 26);
  scene.add(key, key.target, rim, rearFill, focus, focus.target);

  // cdnjs has no verified LTC addon. These finite rectangular emitters are sampled
  // point lights, not falsely advertised uninitialized THREE.RectAreaLight objects.
  const softboxSpecs = [
    { position: new THREE.Vector3(-0.49, -0.12, 1.20), width: 0.48, height: 1.16, radiance: 5.5, illuminance: 0.75, color: 0xfff4e8 },
    { position: new THREE.Vector3(0.90, 0.36, 0.72), width: 0.58, height: 0.84, radiance: 2.4, illuminance: 0.22, color: 0xe8f0ff },
    { position: new THREE.Vector3(0.92, 0.55, -0.90), width: 0.12, height: 1.25, radiance: 7.5, illuminance: 0.32, color: 0xeaf1ff }
  ];
  const softboxes = softboxSpecs.map(spec => {
    const direction = spec.position.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const lights = [];
    for (let row = 0; row < AREA_ROWS; row++) {
      for (let column = 0; column < AREA_COLUMNS; column++) {
        const light = new THREE.PointLight(spec.color, 1, 0, 2);
        const offset = right.clone().multiplyScalar(((column + 0.5) / AREA_COLUMNS - 0.5) * spec.width)
          .addScaledVector(up, ((row + 0.5) / AREA_ROWS - 0.5) * spec.height);
        scene.add(light);
        lights.push({ light, offset });
      }
    }
    return { ...spec, direction, right, up, lights };
  });

  // Floating-point radiance preserves luminous, rectangular softbox reflections.
  // The long camera-left panel is deliberately in the page's mirror direction,
  // not only above it: front-facing print now has a visible moving light ribbon.
  const panels = softboxes.map(spec => ({
    direction: spec.direction, right: spec.right, up: spec.up,
    halfWidth: spec.width / (2 * spec.position.length()),
    halfHeight: spec.height / (2 * spec.position.length()),
    radiance: spec.radiance, color: new THREE.Color(spec.color).toArray()
  }));
  const overheadDirection = key.position.clone().normalize();
  const overheadRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), overheadDirection).normalize();
  panels.push({ direction: overheadDirection, right: overheadRight,
    up: new THREE.Vector3().crossVectors(overheadDirection, overheadRight).normalize(),
    halfWidth: 0.46, halfHeight: 0.24, radiance: 2.5, color: [1, 0.96, 0.90] });
  const hdrPixels = new Float32Array(HDR_WIDTH * HDR_HEIGHT * 4);
  const ray = new THREE.Vector3();
  for (let y = 0; y < HDR_HEIGHT; y++) {
    const latitude = ((y + 0.5) / HDR_HEIGHT - 0.5) * Math.PI;
    for (let x = 0; x < HDR_WIDTH; x++) {
      const longitude = ((x + 0.5) / HDR_WIDTH - 0.5) * Math.PI * 2;
      ray.set(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude));
      const offset = (y * HDR_WIDTH + x) * 4;
      const backdrop = 0.035 + 0.065 * Math.max(0, ray.y) + 0.025 * Math.exp(-ray.y * ray.y * 12);
      hdrPixels[offset] = hdrPixels[offset + 1] = hdrPixels[offset + 2] = backdrop;
      for (const panel of panels) {
        const facing = ray.dot(panel.direction);
        if (facing <= 0) continue;
        const u = Math.abs(ray.dot(panel.right) / facing) / panel.halfWidth;
        const v = Math.abs(ray.dot(panel.up) / facing) / panel.halfHeight;
        const feather = 1 - ease(clamp((Math.max(u, v) - 0.86) / 0.14, 0, 1));
        for (let channel = 0; channel < 3; channel++) hdrPixels[offset + channel] += panel.radiance * panel.color[channel] * feather;
      }
      hdrPixels[offset + 3] = 1;
    }
  }
  const hdrTexture = new THREE.DataTexture(hdrPixels, HDR_WIDTH, HDR_HEIGHT, THREE.RGBAFormat, THREE.FloatType);
  hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
  hdrTexture.colorSpace = THREE.LinearSRGBColorSpace;
  hdrTexture.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdrTexture);
  scene.environment = environment.texture;
  scene.environmentIntensity = STUDIO_ENVIRONMENT_INTENSITY;
  hdrTexture.dispose();
  pmrem.dispose();

  // Fade shadow alpha around the subject so the receiver has no visible horizon or edge.
  const groundMaterial = new THREE.ShadowMaterial({
    color: 0x000000, opacity: SHADOW_OPACITY, side: THREE.FrontSide,
    depthWrite: false
  });
  const shadowFade = { value: new THREE.Vector2(24, 24) };
  groundMaterial.onBeforeCompile = shader => {
    shader.uniforms.calendarShadowExtent = shadowFade;
    shader.vertexShader = `varying vec2 calendarShadowPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\ncalendarShadowPosition = (modelMatrix * vec4(position, 1.0)).xz;'
    );
    shader.fragmentShader = `varying vec2 calendarShadowPosition;\nuniform vec2 calendarShadowExtent;\n${shader.fragmentShader}`.replace(
      '#include <tonemapping_fragment>',
      'float shadowDistance = length(calendarShadowPosition / calendarShadowExtent);\ngl_FragColor.a *= 1.0 - smoothstep(0.35, 1.0, shadowDistance);\n#include <tonemapping_fragment>'
    );
  };
  groundMaterial.customProgramCacheKey = () => 'calendar-shadow-receiver-fade-v1';
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Shared, authored micrograin is texture data only, never a downloaded asset.
  const grainPixels = new Uint8Array(PAPER_GRAIN_SIZE * PAPER_GRAIN_SIZE * 4);
  let grainSeed = 719;
  for (let pixel = 0; pixel < PAPER_GRAIN_SIZE * PAPER_GRAIN_SIZE; pixel++) {
    grainSeed = (Math.imul(grainSeed, 1664525) + 1013904223) >>> 0;
    const value = 230 + (grainSeed >>> 24) % 26;
    grainPixels[pixel * 4] = grainPixels[pixel * 4 + 1] = grainPixels[pixel * 4 + 2] = value;
    grainPixels[pixel * 4 + 3] = 255;
  }
  const grain = new THREE.DataTexture(grainPixels, PAPER_GRAIN_SIZE, PAPER_GRAIN_SIZE, THREE.RGBAFormat);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.magFilter = grain.minFilter = THREE.LinearFilter;
  grain.repeat.set(PAPER_GRAIN_REPEAT, PAPER_GRAIN_REPEAT);
  grain.needsUpdate = true;

  let state = { ...DEFAULT_STATE };
  let leaves = [];
  let frontCover = null;
  let backCover = null;
  let saddleFolds = [];
  let saddleStaples = null;
  let closedPose = DEFAULT_STATE.previewClosed ? 1 : 0;
  const photoTextures = new Map();
  let mediaRevision = -1;
  let colorSignature = '';
  let holidaySignature = '';
  let layoutSignature = '';
  let backArtworkSignature = '';
  const currentBackArtworkSignature = () => JSON.stringify([state.backCover,state.artworkMetadata]);
  const currentColorSignature = () => { const color = normalizePrintColor(state.printColor); return color.preview3d ? JSON.stringify([color.paper, color.assumptions[color.paper]]) : 'original'; };
  let animation = null;
  let disposed = false;
  let frame = 0;
  let azimuth = DEFAULT_AZIMUTH;
  let elevation = DEFAULT_ELEVATION;
  let distance = 43;
  let zoomFactor = 1;
  let initialized = false;
  let renderDirty = true;
  let lastCameraSignature = '';
  const pointers = new Map();
  const listeners = [];

  function listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  }

  function disposeModel() {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    model.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
        materials.add(material);
        if (material.map) textures.add(material.map);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => { texture.dispose(); if (texture.image instanceof HTMLCanvasElement) texture.image.width = texture.image.height = 1; });
    photoTextures.clear();
    model.clear();
    leaves = [];
    frontCover = null;
    backCover = null;
    saddleFolds = [];
    saddleStaples = null;
  }

  function guides(context, width, height) {
    if (!state.guides) return;
    const scale = width / state.width;
    const margin = state.margin * scale;
    const binding = readerState(state).binding * scale;
    context.save();
    context.strokeStyle = '#777';
    context.lineWidth = 1.5;
    context.setLineDash([10, 8]);
    context.strokeRect(margin, Math.max(margin, binding), width - margin * 2, height - Math.max(margin, binding) - margin);
    if (state.bindingStyle === 'wire') {
      context.beginPath();
      context.moveTo(0, binding);
      context.lineTo(width, binding);
      context.stroke();
    }
    context.restore();
  }

  function landscape(context, width, height, seed) {
    context.fillStyle = '#e7e7e7';
    context.fillRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#a5a5a5');
    gradient.addColorStop(0.63, '#f0f0f0');
    gradient.addColorStop(1, '#ccc');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#fafafa';
    context.beginPath();
    context.arc(width * (0.24 + (seed % 4) * 0.15), height * 0.24, Math.min(width, height) * 0.052, 0, Math.PI * 2);
    context.fill();
    for (let layer = 0; layer < 5; layer++) {
      const shade = 150 - layer * 28;
      context.fillStyle = `rgb(${shade},${shade},${shade})`;
      context.beginPath();
      context.moveTo(0, height);
      for (let step = 0; step <= 60; step++) {
        const x = step / 60;
        const ridge = Math.sin(x * (8 + layer * 2) + seed * 0.7 + layer) * 0.085 + Math.sin(x * 23 + seed + layer * 2) * 0.028;
        context.lineTo(x * width, height * (0.46 + layer * 0.11 + ridge));
      }
      context.lineTo(width, height);
      context.closePath();
      context.fill();
    }
  }

  function paintPhoto(surface, key) {
    const context = surface.getContext('2d'), record = key==='back-cover'&&!backCoverUsesImage(state)?null:assets.get(key);
    if (key==='back-cover'&&!record) drawBackCover(context,state,surface.width,surface.height,true);
    else if (record?.bitmap) {
      drawPhoto(context, record.bitmap, record.metadata.crop, state, surface.width, surface.height, true, record.metadata);
      applyPaperEstimate(context, state);
    } else if(key==='back-cover') drawBackCover(context,state,surface.width,surface.height,true);
    else landscape(context, surface.width, surface.height, key.startsWith('month-') ? Number(key.slice(6)) : key === 'front-cover' ? 2 : 8);
    guides(context, surface.width, surface.height);
  }

  function textureSurface() {
    const surface = document.createElement('canvas');
    const aspect = state.height / state.width;
    const textureLimit = Math.min(3072, renderer.capabilities.maxTextureSize);
    surface.width = Math.max(1, Math.floor(Math.min(TEXTURE_WIDTH, textureLimit / aspect, Math.sqrt(TEXTURE_PIXELS / aspect))));
    surface.height = Math.max(1, Math.floor(surface.width * aspect));
    return surface;
  }

  function canvasTexture(surface) {
    const map = new THREE.CanvasTexture(surface);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return map;
  }

  function refreshPhotos() {
    const nextColorSignature = currentColorSignature();
    const colorChanged = colorSignature !== nextColorSignature;
    const nextBackSignature=currentBackArtworkSignature(),backChanged=backArtworkSignature!==nextBackSignature;
    if (mediaRevision === assets.revision && !colorChanged && !backChanged) return;
    for (const [key, entry] of photoTextures) {
      const generated=key==='back-cover'&&!backCoverUsesImage(state);
      const revision = generated?assets.revision:assets.get(key)?.revision ?? -1;
      if (entry.revision === revision && !colorChanged && !(key==='back-cover'&&backChanged)) continue;
      paintPhoto(entry.map.image, key);
      entry.map.needsUpdate = true;
      entry.revision = revision;
    }
    mediaRevision = assets.revision;
    colorSignature = nextColorSignature;
    backArtworkSignature = nextBackSignature;
  }

  function texture(kind, month = 0) {
    const surface = textureSurface();
    const context = surface.getContext('2d');
    context.fillStyle = kind === 'solid' ? normalizeEndSpreadColor(state.endSpreadColor) : '#fff';
    context.fillRect(0, 0, surface.width, surface.height);
    const key = kind === 'photo' ? `month-${month}` : kind === 'cover' ? month : null;
    if (key) paintPhoto(surface, key);
    if (kind === 'grid') drawCalendarGrid(context, readerState(state), month, surface.width, surface.height);
    if (!key && kind !== 'solid') guides(context, surface.width, surface.height);
    const map = canvasTexture(surface);
    if (key) photoTextures.set(key, { map, revision: key==='back-cover'&&!backCoverUsesImage(state)?assets.revision:assets.get(key)?.revision ?? -1 });
    return map;
  }


  function stockThickness(cover = false) {
    return estimatedCaliperMm(cover ? state.coverGsm : state.paperGsm) / MILLIMETERS_PER_INCH;
  }

  function stackThickness() {
    const interiors = state.bindingStyle === 'saddle' ? SADDLE_LEAF_COUNT - 2 : SHEET_COUNT;
    return interiors * stockThickness() + 2 * stockThickness(true) + (interiors + 1) * STACK_CLEARANCE;
  }

  function closedCenter(sheet) {
    const count = state.bindingStyle === 'saddle' ? SADDLE_LEAF_COUNT : SHEET_COUNT + 2;
    const index = state.bindingStyle === 'saddle' ? sheet.index : sheet.index + 1;
    const total = stackThickness(), cover = stockThickness(true), paper = stockThickness();
    if (index === 0) return total / 2 - cover / 2;
    if (index === count - 1) return -total / 2 + cover / 2;
    return total / 2 - cover - (index - 1) * paper - index * STACK_CLEARANCE - paper / 2;
  }

  function finishProperties(cover = false) {
    const preset = PAPER_FINISHES[state.paperFinish];
    const glossiness = clamp((0.60 - state.paperRoughness) / 0.42, 0, 1);
    return {
      roughness: state.paperRoughness,
      clearcoat: Math.min(1, preset.clearcoat + (cover ? glossiness * 0.18 : 0)),
      clearcoatRoughness: Math.max(preset.coatRoughness, state.paperRoughness * 0.22),
      sheen: state.paperFinish === 'matte' ? 0.18 : 0.06,
      sheenRoughness: 0.65,
      bumpScale: state.paperFinish === 'matte' ? 0.004 : 0.0012
    };
  }

  function paperMaterial(map, side, cover) {
    const material = new THREE.MeshPhysicalMaterial({
      map, side, metalness: 0, ior: 1.47, specularIntensity: 1,
      sheenColor: new THREE.Color(0xf9f4ec), bumpMap: grain, roughnessMap: grain,
      ...finishProperties(cover)
    });
    material.userData.paperSurface = true;
    material.userData.coverSurface = cover;
    return material;
  }

  function refreshFinish() {
    model.traverse(object => {
      for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
        if (material.userData.paperSurface) Object.assign(material, finishProperties(material.userData.coverSurface));
      }
    });
  }

  // Four edge ribbons have their own sharp corner normals and follow the page bend.
  function pageEdges(thickness) {
    const positions = [], indices = [];
    const corners = [[-state.width / 2, 0], [state.width / 2, 0], [state.width / 2, -state.height], [-state.width / 2, -state.height]];
    for (let side = 0; side < 4; side++) {
      const a = corners[side], b = corners[(side + 1) % 4];
      const segments = side % 2 ? PAGE_SEGMENTS_Y : PAGE_SEGMENTS_X;
      const base = positions.length / 3;
      for (let step = 0; step <= segments; step++) {
        const t = step / segments, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        positions.push(x, y, thickness / 2, x, y, -thickness / 2);
        if (step < segments) {
          const vertex = base + step * 2;
          indices.push(vertex, vertex + 2, vertex + 1, vertex + 2, vertex + 3, vertex + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function leaf(frontKind, frontMonth, backKind, backMonth, index, cover = false) {
    const pivot = new THREE.Group(), thickness = stockThickness(cover);
    const frontGeometry = new THREE.PlaneGeometry(state.width, state.height, PAGE_SEGMENTS_X, PAGE_SEGMENTS_Y);
    frontGeometry.translate(0, -state.height / 2, thickness / 2);
    const backGeometry = frontGeometry.clone();
    backGeometry.translate(0, 0, -thickness);
    const uv = backGeometry.attributes.uv;
    for (let point = 0; point < uv.count; point++) {
      if (cover) uv.setX(point, 1 - uv.getX(point));
      else uv.setY(point, 1 - uv.getY(point));
    }
    const front = new THREE.Mesh(frontGeometry, paperMaterial(texture(frontKind, frontMonth), THREE.FrontSide, cover));
    const back = new THREE.Mesh(backGeometry, paperMaterial(texture(backKind, backMonth), THREE.BackSide, cover));
    const edgeGeometry = pageEdges(thickness);
    const edge = new THREE.Mesh(edgeGeometry, new THREE.MeshStandardMaterial({ color: cover ? 0xd2cabb : 0xebe6dc, roughness: 0.72, metalness: 0 }));
    for (const mesh of [front, back, edge]) { mesh.castShadow = true; mesh.receiveShadow = true; pivot.add(mesh); }
    model.add(pivot);
    const geometries = [frontGeometry, backGeometry, edgeGeometry];
    const baseDepths = geometries.map(geometry => Float32Array.from({ length: geometry.attributes.position.count }, (_, point) => geometry.attributes.position.getZ(point)));
    return { pivot, geometries, baseDepths, index, cover, thickness, angle: 0 };
  }

  function place(sheet, angle) {
    sheet.angle = angle;
    sheet.pivot.rotation.x = angle;
    const progress = clamp(-angle / Math.PI, 0, 1);
    const center = closedCenter(sheet);
    // Carry the stack offset along the rotating normal, including at 90°.
    // A world-Z-only offset collapses every turning leaf onto the same plane.
    sheet.pivot.position.y = -Math.sin(angle) * center;
    sheet.pivot.position.z = Math.cos(angle) * center;
    // Cover and contents share one turn surface: stock changes the bundle's
    // stiffness, not differential curvature that pushes pages through its shell.
    const flexibility = clamp((170 / Math.max(state.paperGsm, state.coverGsm)) ** 1.4, 0.25, 1.6);
    const turnBend = Math.sin(progress * Math.PI) * state.height * TURN_BEND_RATIO * flexibility;
    // A shared rest profile preserves stacked contact, while a shallow crown
    // makes real page normals carry the reflected light across the printed face.
    const restBend = state.height * (0.009 - closedPose * 0.007)
      * Math.sqrt(170 / state.paperGsm) * Math.sqrt(250 / state.coverGsm);
    const crown = state.height * (0.004 - closedPose * 0.0025);
    sheet.geometries.forEach((geometry, geometryIndex) => {
      const positions = geometry.attributes.position;
      for (let point = 0; point < positions.count; point++) {
        const fraction = -positions.getY(point) / state.height;
        const across = Math.cos(positions.getX(point) / state.width * Math.PI);
        positions.setZ(point, sheet.baseDepths[geometryIndex][point]
          + turnBend * Math.sin(fraction * Math.PI * 0.9)
          + restBend * Math.sin(fraction * Math.PI / 2)
          + crown * Math.sin(fraction * Math.PI) * across);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    });
  }

  /** Join both halves of each actual folded folio along the horizontal centerfold. */
  function syncSaddleFolds() {
    for (const fold of saddleFolds) {
      const positions = fold.geometry.attributes.position;
      const upper = leaves[fold.first], lower = leaves[fold.last];
      const upperY = upper.pivot.position.y, lowerY = lower.pivot.position.y;
      const upperZ = upper.pivot.position.z, lowerZ = lower.pivot.position.z;
      const stock = stockThickness(fold.first === 0);
      const radius = Math.max(stock / 2, Math.hypot(upperY - lowerY, upperZ - lowerZ) / 2 + stock / 2);
      // A folio closes with its own two hinges, not the camera's closedPose.
      // Rotate its crease with the lower half and keep both endpoints attached.
      const foldClosed = 1 - clamp(Math.abs(upper.angle - lower.angle) / Math.PI, 0, 1);
      const cosine = Math.cos(lower.angle), sine = Math.sin(lower.angle);
      for (let point = 0; point < positions.count; point++) {
        const fraction = fold.fractions[point];
        const openY = Math.sin(fraction * Math.PI * 2) * SADDLE_CREASE_WIDTH;
        const closedY = Math.sin(fraction * Math.PI) * radius;
        const archY = openY + (closedY - openY) * foldClosed;
        const archZ = -(1 - foldClosed) * Math.sin(fraction * Math.PI) * SADDLE_CREASE_WIDTH;
        positions.setY(point, upperY + (lowerY - upperY) * fraction + archY * cosine - archZ * sine);
        positions.setZ(point, upperZ + (lowerZ - upperZ) * fraction + archY * sine + archZ * cosine);
      }
      positions.needsUpdate = true;
      fold.geometry.computeVertexNormals();
      fold.geometry.computeBoundingSphere();
    }
  }

  /** Last turned leaf: reuse physical end faces without moving any month artwork. */
  function upperLeafIndex() {
    if(state.endSpread==='opening') return state.bindingStyle==='saddle'?0:-1;
    // Saddle p28/p29 are also solid; turn both padding leaves to reach p30/p31.
    if(state.endSpread==='closing') return state.bindingStyle==='saddle'?SADDLE_LEAF_COUNT-2:SHEET_COUNT-1;
    return state.month+(state.bindingStyle==='saddle'?1:0);
  }

  function buildSaddle() {
    validateSaddleImposition(state.year);
    const pageArtwork = page => ({kind:page.kind==='photo' && !page.key.startsWith('month-') ? 'cover' : page.kind,slot:page.kind==='photo' && !page.key.startsWith('month-') ? page.key : page.month ?? 0});
    for (let index = 0; index < SADDLE_LEAF_COUNT; index++) {
      const front = pageArtwork(saddlePage(index * 2 + 1, state.year));
      const back = pageArtwork(saddlePage(index * 2 + 2, state.year));
      const sheet = leaf(front.kind, front.slot, back.kind, back.slot, index, index===0 || index===SADDLE_LEAF_COUNT-1);
      sheet.pivot.name = `Reader pages ${index*2+1}/${index*2+2}`;
      leaves.push(sheet);
      place(sheet, state.previewClosed ? 0 : index <= upperLeafIndex() ? -Math.PI : 0);
    }
    for (let folio = 0; folio < SADDLE_SHEET_COUNT; folio++) {
      const group = new THREE.Group();
      group.name = `Folded sheet ${folio+1} · ${folio===0?'cover stock':'interior stock'}`;
      const last = SADDLE_LEAF_COUNT-1-folio;
      group.add(leaves[folio].pivot, leaves[last].pivot);
      const geometry = new THREE.PlaneGeometry(state.width, 1, 1, 16);
      const positions = geometry.attributes.position;
      const fractions = Array.from({length:positions.count}, (_,point) => .5-positions.getY(point));
      const material = new THREE.MeshStandardMaterial({color:folio===0?0xc2c1bc:0xe8e5de,roughness:0.94,side:THREE.DoubleSide});
      const crease = new THREE.Mesh(geometry,material);
      crease.castShadow = true;crease.receiveShadow = true;
      group.add(crease);model.add(group);
      saddleFolds.push({geometry,fractions,first:folio,last});
    }
    syncSaddleFolds();
    const metal = new THREE.MeshPhysicalMaterial({color:0xd7dce2,metalness:1,roughness:0.14,clearcoat:0.25,clearcoatRoughness:0.10});
    const stapleZ = stackThickness() / 2 + SADDLE_STAPLE_DEPTH;
    const staples = new THREE.Group();
    saddleStaples = staples;
    staples.rotation.x = -Math.PI / 2 * closedPose;
    model.add(staples);
    for (const x of [-state.width * .23, state.width * .23]) {
      const crown = new THREE.Mesh(new THREE.BoxGeometry(SADDLE_STAPLE_WIDTH,SADDLE_STAPLE_THICKNESS,SADDLE_STAPLE_DEPTH),metal);
      crown.position.set(x,0,stapleZ);crown.castShadow=true;staples.add(crown);
      for (const end of [-1,1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(SADDLE_STAPLE_DEPTH,SADDLE_STAPLE_DEPTH,stapleZ),metal);
        leg.position.set(x+end*SADDLE_STAPLE_WIDTH/2,0,stapleZ/2);staples.add(leg);
      }
    }
  }

  function rebuildWire() {
    frontCover = leaf('cover', 'front-cover', 'solid', 0, -1, true);
    place(frontCover, state.previewClosed ? 0 : -Math.PI);
    backCover = leaf('solid', 0, 'cover', 'back-cover', SHEET_COUNT, true);
    place(backCover, 0);
    for (let index = 0; index < SHEET_COUNT; index++) {
      const sheet = leaf(index === 0 ? 'solid' : 'grid', Math.max(0, index - 1), index === SHEET_COUNT-1 ? 'solid' : 'photo', index, index);
      leaves.push(sheet);
      place(sheet, state.previewClosed ? 0 : index <= upperLeafIndex() ? -Math.PI : 0);
    }
    const ringMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd7dce2, metalness: 1, roughness: 0.13, clearcoat: 0.25, clearcoatRoughness: 0.09 });
    const ringCount = clamp(Math.round(state.width * 1.7), 9, 35);
    for (let index = 0; index < ringCount; index++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.19, stackThickness() / 2 + 0.08), 0.041, 16, 48), ringMaterial);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-state.width / 2 + 0.3 + index * (state.width - 0.6) / (ringCount - 1), 0, 0);
      ring.castShadow = true;
      model.add(ring);
    }
  }

  function rebuild() {
    disposeModel();
    animation = null;
    closedPose = state.previewClosed ? 1 : 0;
    model.position.set(0, 0, 0);
    if (state.bindingStyle === 'saddle') buildSaddle();
    else rebuildWire();
    const span = Math.max(state.width, state.height * 2);
    key.shadow.camera.left = key.shadow.camera.bottom = -span;
    key.shadow.camera.right = key.shadow.camera.top = span;
    key.shadow.camera.far = 200;
    key.shadow.camera.updateProjectionMatrix();
    arrangeView();
    mediaRevision = assets.revision;
    colorSignature = currentColorSignature();
    backArtworkSignature = currentBackArtworkSignature();
    resize();
  }

  function arrangeView() {
    model.position.set(0, closedPose * state.height / 2, 0);
    if (saddleStaples) saddleStaples.rotation.x = -Math.PI / 2 * closedPose;
    const halfHeight = state.height * (1 - closedPose * 0.5);
    const studioSpan = Math.max(STUDIO_SPAN_MINIMUM, state.width, halfHeight * 2);
    key.position.copy(keyDirection).multiplyScalar(studioSpan * 2.5);
    key.shadow.camera.far = studioSpan * 5;
    key.shadow.camera.updateProjectionMatrix();
    rim.position.set(1.25, 0.75, -1.17).multiplyScalar(studioSpan);
    rearFill.position.set(-0.84, 0.34, -1.25).multiplyScalar(studioSpan);
    focus.position.set(-0.32, 0.72, 1.12).multiplyScalar(studioSpan);
    focus.target.position.set(0.08 * state.width, -halfHeight * 0.14, 0);
    focus.intensity = studioSpan * studioSpan * STUDIO_FOCUS_INTENSITY;
    for (const softbox of softboxes) {
      const intensity = softbox.illuminance * studioSpan * studioSpan * softbox.position.lengthSq() / softbox.lights.length;
      for (const sample of softbox.lights) {
        sample.light.position.copy(softbox.position).add(sample.offset).multiplyScalar(studioSpan);
        sample.light.intensity = intensity;
      }
    }
    grain.repeat.set(PAPER_GRAIN_REPEAT * state.width / 12, PAPER_GRAIN_REPEAT * state.height / 12);
    ground.position.y = -halfHeight - SHADOW_GROUND_GAP;
    shadowFade.value.set(state.width * 2.5, studioSpan * 3);
    const groundSpan = studioSpan * 48;
    ground.scale.set(groundSpan, groundSpan, 1);
    renderer.shadowMap.needsUpdate = true;
  }

  function resize() {
    renderDirty = true;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateDistance();
  }

  function updateDistance() {
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfHeight = state.height * (1 - closedPose * 0.5) + 0.25;
    distance = Math.max(halfHeight / Math.tan(halfFov), state.width / 2 / (Math.tan(halfFov) * camera.aspect)) * 1.22;
  }

  /** Retarget every hinge from its visible angle using the arrow-turn timing. */
  function moveToSelection() {
    const sheets = frontCover ? [frontCover, ...leaves, backCover] : leaves;
    const upperIndex = upperLeafIndex();
    const endAngles = sheets.map(sheet => state.previewClosed || sheet === backCover ? 0 : sheet === frontCover || sheet.index <= upperIndex ? -Math.PI : 0);
    animation = { start: performance.now(), sheets, startAngles: sheets.map(sheet => sheet.angle), endAngles,
      startPose: closedPose, endPose: state.previewClosed ? 1 : 0, month: state.month, previewClosed: state.previewClosed, endSpread: state.endSpread };
  }

  function label() {
    const bindingLabel = state.bindingStyle === 'saddle'
      ? 'Interactive top-bound saddle calendar: full photo above the horizontal centerfold, full calendar grid below; eight nested folded sheets and two staples.'
      : 'Interactive top-bound wire/coil calendar.';
    canvas.setAttribute('aria-label', state.previewClosed
      ? `Fully closed ${state.year} calendar, ${state.width} by ${state.height} inches. ${state.bindingStyle === 'saddle' ? 'Eight nested folded folios' : 'Thirteen interior sheets and two covers'}. Front exterior photo faces forward; rotate to inspect the back exterior, spine and paper edges. Procedural studio HDR, ${state.paperGsm} gsm interior, ${state.coverGsm} gsm cover, ${state.paperFinish} finish. Drag to rotate; scroll or pinch to zoom.`
      : state.endSpread ? `${calendarSelectionLabel(state)} spread. Both full-page halves are solid ${normalizeEndSpreadColor(state.endSpreadColor)}, with no photo or date grid. ${state.bindingStyle==='saddle'?'Eight nested folded sheets and two staples.':'Top-bound wire/coil calendar.'} Drag to rotate; scroll or pinch to zoom.`
      : `${MONTHS[state.month]} ${state.year}. ${bindingLabel} Drag to rotate through the front, edges and back; scroll or pinch to zoom.`);
  }

  /** Apply calendar dimensions, print guides, date convention and selected month. */
  function update(nextState = {}) {
    if (disposed) return;
    renderDirty = true;
    const next = { ...state, ...nextState };
    for (const field of ['width', 'height', 'margin', 'binding', 'bleed', 'year', 'week', 'month']) {
      if (!Number.isFinite(Number(next[field]))) next[field] = state[field];
      else next[field] = Number(next[field]);
    }
    next.width = clamp(next.width, 4, 24);
    next.height = clamp(next.height, 4, 24);
    next.margin = clamp(next.margin, 0, Math.min(next.width / 2, next.height / 2));
    next.binding = clamp(next.binding, 0, next.height - next.margin);
    next.year = clamp(Math.round(next.year), 100, 9999);
    next.week = next.week === 1 ? 1 : 0;
    next.bindingStyle = next.bindingStyle === 'saddle' ? 'saddle' : 'wire';
    next.previewClosed = typeof next.previewClosed === 'boolean' ? next.previewClosed : state.previewClosed;
    next.paperGsm = PAPER_WEIGHTS.includes(Number(next.paperGsm)) ? Number(next.paperGsm) : state.paperGsm;
    next.coverGsm = PAPER_WEIGHTS.includes(Number(next.coverGsm)) ? Number(next.coverGsm) : state.coverGsm;
    next.paperFinish = Object.hasOwn(PAPER_FINISHES, next.paperFinish) ? next.paperFinish : state.paperFinish;
    next.paperRoughness = Number.isFinite(Number(next.paperRoughness)) ? clamp(Number(next.paperRoughness), 0.18, 0.98) : state.paperRoughness;
    next.month = clamp(Math.round(next.month), 0, 11);
    next.endSpread = !next.previewClosed && END_SPREADS.includes(next.endSpread) ? next.endSpread : null;
    next.endSpreadColor = normalizeEndSpreadColor(next.endSpreadColor);
    const selectionChange = next.month !== state.month || next.previewClosed !== state.previewClosed || next.endSpread !== state.endSpread;
    const structuralChange = ['width', 'height', 'margin', 'binding', 'bleed', 'year', 'week', 'guides', 'bindingStyle', 'paperGsm', 'coverGsm', 'endSpreadColor'].some(field => next[field] !== state[field]);
    const nextHolidaySignature = JSON.stringify(next.holidays ?? null);
    const holidaysChanged = nextHolidaySignature !== holidaySignature;
    next.layout=normalizeLayout(next.layout);
    next.backCover=normalizeBackCover(next.backCover);
    next.artworkMetadata=normalizeArtworkMetadata(next.artworkMetadata);
    const nextLayoutSignature=JSON.stringify(next.layout),layoutChanged=nextLayoutSignature!==layoutSignature;
    const rebuildNeeded = !initialized || structuralChange || holidaysChanged || layoutChanged;
    state = next;
    holidaySignature = nextHolidaySignature;
    layoutSignature = nextLayoutSignature;
    if (rebuildNeeded) {
      rebuild();
      initialized = true;
    } else {
      refreshPhotos();
      refreshFinish();
      if (selectionChange) moveToSelection();
    }
    label();
  }

  /** Animate one bounded cover/end/month turn; notify the owner after completion. */
  function flip(direction) {
    if (disposed) return;
    const step = direction === 'prev' || direction === 'previous' || direction === -1 ? -1 : direction === 'next' || direction === 1 ? 1 : 0;
    const index=calendarSelectionIndex(state)+step;
    if (!step || index<0 || index>=CALENDAR_SELECTIONS.length) return;
    const target=CALENDAR_SELECTIONS[index];
    update({month:typeof target==='number'?target:state.month,previewClosed:target==='cover',endSpread:END_SPREADS.includes(target)?target:null});
  }

  /** Restore the front three-quarter camera without changing the selected month. */
  function resetView() { azimuth = DEFAULT_AZIMUTH; elevation = DEFAULT_ELEVATION; zoomFactor = 1; resize(); }

  listen(canvas, 'pointerdown', event => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  listen(canvas, 'pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (before > 0 && after > 0) zoomFactor = clamp(zoomFactor * before / after, 0.38, 3.5);
    } else {
      azimuth -= (event.clientX - previous.x) * 0.007;
      elevation = clamp(elevation + (event.clientY - previous.y) * 0.007, -Math.PI / 2 + 0.025, Math.PI / 2 - 0.025);
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  const release = event => { pointers.delete(event.pointerId); if (!pointers.size) canvas.style.cursor = 'grab'; };
  listen(canvas, 'pointerup', release);
  listen(canvas, 'pointercancel', release);
  listen(canvas, 'lostpointercapture', release);
  listen(canvas, 'wheel', event => {
    event.preventDefault();
    const amount = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
    zoomFactor = clamp(zoomFactor * Math.exp(amount * 0.001), 0.38, 3.5);
  }, { passive: false });
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  function tick(time) {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    if (animation) {
      const current = animation;
      const progress = clamp((time - current.start) / TURN_DURATION, 0, 1);
      const eased = ease(progress);
      closedPose = current.startPose + (current.endPose - current.startPose) * eased;
      current.sheets.forEach((sheet, index) => place(sheet, current.startAngles[index] + (current.endAngles[index] - current.startAngles[index]) * eased));
      arrangeView();
      updateDistance();
      renderer.shadowMap.needsUpdate = true;
      if (state.bindingStyle === 'saddle') syncSaddleFolds();
      if (progress === 1) {
        animation = null;
        label();
        container.dispatchEvent(new CustomEvent('calendar-month-change', { detail: { month: current.month, previewClosed: current.previewClosed, endSpread: current.endSpread } }));
      }
    }
    const cameraSignature = `${azimuth}:${elevation}:${distance}:${zoomFactor}`;
    // Expensive physical lighting runs only when artwork, pose or camera changes.
    if (!renderDirty && !animation && !renderer.shadowMap.needsUpdate && cameraSignature === lastCameraSignature) return;
    const radius = distance * zoomFactor;
    // Keep depth precision on sub-millimeter stock, including when zoomed far out.
    const near = Math.max(0.02, radius * 0.02);
    if (Math.abs(camera.near - near) > 0.0001) { camera.near = near; camera.updateProjectionMatrix(); }
    camera.position.set(radius * Math.sin(azimuth) * Math.cos(elevation), radius * Math.sin(elevation), radius * Math.cos(azimuth) * Math.cos(elevation));
    camera.up.set(-Math.sin(azimuth) * Math.sin(elevation), Math.cos(elevation), -Math.cos(azimuth) * Math.sin(elevation));
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    renderDirty = false;
    lastCameraSignature = cameraSignature;
  }

  /** Release GPU resources, controls, observers and the owned canvas. */
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    listeners.forEach(remove => remove());
    pointers.clear();
    disposeModel();
    key.shadow.map?.dispose();
    key.shadow.mapPass?.dispose();
    scene.environment = null;
    environment.dispose();
    grain.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    renderer.dispose();
    canvas.remove();
  }

  update(state);
  frame = requestAnimationFrame(tick);
  return { update, flip, resetView, dispose };
}
