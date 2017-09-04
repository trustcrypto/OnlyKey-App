const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');

// Creates a single webdriver instance that is available for all tests. Also
// includes an `after` hook to properly shut it down.

function createDriver() {
    // Use chromedriver that comes with nwjs
    let service = new chrome.ServiceBuilder(path.join(path.dirname(require.resolve('nw')), 'nwjs', 'chromedriver')).build();
    chrome.setDefaultService(service);

    // Point chromedriver to the nwjs app
    let options = new chrome.Options()
        .addArguments('nwapp=' + path.join(path.dirname(__dirname), 'build'));

    return new webdriver.Builder()
        .withCapabilities(webdriver.Capabilities.chrome())
        .setChromeOptions(options)
        .build();
}

after(function() {
    let driver = module.exports;
    return driver.quit();
});

module.exports = createDriver();
