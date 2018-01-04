/* Simple interface for localStorage */

let onlyKeyAppUserPreferences; // singleton

(function() {
    'use strict';

    class UserPreferences {
        constructor(params = {}) {
            const keys = ['autoLaunch', 'autoUpdate'];
            keys.forEach(key => this[`_${key}`] = this.getPropVal(key));
        }

        get autoLaunch() {
            return this.getPropVal('autoLaunch');
        }

        set autoLaunch(value) {
            this._autoLaunch = getBoolean(value);
            typeof localStorage !== 'undefined' && (localStorage.autoLaunch = getBooleanString(value));
        }

        get autoUpdate() {
            return this.getPropVal('autoUpdate');
        }

        set autoUpdate(value) {
            this._autoUpdate = getBoolean(value);
            typeof localStorage !== 'undefined' && (localStorage.autoUpdate = getBooleanString(value));
        }

        getPropVal(key) {
            if (this.hasOwnProperty(`_${key}`)) {
                return this[`_${key}`];
            } else if (typeof localStorage !== 'undefined' && localStorage.hasOwnProperty(key)) {
                return getBoolean(localStorage[key]);
            } else {
                return true;
            }
        }
    }

    onlyKeyAppUserPreferences = onlyKeyAppUserPreferences || new UserPreferences();
    if (module && module.exports) {
        module.exports = onlyKeyAppUserPreferences;
    } else {
        return onlyKeyAppUserPreferences;
    }

    /* private helpers */
    function getBoolean(value) {
        if (value === 'false' || !value) {
            return false;
        }

        return true;
    }

    function getBooleanString(value) {
        if (value === 'false' || !value) {
            return 'false';
        }

        return 'true';
    }
})();
