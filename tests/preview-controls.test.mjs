import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/calendar/src/scripts/scene.js', import.meta.url), 'utf8');
const controls = source.slice(source.indexOf("  listen(canvas, 'pointerdown'"), source.indexOf('  const observer = new ResizeObserver'));
const POINTER_ID = 1;
const DRAG_STEP = 10;

/** Run the real pointer handlers without allocating a WebGL renderer. */
function createControls(mobile = false, pointerType = 'mouse', shiftKey = true) {
  const handlers = new Map();
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    addScaledVector(vector, scale) {
      this.x += vector.x * scale;
      this.y += vector.y * scale;
      this.z += vector.z * scale;
    }
  }
  const context = vm.createContext({
    mobile, pointers: new Map(),
    canvas: { style: {}, setPointerCapture() {}, getBoundingClientRect: () => ({ height: 600 }) },
    listen: (_canvas, type, handler) => handlers.set(type, handler),
    THREE: { Vector3, MathUtils: { degToRad: degrees => degrees * Math.PI / 180 } },
    camera: { fov: 36 }, distance: 30, zoomFactor: 1, azimuth: 0, elevation: 0,
    panOffset: new Vector3(), renderDirty: false, arranged: 0,
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    container: { clientHeight: 600 }
  });
  vm.runInContext('function arrangeView() { arranged++; }', context);
  vm.runInContext(controls, context);
  const dispatch = (type, x, extra = {}) => handlers.get(type)({
    pointerId: POINTER_ID, pointerType, shiftKey, clientX: x, clientY: x, ...extra
  });
  dispatch('pointerdown', 0);
  return { context, dispatch };
}

test('desktop Shift-drag translates on successive moves without orbiting', () => {
  const { context, dispatch } = createControls();
  dispatch('pointermove', DRAG_STEP);
  const firstX = context.panOffset.x;
  dispatch('pointermove', DRAG_STEP * 2);
  assert.ok(firstX > 0);
  assert.equal(context.panOffset.x, firstX * 2);
  assert.ok(context.panOffset.y < 0);
  assert.equal(context.azimuth, 0);
  assert.equal(context.elevation, 0);
  assert.equal(context.arranged, 2);
  assert.equal(context.renderDirty, true);
  assert.equal(context.canvas.style.cursor, 'move');
  dispatch('pointerup', DRAG_STEP * 2);
  assert.equal(context.pointers.size, 0);
  assert.equal(context.canvas.style.cursor, 'grab');
});

for (const [name, mobile, pointerType, shiftKey] of [
  ['ordinary desktop drag', false, 'mouse', false],
  ['mobile Shift-drag', true, 'mouse', true],
  ['touch with Shift', false, 'touch', true]
]) {
  test(`${name} rotates without translating`, () => {
    const { context, dispatch } = createControls(mobile, pointerType, shiftKey);
    dispatch('pointermove', DRAG_STEP);
    dispatch('pointermove', DRAG_STEP * 2);
    assert.ok(context.azimuth < 0);
    assert.ok(context.elevation > 0);
    assert.equal(context.panOffset.x, 0);
    assert.equal(context.panOffset.y, 0);
    assert.equal(context.arranged, 0);
  });
}

test('two touch pointers retain pinch zoom without translation', () => {
  const { context, dispatch } = createControls(true, 'touch', false);
  dispatch('pointerdown', DRAG_STEP, { pointerId: 2 });
  dispatch('pointermove', DRAG_STEP * 2, { pointerId: 2 });
  assert.equal(context.zoomFactor, 0.5);
  assert.equal(context.panOffset.x, 0);
  assert.equal(context.azimuth, 0);
});
