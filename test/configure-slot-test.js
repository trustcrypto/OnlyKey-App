var webdriver = require('selenium-webdriver'),
    By = webdriver.By,
    until = webdriver.until,
    chrome = require('selenium-webdriver/chrome'),
    nw = require('nw'),
    path = require('path'),
    chai = require('chai'),
    chaiAsPromised = require('chai-as-promised'),
    expect = chai.expect;

chai.use(chaiAsPromised);

describe('Configuring a slot on the OnlyKey', function() {

    var driver;

    before(function() {
        // Use chromedriver that comes with nwjs
        var service = new chrome.ServiceBuilder(path.join(path.dirname(require.resolve('nw')), 'nwjs', 'chromedriver')).build();
        chrome.setDefaultService(service);

        // Point chromedriver to the nwjs app
        var options = new chrome.Options()
            .addArguments('nwapp=' + path.dirname(__dirname));

        driver = new webdriver.Builder()
            .withCapabilities(webdriver.Capabilities.chrome())
            .setChromeOptions(options)
            .build();
    });

    after(function() {
        driver.quit();
    });

    // A helper to wait for a dialog to be open
    function waitForDialog(id) {
        return driver.wait(function() {
            var dialog = driver.findElement(By.id('disconnected-dialog'));
            var openPromise = dialog.getAttribute('open');
            var open = driver.wait(openPromise);
            return open === 'true';
        });
    }

    function isDialogOpen(id) {
        var dialog = driver.findElement(By.id(id));
        return expect(dialog.getAttribute('open')).to.eventually.equal('true');
    }

    it('should start disconnected', function() {
        driver.wait(until.titleIs('OnlyKey Configuration Wizard'));
        return isDialogOpen('disconnected-dialog');
    });

    it('should show "working..." once a device is connected', function() {
        driver.executeScript(function() {
            console.log('Hello from executeScript');
            chromeHid.onDeviceAdded.mockDeviceAdded();
        });
        return waitForDialog('working-dialog');
    });

    it('should show slot config dialog after clicking button 1a', function() {
        driver.findElement(By.id('slot1aConfig')).click();
        return waitForDialog('slot-config-dialog');
    });
});
