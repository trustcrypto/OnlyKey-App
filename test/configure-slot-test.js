const webdriver = require('selenium-webdriver');
const By = webdriver.By;
const until = webdriver.until;
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;

const driver = require('./driver.js');

chai.use(chaiAsPromised);

describe('Configuring a slot on the OnlyKey', function() {

    function expectDialogOpen(id) {
        let dialog = driver.findElement(By.id(id));
        return expect(dialog.getAttribute('open')).to.eventually.equal('true');
    }

    function expectDialogClosed(id) {
        let dialog = driver.findElement(By.id(id));
        return expect(dialog.getAttribute('open')).to.eventually.equal(null);
    }

    function messageToBuffer(msg) {
        let result = new Uint8Array(64);
        for (let i = 0; i < Math.min(msg.length, result.length); ++i) {
            result[i] = msg.charCodeAt(i);
        }
        return result;
    }

    it('should start disconnected', function() {
        driver.navigate().refresh();
        driver.wait(until.titleIs('OnlyKey Configuration Wizard'));
        return expectDialogOpen('disconnected-dialog');
    });

    it('should not show "working..." on startup', function() {
        return expectDialogClosed('working-dialog');
    });

    it('should show "working..." once a device is connected', function() {
        driver.executeScript(function() {
            chromeHid.onDeviceAdded.mockDeviceAdded();
        });
        return expectDialogOpen('working-dialog');
    });

    it('should ask users to unlock the key', function() {
        driver.executeScript(function(msg) {
            chromeHid.mockResponse([null, msg]);
        }, messageToBuffer('INITIALIZED'));
        return expectDialogOpen('locked-dialog');
    });

    it('should show slot config dialog after clicking button 1a', function() {
        ['UNLOCKED', 'OK', 'UNLOCKEDv0.2-beta.3', '\0', '\x01|FooLabel', '\x02|',
                '\x03|', '\x04|', '\x05|', '\x06|', '\x07|', '\x08|', '\x09|',
                '\x10|', '\x11|', '\x12|'].forEach(function(msgText) {
            driver.executeScript(function(msg) {
                chromeHid.mockResponse([null, msg]);
            }, messageToBuffer(msgText));
        });
        driver.findElement(By.id('slot1aConfig')).click();
        return expectDialogOpen('slot-config-dialog');
    });

    it('should show the correct label in the slot config dialog', function() {
        let label = driver.findElement(By.id('txtSlotLabel'));
        return expect(label.getAttribute('value')).to.eventually.equal('FooLabel');
    });

    it('should verify the password confirmation field', function() {
        driver.findElement(By.id('chkPassword')).click();
        driver.findElement(By.id('txtPassword')).sendKeys('FooPassword');
        driver.findElement(By.id('slotSubmit')).click();
        return expect(driver.findElement(By.id('slotConfigErrors')).getText())
            .to.eventually.contain('Password fields do not match');
    });

    it('should send the newly set password to the OnlyKey', function() {
        driver.findElement(By.id('txtPasswordConfirm')).sendKeys('FooPassword');
        driver.findElement(By.id('slotSubmit')).click();

        // We're expecting a password message containing [255, 255, 255, 255,
        // SETSLOT=230, slotnumber=1, field=5 (PASSWORD), "FooPassword"]
        let passwordMessage = driver.executeScript(function() {
            return new Uint8Array(chromeHid._sent[chromeHid._sent.length - 3][2]);
        });
        return expect(passwordMessage).to.eventually.deep.equal(
            Array.from(messageToBuffer('\xff\xff\xff\xff\xe6\x01\x05FooPassword')));
    });

    it('should send <Enter> after the password', function() {
        // For some reason, it's also setting NEXTKEY3 to 2 (Return).
        // FIXME is this a bug in the form? Should this be unchecked?
        // Anyway, expecting [255, 255, 255, 255,
        // SETSLOT=230, slotnumber=1, field=6 (NEXTKEY3), "2"]
        let nextKey3Message = driver.executeScript(function() {
            return new Uint8Array(chromeHid._sent[chromeHid._sent.length - 2][2]);
        });
        return expect(nextKey3Message).to.eventually.deep.equal(
            Array.from(messageToBuffer('\xff\xff\xff\xff\xe6\x01\x062')));
    });
});
