import { loadProfile, profileFor } from './icc-proof.js';

export const SWOP_NAME = 'U.S. Web Coated (SWOP) v2';
export const SWOP_LICENSE_URL = new URL('../../profiles/Color%20Profile%20Bundling%20License_10.15.08.pdf#page=5', import.meta.url);
const SWOP_PROFILE_URL = new URL('../../profiles/USWebCoatedSWOP.icc', import.meta.url);
const SWOP_TARGET = 'adobe-us-web-coated-swop-v2';
const SWOP_PAPER = 'coated';
const CONSENT_KEY = 'calendar-builder-adobe-color-profile-license';
const LICENSE_VERSION = 'e48b16f124d16afd9981f8a55e7a96b3669538c340594bca088e116a6301eff8';
let sessionAccepted = false;
let pending;

/** Check explicit acceptance of this exact Adobe Exhibit B license version. */
export function swopAccepted() {
  if (sessionAccepted) return true;
  try { return globalThis.localStorage?.getItem(CONSENT_KEY) === LICENSE_VERSION; }
  catch { return false; }
}

/** Record agreement only after the user activates the license acceptance button. */
export function acceptSwopLicense() {
  sessionAccepted = true;
  try { globalThis.localStorage?.setItem(CONSENT_KEY, LICENSE_VERSION); }
  catch { /* Session consent remains valid when browser storage is unavailable. */ }
}

/** Return the standard coated offset reference, independent of user printer assignments. */
export function swopProfile() {
  return profileFor(SWOP_TARGET, SWOP_PAPER);
}

/** Fetch and load the unchanged Adobe ICC only after explicit license acceptance. */
export async function ensureSwopProfile() {
  if (!swopAccepted()) throw new Error('Agree to the Adobe Color Profile License Agreement before loading this profile.');
  if (swopProfile()) return swopProfile();
  if (!pending) {
    pending = (async () => {
      const response = await fetch(SWOP_PROFILE_URL);
      if (!response.ok) throw new Error('The SWOP profile could not be downloaded. Try again.');
      return loadProfile(SWOP_TARGET, SWOP_PAPER, new Uint8Array(await response.arrayBuffer()), 'USWebCoatedSWOP.icc');
    })().finally(() => { pending = undefined; });
  }
  return pending;
}
