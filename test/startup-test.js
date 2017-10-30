const webdriver = require('selenium-webdriver');
const By = webdriver.By;
const until = webdriver.until;
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;

const driver = require('./driver.js');

chai.use(chaiAsPromised);

// A first integration test. Mostly a proof of concept to show that Selenium,
// Mocha, and nwjs can work together.

describe('OnlyKey Configuration', function() {

    it('should start disconnected', function() {
        driver.navigate().refresh();
        driver.wait(until.titleIs('OnlyKey Configuration Wizard'));

        const disconnected = driver.findElement(By.id('disconnected-dialog'));
        return expect(disconnected.getAttribute('open')).to.eventually.equal('true');
    });

    it('should not show "working..." dialog', function() {
        driver.wait(until.titleIs('OnlyKey Configuration Wizard'));

        const working = driver.findElement(By.id('working-dialog'));
        return expect(working.getAttribute('open')).to.eventually.equal(null);
    });
});
