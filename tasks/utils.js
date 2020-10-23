'use strict';

const { argv } = process;
const os = require('os');

module.exports.os = function () {
    switch (os.platform()) {
        case 'darwin':
            return 'osx';
        case 'linux':
            return 'linux';
        case 'win32':
            return 'windows';
    }
    return 'unsupported';
};

module.exports.replace = function (str, patterns) {
    Object.keys(patterns).forEach(function (pattern) {
        var matcher = new RegExp('{{' + pattern + '}}', 'g');
        str = str.replace(matcher, patterns[pattern]);
    });
    return str;
};

module.exports.getEnvName = getEnvName;

module.exports.getNodeModulesDir = function () {
    return getEnvName() === 'production'
        ? 'release_node_modules/node_modules'
        : 'node_modules';
};

function getEnvName () {
    return argv.env || 'development';
}
