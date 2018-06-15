// Remove all saved vault passwords in this app and prevent future saving
chrome.passwordsPrivate.getSavedPasswordList(passwords => {
    passwords.forEach((p, i) => chrome.passwordsPrivate.removeSavedPassword(i));
});

chrome.privacy.services.passwordSavingEnabled.set({ value: false });

// Wizard
(function () {
    var onlyKeyConfigWizard;

    function Wizard() {
        this.steps = {};
        this.currentSlot = {};
        this.dialog = new DialogMgr();
    }

    Wizard.prototype.init = function (myOnlyKey) {
        // reset all forms
        document.querySelectorAll('form').forEach(form => form.reset());

        this.onlyKey = myOnlyKey;
        this.initSteps();
        this.currentStep = Object.keys(this.steps)[0];
        this.uiInit();
    };

    Wizard.prototype.initSteps = function () {
        if (!this.onlyKey) {
            throw 'onlyKey instance is required before initializing wizard steps';
        }

        this.steps = {
            Step1: {
                next: 'Step2',
                noExit: true,
            },
            Step2: {
                prev: 'Step1',
                next: 'Step3',
                enterFn: () => {
                    this.enableDisclaimer('passcode1Disclaimer');
                    this.onlyKey.flushMessage(this.onlyKey.sendSetPin.call(this.onlyKey));
                },
                exitFn: this.onlyKey.sendSetPin.bind(this.onlyKey),
            },
            Step3: {
                prev: 'Step2',
                next: 'Step4',
                enterFn: this.onlyKey.sendSetPin.bind(this.onlyKey),
                exitFn: this.onlyKey.sendSetPin.bind(this.onlyKey),
            },
            Step4: {
                prev: 'Step3',
                next: 'Step5',
            },
            Step5: {
                prev: 'Step4',
                next: 'Step6',
                exitFn: (cb) => {
                    var dynamicSteps = Array.from(document.querySelectorAll('[data-step="Step8"],[data-step="Step9"]'));
                    var classListMethod = this.getMode() === 'TwoFactor' ? 'remove' : 'add';
        
                    dynamicSteps.forEach(function (el) {
                        el.classList[classListMethod]('hide');
                    });
        
                    return cb();
                },
            },
            Step6: {
                prev: 'Step5',
                next: 'Step7',
                enterFn: () => {
                    this.enableDisclaimer('passcode2Disclaimer');
                    this.onlyKey.sendSetSDPin.call(this.onlyKey);
                },
                exitFn: this.onlyKey.sendSetSDPin.bind(this.onlyKey),
            },
            Step7: {
                prev: 'Step6',
                next: 'Step8',
                enterFn: this.onlyKey.sendSetSDPin.bind(this.onlyKey),
                exitFn: (cb) => {
                    this.onlyKey.sendSetSDPi((err, res) => {
                        if (err || this.getMode() === 'TwoFactor') {
                            return cb(err, res);
                        }
        
                        this.dialog.open(this.finalStepDialog);
                        return cb(null, 'STOP');
                    });
                }
            },
            Step8: {
                prev: 'Step7',
                next: 'Step9',
                enterFn: () => {
                    this.enableDisclaimer('passcode3Disclaimer');
                    this.onlyKey.sendSetPDPin.call(this.onlyKey);
                },
            },
            Step9: {
                prev: 'Step8',
                next: 'Step10',
                enterFn: () => this.onlyKey.sendSetPDPin.bind(this.onlyKey),
                exitFn: () => {
                    this.onlyKey.sendSetPDPin.bind(this.onlyKey);
                    this.dialog.open(this.finalStepDialog);
                },
            },
            Step10: {
                prev: 'Step10',
            }
        };        
    };

    Wizard.prototype.enableDisclaimer = function (fieldName) {
        var field = this.initForm[fieldName];
        field.removeEventListener('change', this.enableDisclaimer);
        this.btnNext.disabled = !field.checked;
        field.addEventListener('change', (e) => {
            this.enableDisclaimer(fieldName);
        });
    };

    Wizard.prototype.uiInit = function () {
        this.initForm = document['init-panel'];

        this.setPIN = document.getElementById('SetPIN');
        this.setBackup = document.getElementById('SetBackup');
        this.setSDPIN = document.getElementById('SetSDPIN');
        this.setPDPIN = document.getElementById('SetPDPIN');
        this.btnNext = document.getElementById('ButtonNext');
        this.btnPrev = document.getElementById('ButtonPrevious');
        this.btnExit = document.getElementById('ButtonExit');

        this.btnNext.onclick = this.moveStep.bind(this, 'next');
        this.btnPrev.onclick = this.moveStep.bind(this, 'prev');

        this.btnExit.onclick = () => {
            this.setNewCurrentStep('Step1');
        };
        this.setPIN.onclick = () => {
            this.setNewCurrentStep('Step2');
            //this.onlyKey.sendSetPin();
        };
        this.setBackup.onclick = () => {
            this.setNewCurrentStep('Step4');
        };
        this.setSDPIN.onclick = () => {
            this.setNewCurrentStep('Step6');
        };
        this.setPDPIN.onclick = () => {
            this.setNewCurrentStep('Step8');
        };

        this.slotConfigForm = document['slot-config-form'];
        this.slotConfigDialog = document.getElementById('slot-config-dialog');

        this.finalStepDialog = document.getElementById('finalStep-dialog');

        this.slotWipe = document.getElementById('slotWipe');
        this.slotWipe.onclick = (e) => {
            document.getElementById('wipeCurrentSlotId').innerText = this.onlyKey.currentSlotId;
            this.dialog.open(this.slotWipeConfirmDialog, true);
            e && e.preventDefault && e.preventDefault();
        };

        this.slotWipeConfirmDialog = document.getElementById('slot-wipe-confirm');
        this.slotWipeConfirmBtn = document.getElementById('slotWipeConfirm');
        this.slotWipeConfirmBtn.onclick = (e) => {
            this.onlyKey.wipeSlot(null, null, (err, msg) => {
                // this.onlyKey.listen(function (err, msg) {
                    if (!err) {
                        this.slotConfigForm.reset();
                        this.onlyKey.getLabels();
                        this.dialog.closeAll();
                    }
                // });
            });

            e && e.preventDefault && e.preventDefault();
        };

        this.slotWipeCancelBtn = document.getElementById('slotWipeCancel');
        this.slotWipeCancelBtn.onclick = (e) => {
            this.dialog.close(this.slotWipeConfirmDialog);
            e && e.preventDefault && e.preventDefault();
        };

        this.slotSubmit = document.getElementById('slotSubmit');
        this.slotSubmit.onclick = (e) => {
            this.setSlot();
            e && e.preventDefault && e.preventDefault();
        };

        this.backupKeySubmit = document.getElementById('backupKeySubmit');
        this.backupKeySubmit.onclick = (e) => {
            this.submitBackupKey();
            e && e.preventDefault && e.preventDefault();
        };

        // BEGIN PRIVATE KEY SELECTOR
        this.selectPrivateKeyDialog = document.getElementById('select-private-key-dialog');
        this.selectPrivateKeyConfirmBtn = document.getElementById('selectPrivateKeyConfirm');
        this.selectPrivateKeyConfirmBtn.onclick = (e) => {
            e && e.preventDefault && e.preventDefault();
            var selectedKey = document.querySelector('input[name="rsaKeySelect"]:checked').value;
            this.onlyKey.confirmRsaKeySelect(this.onlyKey.tempRsaKeys[selectedKey]);
            this.onlyKey.tempRsaKeys = null;
            this.dialog.closeAll();
        };

        this.selectPrivateKeyCancelBtn = document.getElementById('selectPrivateKeyCancel');
        this.selectPrivateKeyCancelBtn.onclick = (e) => {
            e && e.preventDefault && e.preventDefault();
            this.onlyKey.tempRsaKeys = null;
            this.dialog.closeAll();
        };
        // END PRIVATE KEY SELECTOR

        this.backupKeyForm = document.getElementById('Step4');

        this.setActiveStepUI();
    };

    Wizard.prototype.initKeySelect = function (rawKey, cb) {
        if (! rawKey.primaryKey || ! rawKey.subKeys) {
            return cb('Cannot initialize key select form due to invalid keys object.');
        }

        var keys = [{
            name: 'Primary Key',
            p: rawKey.primaryKey.mpi[3].data.toByteArray(),
            q: rawKey.primaryKey.mpi[4].data.toByteArray()
        }];

        rawKey.subKeys.forEach((subKey, i) => {
            keys.push({
                name: 'Subkey ' + (i + 1),
                p: subKey.subKey.mpi[3].data.toByteArray(),
                q: subKey.subKey.mpi[4].data.toByteArray()
            });
        });

        this.onlyKey.tempRsaKeys = keys;

        var pkDiv = document.getElementById('private-key-options');
        pkDiv.innerHTML = "";

        keys.forEach((key, i) => {
            pkDiv.appendChild(makeRadioButton('rsaKeySelect', i, key.name));
            pkDiv.appendChild(document.createElement("br"));
        });

        pkDiv.appendChild(document.createElement("br"));

        this.dialog.open(this.selectPrivateKeyDialog, true);
    };

    Wizard.prototype.submitBackupKey = function (e) {
        this.backupKeySubmit.disabled = true;

        var type = 128;
        var slot = 31;
        var key1 = document.getElementById('backupPassphrase');
        var key2 = document.getElementById('backupPassphrasec');
        var formErrors = [];
        var formErrorsContainer = document.getElementById('initConfigErrors');

        formErrorsContainer.innerHTML = "";

        if (!key1.value) {
            formErrors.push('Passphrase cannot be empty.');
        }

        if (key1.value !== key2.value) {
            formErrors.push('Passphrase fields do not match');
            formErrors.push(key1.value.toString().replace(/\s/g,'').slice(0, 64));
            formErrors.push(key2.value.toString().replace(/\s/g,'').slice(0, 64));
        }

        if (key1.length < 25) {
            formErrors.push('Passphrase must be at least 25 characters');
        }

        if (formErrors.length) {
            // early exit
            var html = "<ul>";
            for (var i = 0; i < formErrors.length; i++) {
                html += "<li><blink>" + formErrors[i]; + "</blink></li>";
            }
            formErrorsContainer.innerHTML = html + "</ul>";

            this.backupKeySubmit.disabled = false;
            return;
        }

        formErrors.push(key1.value);
        key1 = openpgp.crypto.hash.digest(8, key1.value); //32 byte backup key is Sha256 hash of passphrase
        formErrors.push(key1);

        if (formErrors.length) {
            // early exit
            var html = "<ul>";
            for (var i = 0; i < formErrors.length; i++) {
                html += "<li><blink>" + formErrors[i]; + "</blink></li>";
            }
            formErrorsContainer.innerHTML = html + "</ul>";

            this.backupKeySubmit.disabled = false;
            return;
        }

        this.onlyKey.setPrivateKey(slot, type, key1, (err) => {
            this.onlyKey.listen(handleMessage);
            this.backupKeyForm.reset();
        });
    };

    Wizard.prototype.setSlot = function () {
        this.slotSubmit.disabled = true;
        this.slotWipe.disabled = true;

        var form = this.slotConfigForm;
        var formErrors = [];
        var formErrorsContainer = document.getElementById('slotConfigErrors');
        var fieldMap = {
            chkSlotLabel: {
                input: form.txtSlotLabel,
                msgId: 'LABEL'
            },
            chkSlotUrl: {
                input: form.txtSlotUrl,
                msgId: 'URL'
            },
            tabReturn4: {
                input: form.tabReturn4,
                msgId: 'NEXTKEY4'
            },
            tabReturn1: {
                input: form.tabReturn1,
                msgId: 'NEXTKEY1'
            },
            chkDelay1: {
                input: form.numDelay1,
                msgId: 'DELAY1'
            },
            chkUserName: {
                input: form.txtUserName,
                msgId: 'USERNAME'
            },
            tabReturn2: {
                input: form.tabReturn2,
                msgId: 'NEXTKEY2'
            },
            chkDelay2: {
                input: form.numDelay2,
                msgId: 'DELAY2'
            },
            chkPassword: {
                input: form.txtPassword,
                msgId: 'PASSWORD'
            },
            tabReturn5: {
                input: form.tabReturn5,
                msgId: 'NEXTKEY5'
            },
            tabReturn3: {
                input: form.tabReturn3,
                msgId: 'NEXTKEY3'
            },
            chkDelay3: {
                input: form.numDelay3,
                msgId: 'DELAY3'
            },
            mode: {
                input: form.mode,
                msgId: 'TFATYPE'
            },
            txt2FAUserName: {
                input: form.txt2FAUserName,
                msgId: 'TFAUSERNAME'
            }
        };

        formErrorsContainer.innerHTML = "";

        if (form.txtPassword.value !== form.txtPasswordConfirm.value) {
            formErrors.push('Password fields do not match');
        }

        if (formErrors.length) {
            // early exit
            var html = "<ul>";
            for (var i = 0; i < formErrors.length; i++) {
                html += "<li><blink>" + formErrors[i]; + "</blink></li>";
            }
            formErrorsContainer.innerHTML = html + "</ul>";

            this.slotSubmit.disabled = false;
            this.slotWipe.disabled = false;
            return;
        }

        // process all form fields
        for (var field in fieldMap) {
            var isChecked = false;
            var formValue = null;
            switch(form[field].type) {
                case 'checkbox':
                    if (form[field].checked) {
                        isChecked = true;
                        formValue = ('' + (fieldMap[field].input).value).trim();
                        form[field].checked = false;
                    }
                    break;
                case 'hidden':
                case 'number':
                case 'text':
                    var checkVar = ('' + (form[field].value)).trim();
                    if (checkVar.length) {
                        isChecked = true;
                        formValue = ('' + (fieldMap[field].input).value).trim();
                        form[field].value = '';
                    }
                    break;
                case undefined: // radios?
                    if (form[field].value !== '') {
                        isChecked = true;
                        formValue = (fieldMap[field].input).value;
                        clearRadios(field);
                    }
                    break;
                default:
                    break;
            }
            if (isChecked) {
                this.currentSlot[field] = formValue;
                switch(field) {
                    case 'txt2FAUserName':
                        if (this.currentSlot.mode === 'googleAuthOtp') {
                            console.info("BASE32 value:", formValue);
                            formValue = base32tohex(formValue.replace(/\s/g, ''));
                            formValue = formValue.match(/.{2}/g);
                            console.info("was converted to HEX:", formValue);
                        }
                        break;
                }

                this.onlyKey.setSlot(null, fieldMap[field].msgId, formValue, (err, msg) => {
                    if (!err) {
                        this.setSlot();
                    }
                });
                return;
            }
        }

        form.reset();
        this.currentSlot = {};
        this.slotSubmit.disabled = false;
        this.slotWipe.disabled = false;
        this.onlyKey.getLabels();
        this.dialog.close(this.slotConfigDialog);
    };

    Wizard.prototype.getMode = function () {
        return this.initForm['ConfigMode'].value;
    };

    Wizard.prototype.moveStep = function (direction) {
        // if a next/prev step exists, call current step-related exit function
        // and set new current step
        if (this.steps[this.currentStep][direction]) {
            if (this.steps[this.currentStep].exitFn) {
                this.steps[this.currentStep].exitFn((err, res) => {
                    if (err) {
                        console.error(err);
                        this.goBackOnError(err, res);
                    } else if (res !== 'STOP') {
                        this.setNewCurrentStep(this.steps[this.currentStep][direction]);
                    }
                });
            } else {
                this.setNewCurrentStep(this.steps[this.currentStep][direction]);
            }
        }

        return false;
    };

    Wizard.prototype.goBackOnError = function (err, lastMessageSent) {
        console.info(err, lastMessageSent);
        if (err) {
            switch (lastMessageSent) {
                case 'OKSETPIN':
                    this.setNewCurrentStep('Step2');
                    break;
                case 'OKSETSDPIN':
                    this.setNewCurrentStep('Step6');
                    break;
                case 'OKSETPDPIN':
                    this.setNewCurrentStep('Step8');
                    break;
            }
        }
    };

    Wizard.prototype.setNewCurrentStep = function (stepId) {
        this.currentStep = stepId;
        this.setActiveStepUI();

        // call new current step-related enter function
        if (this.steps[stepId].enterFn) {
            this.steps[stepId].enterFn(function (err, res) {
                if (err) {
                    console.error(err);
                } else {
                    console.info(res);
                }
            });
        }
    };

    Wizard.prototype.setActiveStepUI = function () {
        // set display style for all steps
        for(var stepId in this.steps) {
            var el = document.getElementById(stepId);
            if (el) {
                if (stepId === this.currentStep) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        }

        if (this.steps[this.currentStep].next) {
            this.btnNext.removeAttribute('disabled');
        } else {
            this.btnNext.setAttribute('disabled', 'disabled');
        }

        if (this.steps[this.currentStep].prev) {
            this.btnPrev.removeAttribute('disabled');
        } else {
            this.btnPrev.setAttribute('disabled', 'disabled');
        }

        if (this.steps[this.currentStep].noExit) {
            this.btnExit.classList.add('hide');
        } else {
            this.btnExit.classList.remove('hide');
        }

        return false;
    };

    Wizard.prototype.setLastMessages = function (messages) {
        var container = document.getElementById('lastMessage');
        var messageListItems = container.getElementsByTagName('li');

        container.getElementsByTagName('span')[0].innerText = messages[0].text;
        if (messages[1]) messageListItems[0].innerText = messages[1].text;
        if (messages[2]) messageListItems[1].innerText = messages[2].text;
    };

    Wizard.prototype.setSlotLabel = function (slot, label) {
        var slotLabel;
        if (typeof slot === 'number') {
            slot = slot;
            var slotLabels = Array.from(document.getElementsByClassName('slotLabel'));
            slotLabel = slotLabels[slot];
        } else {
            slot = slot.toLowerCase();
            slotLabel = document.getElementById('slotLabel' + slot);
        }
        slotLabel.innerText = label;
        if (label === 'empty') {
            slotLabel.classList.add('empty');
        } else {
            slotLabel.classList.remove('empty');
        }
    };

    document.addEventListener('DOMContentLoaded', function init() {
        console.info("Creating wizard instance...");
        onlyKeyConfigWizard = new Wizard();
        OnlyKeyHID(onlyKeyConfigWizard);
    }, false);
})();

class DialogMgr {
    open(el, keepOthersOpen) {
        if (!keepOthersOpen) {
            this.closeAll();
        }
        if (!el.open) {
            el.showModal();
        }
    }

    close(el) {
        if (el.open) {
            el.close();
        }
    }

    closeAll() {
        var allDialogs = document.getElementsByTagName('dialog');
        for (var i = 0; i < allDialogs.length; i++) {
            this.close(allDialogs[i]);
        }
    }
}

function clearRadios(name) {
    var btns = document.getElementsByName(name);
    for (var i = 0; i < btns.length; i++) {
        if(btns[i].checked) btns[i].checked = false;
    }
}

function makeRadioButton(name, value, text) {
    var label = document.createElement("label");
    var radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = value;

    label.appendChild(radio);
    label.appendChild(document.createTextNode(text));
    return label;
}
