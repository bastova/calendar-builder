(() => {
  'use strict';

  const FILE_LIMIT = 256 * 1024 * 1024;
  const DATABASE_NAME = 'calendar-browser-files-v1';
  const DATABASE_VERSION = 2;
  const GRANT_STORE = 'grants';
  const DEFAULT_LIST_LIMIT = 50;
  const MAX_LIST_LIMIT = 1000;
  const PICKER_CANCEL_DELAY = 500;
  const READ_PERMISSION = { mode: 'read' };
  let databasePromise;
  const sessionFiles = new Map();
  window.indexedDB?.deleteDatabase('calendar-assigned-photos-v1');

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error('IndexedDB is required to preserve photo folder selections.'));
          return;
        }
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(GRANT_STORE)) request.result.createObjectStore(GRANT_STORE, { keyPath: 'grantId' });
          else {
            // Discard legacy fallback photo copies; retain only the file manifest.
            const cursorRequest=request.transaction.objectStore(GRANT_STORE).openCursor();
            cursorRequest.onsuccess=()=>{const cursor=cursorRequest.result;if(!cursor)return;const record=cursor.value;if(record.kind==='snapshot'){record.kind='selection';record.files=record.files.map(({relativePath,entry})=>({relativePath,entry}));cursor.update(record);}cursor.continue();};
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => { database.close(); databasePromise = undefined; };
          resolve(database);
        };
        request.onerror = () => { databasePromise = undefined; reject(request.error); };
        request.onblocked = () => reject(new Error('Close other calendar tabs to update photo storage.'));
      });
    }
    return databasePromise;
  }

  async function storageRequest(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(GRANT_STORE, mode);
      const request = operation(transaction.objectStore(GRANT_STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error || new Error('Photo storage transaction failed.'));
      transaction.onerror = () => reject(transaction.error || request.error);
    });
  }

  function validatePath(relativePath, allowRoot = false) {
    if (typeof relativePath !== 'string' || (!relativePath && !allowRoot) ||
        relativePath.includes('\\') || relativePath.includes('\0') ||
        (relativePath && relativePath.split('/').some(part => !part || part === '.' || part === '..'))) {
      throw new Error('Invalid relative photo path.');
    }
    return relativePath;
  }

  async function isAvailable(record) {
    if (record.kind === 'selection') return sessionFiles.has(record.grantId);
    try { return await record.handle.queryPermission(READ_PERMISSION) === 'granted'; }
    catch { return false; }
  }

  async function describeGrant(record) {
    return { grantId: record.grantId, name: record.name, available: await isAvailable(record), persistence: 'persistent' };
  }

  async function requireGrant(grantId) {
    const record = await storageRequest('readonly', store => store.get(grantId));
    if (!record) throw new Error('Photo folder grant was revoked or not found.');
    if (!await isAvailable(record)) throw new Error('Folder permission unavailable. Reselect the same folder to restore access.');
    return record;
  }

  async function resolveHandle(record, relativePath) {
    const parts = relativePath ? relativePath.split('/') : [];
    let handle = record.handle;
    for (let index = 0; index < parts.length; index += 1) {
      if (index < parts.length - 1) handle = await handle.getDirectoryHandle(parts[index]);
      else {
        try { handle = await handle.getFileHandle(parts[index]); }
        catch (error) {
          if (error.name !== 'TypeMismatchError') throw error;
          handle = await handle.getDirectoryHandle(parts[index]);
        }
      }
    }
    return handle;
  }

  function fileEntry(name, relativePath, file) {
    return { name, relativePath, kind: 'file', size: file.size, modifiedAt: new Date(file.lastModified).toISOString(), mimeType: file.type };
  }

  function manifestEntries(record, relativeFolder) {
    const prefix = relativeFolder ? `${relativeFolder}/` : '';
    const entries = new Map();
    for (const item of record.files) {
      if (!item.relativePath.startsWith(prefix)) continue;
      const remainder = item.relativePath.slice(prefix.length);
      const separator = remainder.indexOf('/');
      if (separator < 0) entries.set(remainder, { ...item.entry });
      else {
        const name = remainder.slice(0, separator);
        entries.set(name, { name, relativePath: `${prefix}${name}`, kind: 'directory' });
      }
    }
    return [...entries.values()];
  }

  function selectDirectoryFiles() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      input.hidden = true;
      let finished = false;
      let cancelTimer;
      const finish = files => {
        if (finished) return;
        finished = true;
        clearTimeout(cancelTimer);
        window.removeEventListener('focus', onFocus);
        input.remove();
        resolve(files);
      };
      const onFocus = () => {
        cancelTimer = setTimeout(() => finish(input.files.length ? [...input.files] : null), PICKER_CANCEL_DELAY);
      };
      input.addEventListener('change', () => finish(input.files.length ? [...input.files] : null), { once: true });
      input.addEventListener('cancel', () => finish(null), { once: true });
      window.addEventListener('focus', onFocus);
      document.body.append(input);
      try { input.click(); }
      catch (error) { finish(null); reject(error); }
    });
  }

  /** Select a read-only folder; persist only its handle or file manifest and return a grant, or null on cancellation. */
  async function requestDirectory(options = {}) {
    if (options.persistence && options.persistence !== 'persistent') {
      throw new Error('Only persistent folder grants are supported.');
    }
    // Invoke the picker before awaiting storage so transient user activation is retained.
    let handle;
    let selectedFiles;
    if (typeof window.showDirectoryPicker === 'function') {
      try { handle = await window.showDirectoryPicker({ mode: 'read' }); }
      catch (error) {
        if (error.name === 'AbortError') return null;
        throw error;
      }
    } else {
      selectedFiles = await selectDirectoryFiles();
      if (!selectedFiles) return null;
    }
    const existing = await storageRequest('readonly', store => store.getAll());
    let previous;
    let record;
    if (handle) {
      for (const candidate of existing.filter(item => item.kind === 'handle')) {
        try { if (await handle.isSameEntry(candidate.handle)) { previous = candidate; break; } }
        catch { /* Inaccessible stale handles cannot establish folder identity. */ }
      }
      record = { kind: 'handle', name: handle.name, handle };
    } else {
      const name = selectedFiles[0].webkitRelativePath.split('/')[0];
      if (!name) throw new Error('This browser did not provide a directory-relative file selection.');
      const files = selectedFiles.map(file => {
        const relativePath = validatePath(file.webkitRelativePath.split('/').slice(1).join('/'));
        return { relativePath, entry: fileEntry(file.name, relativePath, file),  };
      });
      // A matching manifest avoids conflating unrelated same-named fallback folders.
      const fingerprint = JSON.stringify(files.map(item => [item.relativePath, item.entry.size, item.entry.modifiedAt]).sort((a, b) => a[0].localeCompare(b[0])));
      previous = existing.find(item => item.kind === 'selection' && item.name === name && item.fingerprint === fingerprint);
      record = { kind: 'selection', name, files, fingerprint };
    }
    record.grantId = previous?.grantId || `browser-folder-${crypto.randomUUID()}`;
    if(selectedFiles) sessionFiles.set(record.grantId,new Map(selectedFiles.map(file=>[file.webkitRelativePath.split('/').slice(1).join('/'),file])));
    await storageRequest('readwrite', store => store.put(record));
    return describeGrant(record);
  }

  /** Return persisted grants without prompting; native handles lacking read permission are marked unavailable. */
  async function getGrants() {
    const records = await storageRequest('readonly', store => store.getAll());
    return Promise.all(records.map(describeGrant));
  }

  /** List immediate folder children as {entries,total}, with stable directory-first ordering and pagination. */
  async function list(grantId, relativeFolder = '', options = {}) {
    validatePath(relativeFolder, true);
    const offset = options.offset ?? 0;
    const limit = options.limit ?? DEFAULT_LIST_LIMIT;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      throw new Error('Invalid folder pagination.');
    }
    const record = await requireGrant(grantId);
    let entries;
    if (record.kind === 'selection') {
      if (relativeFolder) await stat(grantId, relativeFolder).then(entry => {
        if (entry.kind !== 'directory') throw new Error('Selected path is not a folder.');
      });
      entries = manifestEntries(record, relativeFolder);
    } else {
      const directory = await resolveHandle(record, relativeFolder);
      if (directory.kind !== 'directory') throw new Error('Selected path is not a folder.');
      entries = [];
      for await (const [name, handle] of directory.entries()) {
        const relativePath = relativeFolder ? `${relativeFolder}/${name}` : name;
        if (handle.kind === 'directory') entries.push({ name, relativePath, kind: 'directory' });
        else entries.push(fileEntry(name, relativePath, await handle.getFile()));
      }
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
    return { entries: entries.slice(offset, offset + limit), total: entries.length };
  }

  /** Return current file metadata, including byte size and stable modifiedAt, or directory metadata. */
  async function stat(grantId, relativePath) {
    validatePath(relativePath);
    const record = await requireGrant(grantId);
    if (record.kind === 'selection') {
      const item = record.files.find(file => file.relativePath === relativePath);
      if (item) return { ...item.entry };
      if (record.files.some(file => file.relativePath.startsWith(`${relativePath}/`))) {
        return { name: relativePath.split('/').pop(), relativePath, kind: 'directory' };
      }
      throw new Error('Photo path was not found in the saved folder.');
    }
    const handle = await resolveHandle(record, relativePath);
    return handle.kind === 'file' ? fileEntry(handle.name, relativePath, await handle.getFile()) :
      { name: handle.name, relativePath, kind: 'directory' };
  }

  /** Read original files on demand without persisting their contents. */
  async function readFile(grantId, relativePath) {
    validatePath(relativePath);
    const record = await requireGrant(grantId);
    let file;
    if (record.kind === 'selection') {
      file=sessionFiles.get(grantId)?.get(relativePath);
      if(!file) throw new Error('Reselect this photo folder to restore access.');
    } else {
      const handle = await resolveHandle(record, relativePath);
      if (handle.kind !== 'file') throw new Error('Cannot read a folder as a photo.');
      file = await handle.getFile();
    }
    if (file.size <= 0 || file.size > FILE_LIMIT) throw new Error('Choose a nonempty image up to 256 MiB.');
    return file;
  }
  async function readBytes(grantId,relativePath) {
    return new Uint8Array(await (await readFile(grantId,relativePath)).arrayBuffer());
  }
  /** Called only from a user gesture so the browser can renew read permission. */
  async function restorePermission(grantId) {
    const record=await storageRequest('readonly',store=>store.get(grantId));
    if(!record) throw new Error('Saved folder not found. Choose the original folder again.');
    if(record.kind==='selection') throw new Error('Choose the original folder again to restore access in this browser.');
    if(await record.handle.requestPermission(READ_PERMISSION)!=='granted') throw new Error('Folder access was not granted.');
    return describeGrant(record);
  }

  /** Remove the app's persisted folder reference; this does not alter OS/browser-level directory permissions. */
  async function revoke(grantId) {
    sessionFiles.delete(grantId);
    await storageRequest('readwrite', store => store.delete(grantId));
  }

  window.Bezi = window.Bezi || {};
  window.Bezi.files = { requestDirectory, getGrants, list, stat, readBytes, readFile, restorePermission, revoke };
})();
