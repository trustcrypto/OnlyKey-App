/**
 * Tray/desktop preference storage (shared localStorage keys with the React app).
 * Ported from legacy app/scripts/userPreferences.js
 */
'use strict';

const PREFERENCE_KEYS = ['autoLaunch', 'autoUpdate', 'autoUpdateFW', 'closeToTray'];

function getBoolean(value) {
  return value !== 'false' && !!value;
}

function getBooleanString(value) {
  return value ? 'true' : 'false';
}

function defaultForKey(_key) {
  return true;
}

function readPreference(key) {
  if (typeof localStorage === 'undefined') return defaultForKey(key);
  const value = localStorage.getItem(key);
  if (value === null) return defaultForKey(key);
  return getBoolean(value);
}

function writePreference(key, value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, getBooleanString(getBoolean(value)));
}

class UserPreferences {
  constructor() {
    for (const key of PREFERENCE_KEYS) {
      this[`_${key}`] = readPreference(key);
    }
  }

  get autoLaunch() {
    return this._autoLaunch;
  }
  set autoLaunch(value) {
    this._autoLaunch = getBoolean(value);
    writePreference('autoLaunch', this._autoLaunch);
  }

  get autoUpdate() {
    this._autoUpdate = readPreference('autoUpdate');
    return this._autoUpdate;
  }
  set autoUpdate(value) {
    this._autoUpdate = getBoolean(value);
    writePreference('autoUpdate', this._autoUpdate);
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('onlykey-autoUpdate-changed'));
      }
    } catch {
      /* ignore */
    }
  }

  get autoUpdateFW() {
    this._autoUpdateFW = readPreference('autoUpdateFW');
    return this._autoUpdateFW;
  }
  set autoUpdateFW(value) {
    this._autoUpdateFW = getBoolean(value);
    writePreference('autoUpdateFW', this._autoUpdateFW);
  }

  get closeToTray() {
    this._closeToTray = readPreference('closeToTray');
    return this._closeToTray;
  }
  set closeToTray(value) {
    this._closeToTray = getBoolean(value);
    writePreference('closeToTray', this._closeToTray);
  }
}

module.exports = new UserPreferences();