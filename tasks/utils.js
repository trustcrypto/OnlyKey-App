'use strict';

var argv = require('yargs').argv;
var os = require('os');
const child_process = require('child_process');

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

module.exports.getEnvName = function () {
    return argv.env || 'development';
};

module.exports.args = argv;

module.exports.exec = function exec(cmd) {
    console.log(`  ➣ ${cmd}`);
    const result = child_process.spawnSync(cmd, {shell: true, stdio: 'inherit'});
    if (result.status !== 0) {
        console.log(`\n🚨 Command failed with status ${result.status}\n`);
        if (result.error) console.log(result.error);
        process.exit(1);
    }
}
