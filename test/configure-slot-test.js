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

    function expectDialogOpen(id) {
        var dialog = driver.findElement(By.id(id));
        return expect(dialog.getAttribute('open')).to.eventually.equal('true');
    }

    function expectDialogClosed(id) {
        var dialog = driver.findElement(By.id(id));
        return expect(dialog.getAttribute('open')).to.eventually.equal(null);
    }

    it('should start disconnected', function() {
        driver.wait(until.titleIs('OnlyKey Configuration Wizard'));
        return expectDialogOpen('disconnected-dialog');
    });

    it('should not show "working..." on startup', function() {
        return expectDialogClosed('working-dialog');
    });

    it('should show "working..." once a device is connected', function() {
        driver.executeScript(function() {
            console.log('Hello from executeScript');
            chromeHid.onDeviceAdded.mockDeviceAdded();
        });
        return expectDialogOpen('working-dialog');
    });

//    it('should show slot config dialog after clicking button 1a', function() {
//        driver.findElement(By.id('slot1aConfig')).click();
//        return expectDialogOpen('slot-config-dialog');
//    });
});
