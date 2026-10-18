import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesignZip } from '../public/calendar/src/scripts/design-zip.js';

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_HEADER_SIZE = 22;
const UTF8_FLAG = 0x0800;
const CRC_POLYNOMIAL = 0xedb88320;
const UINT32_MAX = 0xffffffff;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function crc32(bytes) {
  let result = UINT32_MAX;
  for (const byte of bytes) {
    result ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      result = (result >>> 1) ^ ((result & 1) ? CRC_POLYNOMIAL : 0);
    }
  }
  return (result ^ UINT32_MAX) >>> 0;
}

test('writes stored payloads, UTF-8 names, CRC32 and matching central directory records', async () => {
  const backing = new Uint8Array([99, 0, 255, 17, 99]);
  const fixtures = [
    { path: 'design.json', data: '123456789', bytes: encoder.encode('123456789') },
    { path: 'assets/été-猫.bin', data: backing.subarray(1, 4), bytes: new Uint8Array([0, 255, 17]) },
    { path: 'blob.txt', data: new Blob(['hello']), bytes: encoder.encode('hello') },
    { path: 'buffer.bin', data: new Uint8Array([8, 9]).buffer, bytes: new Uint8Array([8, 9]) },
    { path: 'empty', data: '', bytes: new Uint8Array() },
  ];
  const archive = await createDesignZip(fixtures);
  assert.equal(archive.type, 'application/zip');
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const offsets = [];
  let offset = 0;
  for (const fixture of fixtures) {
    offsets.push(offset);
    assert.equal(view.getUint32(offset, true), LOCAL_SIGNATURE);
    assert.equal(view.getUint16(offset + 4, true), 20);
    assert.equal(view.getUint16(offset + 6, true), UTF8_FLAG);
    assert.equal(view.getUint16(offset + 8, true), 0);
    assert.equal(view.getUint16(offset + 10, true), 0);
    assert.equal(view.getUint16(offset + 12, true), 0x21);
    const crc = crc32(fixture.bytes);
    assert.equal(view.getUint32(offset + 14, true), crc);
    if (fixture.path === 'design.json') assert.equal(crc, 0xcbf43926);
    assert.equal(view.getUint32(offset + 18, true), fixture.bytes.length);
    assert.equal(view.getUint32(offset + 22, true), fixture.bytes.length);
    const nameLength = view.getUint16(offset + 26, true);
    assert.equal(nameLength, encoder.encode(fixture.path).length);
    assert.equal(view.getUint16(offset + 28, true), 0);
    const nameStart = offset + LOCAL_HEADER_SIZE;
    assert.equal(decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)), fixture.path);
    const contentStart = nameStart + nameLength;
    assert.deepEqual(bytes.subarray(contentStart, contentStart + fixture.bytes.length), fixture.bytes);
    offset = contentStart + fixture.bytes.length;
  }
  const centralOffset = offset;
  for (const [index, fixture] of fixtures.entries()) {
    assert.equal(view.getUint32(offset, true), CENTRAL_SIGNATURE);
    assert.equal(view.getUint16(offset + 4, true), 20);
    assert.equal(view.getUint16(offset + 6, true), 20);
    assert.equal(view.getUint16(offset + 8, true), UTF8_FLAG);
    assert.equal(view.getUint16(offset + 10, true), 0);
    assert.equal(view.getUint32(offset + 16, true), crc32(fixture.bytes));
    assert.equal(view.getUint32(offset + 20, true), fixture.bytes.length);
    assert.equal(view.getUint32(offset + 24, true), fixture.bytes.length);
    const nameLength = view.getUint16(offset + 28, true);
    assert.equal(view.getUint16(offset + 30, true), 0);
    assert.equal(view.getUint16(offset + 32, true), 0);
    assert.equal(view.getUint16(offset + 34, true), 0);
    assert.equal(view.getUint32(offset + 42, true), offsets[index]);
    const nameStart = offset + CENTRAL_HEADER_SIZE;
    assert.equal(decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)), fixture.path);
    offset = nameStart + nameLength;
  }
  assert.equal(view.getUint32(offset, true), END_SIGNATURE);
  assert.equal(view.getUint16(offset + 4, true), 0);
  assert.equal(view.getUint16(offset + 6, true), 0);
  assert.equal(view.getUint16(offset + 8, true), fixtures.length);
  assert.equal(view.getUint16(offset + 10, true), fixtures.length);
  assert.equal(view.getUint32(offset + 12, true), offset - centralOffset);
  assert.equal(view.getUint32(offset + 16, true), centralOffset);
  assert.equal(view.getUint16(offset + 20, true), 0);
  assert.equal(bytes.length, offset + END_HEADER_SIZE);
  assert.deepEqual(new Uint8Array(await (await createDesignZip(fixtures)).arrayBuffer()), bytes);
});

test('supports an empty archive', async () => {
  const bytes = await (await createDesignZip([])).arrayBuffer();
  assert.equal(bytes.byteLength, END_HEADER_SIZE);
  const view = new DataView(bytes);
  assert.equal(view.getUint32(0, true), END_SIGNATURE);
  assert.equal(view.getUint32(12, true), 0);
  assert.equal(view.getUint32(16, true), 0);
});

test('rejects unsafe or lossy paths and duplicate filenames', async () => {
  for (const path of ['', '/absolute', '../escape', 'a/../b', './file', 'a/./b',
    'a//b', 'a/', 'C:/file', 'a\\b', 'nul\u0000file', 'line\nfile', '\ud800']) {
    await assert.rejects(createDesignZip([{ path, data: '' }]), /path|Unicode/i, path);
  }
  await assert.rejects(createDesignZip([
    { path: 'same', data: 'one' }, { path: 'same', data: 'two' },
  ]), /duplicate/i);
});

test('rejects unsupported entry data and invalid entry lists', async () => {
  for (const entries of [null, {}, 'files', [null], [{ path: 'a', data: 1 }]]) {
    await assert.rejects(createDesignZip(entries), TypeError);
  }
});

test('rejects ZIP32 count, filename, payload, and aggregate overflow before reading data', async () => {
  await assert.rejects(createDesignZip(new Array(0xffff)), /ZIP32/);
  await assert.rejects(createDesignZip([{ path: 'é'.repeat(32768), data: '' }]), /ZIP32/);
  class SizedBlob extends Blob {
    constructor(size) { super(); this.reportedSize = size; }
    get size() { return this.reportedSize; }
    slice() { throw new Error('Must validate sizes before reading payloads'); }
  }
  await assert.rejects(createDesignZip([{ path: 'a', data: new SizedBlob(UINT32_MAX) }]), /ZIP32/);
  await assert.rejects(createDesignZip([
    { path: 'a', data: new SizedBlob(0x80000000) },
    { path: 'b', data: new SizedBlob(0x80000000) },
  ]), /ZIP32/);
  await assert.rejects(createDesignZip([
    { path: 'a', data: new SizedBlob(UINT32_MAX - 64) },
  ]), /ZIP32/);
});

test('checksums Blob payloads across chunk boundaries', async () => {
  const data = new Uint8Array(1024 * 1024 + 13).fill(173);
  const archive = await createDesignZip([{ path: 'large.bin', data: new Blob([data]) }]);
  const view = new DataView(await archive.slice(0, LOCAL_HEADER_SIZE).arrayBuffer());
  assert.equal(view.getUint32(14, true), crc32(data));
});
