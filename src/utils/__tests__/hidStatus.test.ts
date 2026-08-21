import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../hidStatus');

import { getHidStatus } from '../hidStatus';

function setChromeHid(available: boolean) {
  (globalThis as typeof globalThis & { chrome?: { hid?: { getDevices?: unknown } } }).chrome = available
    ? { hid: { getDevices: () => undefined } }
    : { hid: {} };
}

describe('getHidStatus', () => {
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('reports ready when chrome.hid.getDevices exists', () => {
    setChromeHid(true);
    expect(getHidStatus()).toEqual({
      available: true,
      hint: 'HID API ready — polling for your device.',
    });
  });

  it('hints npm start on localhost without HID', () => {
    setChromeHid(false);
    expect(getHidStatus().available).toBe(false);
    expect(getHidStatus().hint).toMatch(/localhost/i);
  });

  it('hints generic npm start off localhost', () => {
    setChromeHid(false);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname: 'app.example' },
    });
    expect(getHidStatus().hint).toBe('HID API unavailable. Run the app with: npm start');
  });
});
