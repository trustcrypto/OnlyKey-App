// Remove all saved vault passwords in this app and prevent future saving
chrome.passwordsPrivate.getSavedPasswordList(passwords => {
    passwords.forEach((p, i) => chrome.passwordsPrivate.removeSavedPassword(i));
});

chrome.privacy.services.passwordSavingEnabled.set({ value: false });

// Wizard
(function () {
    var onlyKeyConfigWizard;
    var dialog = new dialogMgr();

    var steps = {
        Step1: {
            next: 'Step2'
        },
        Step2: {
            prev: 'Step1',
            next: 'Step3'
        },
        Step3: {
            prev: 'Step2',
            next: 'Step4'
        },
        Step4: {
            prev: 'Step3',
            next: 'Step5'
        },
        Step5: {
            prev: 'Step4',
            next: 'Step6'
        },
        Step6: {
            prev: 'Step5',
            next: 'Step7'
        },
        Step7: {
            prev: 'Step6',
            next: 'Step8'
        },
        Step8: {
            prev: 'Step7',
            next: 'Step9'
        },
        Step9: {
            prev: 'Step8',
            next: 'Step10'
        },
        Step10: {
            prev: 'Step10'
        }
    };

    function Wizard() {
        this.steps = steps;
        this.currentSlot = {};
    }

    Wizard.prototype.init = function (myOnlyKey) {
        // reset all forms
        document.querySelectorAll('form').forEach(form => form.reset());

        var self = this;
        self.onlyKey = myOnlyKey;
        self.currentStep = Object.keys(self.steps)[0];
        self.uiInit();

        self.steps.Step5.exitFn = function (cb) {
            var dynamicSteps = Array.from(document.querySelectorAll('[data-step="Step8"],[data-step="Step9"]'));
            var classListMethod = self.getMode() === 'TwoFactor' ? 'remove' : 'add';

            dynamicSteps.forEach(function (el) {
                el.classList[classListMethod]('hide');
            });

            return cb();
        };
        self.steps.Step2.enterFn = function () {
            enableDisclaimer.call(self, 'passcode1Disclaimer');
            myOnlyKey.sendSetPin.call(myOnlyKey);
        };
        self.steps.Step2.exitFn = myOnlyKey.sendSetPin.bind(myOnlyKey);
        self.steps.Step3.enterFn = myOnlyKey.sendSetPin.bind(myOnlyKey);
        self.steps.Step3.exitFn = myOnlyKey.sendSetPin.bind(myOnlyKey);
        self.steps.Step6.enterFn = function () {
            enableDisclaimer.call(self, 'passcode2Disclaimer');
            myOnlyKey.sendSetSDPin.call(myOnlyKey);
        };
        self.steps.Step6.exitFn = myOnlyKey.sendSetSDPin.bind(myOnlyKey);
        self.steps.Step7.enterFn = myOnlyKey.sendSetSDPin.bind(myOnlyKey);
        self.steps.Step7.exitFn = function (cb) {
            myOnlyKey.sendSetSDPin.call(myOnlyKey, function (err, res) {
                if (err || self.getMode() === 'TwoFactor') {
                    return cb(err, res);
                }

                dialog.open.call(null, self.finalStepDialog);
                return cb(null, 'STOP');
            });
        };
        self.steps.Step8.enterFn = function () {
            enableDisclaimer.call(self, 'passcode3Disclaimer');
            myOnlyKey.sendSetPDPin.call(myOnlyKey);
        };
        self.steps.Step8.exitFn = myOnlyKey.sendSetPDPin.bind(myOnlyKey);
        self.steps.Step9.enterFn = myOnlyKey.sendSetPDPin.bind(myOnlyKey);
        self.steps.Step9.exitFn = myOnlyKey.sendSetPDPin.bind(myOnlyKey);
        self.steps.Step9.enterFn = dialog.open.bind(null, self.finalStepDialog);
    };

    function enableDisclaimer(fieldName) {
        var self = this;
        var field = self.initForm[fieldName];
        field.removeEventListener('change', enableDisclaimer);
        self.btnNext.disabled = !field.checked;
        field.addEventListener('change', function (e) {
            enableDisclaimer.call(self, fieldName);
        });
    }

    Wizard.prototype.uiInit = function () {
        var self = this;

        self.initForm = document['init-panel'];

        self.setPIN = document.getElementById('SetPIN');
        self.setBackup = document.getElementById('SetBackup');
        self.setSDPIN = document.getElementById('SetSDPIN');
        self.setPDPIN = document.getElementById('SetPDPIN');
        self.btnNext = document.getElementById('ButtonNext');
        self.btnPrev = document.getElementById('ButtonPrevious');
        self.btnExit = document.getElementById('ButtonExit');

        self.btnNext.onclick = moveStep.bind(this, 'next');
        self.btnPrev.onclick = moveStep.bind(this, 'prev');

        self.btnExit.onclick = function () {
          setNewCurrentStep.call(onlyKeyConfigWizard, 'Step1');
        };
        self.setPIN.onclick = function () {
          setNewCurrentStep.call(onlyKeyConfigWizard, 'Step2');
          //self.onlyKey.sendSetPin.call(self.onlyKey);
        };
        self.setBackup.onclick = function () {
          setNewCurrentStep.call(onlyKeyConfigWizard, 'Step4');
        };
        self.setSDPIN.onclick = function () {
          setNewCurrentStep.call(onlyKeyConfigWizard, 'Step6');
        };
        self.setPDPIN.onclick = function () {
          setNewCurrentStep.call(onlyKeyConfigWizard, 'Step8');
        };

        self.slotConfigForm = document['slot-config-form'];
        self.slotConfigDialog = document.getElementById('slot-config-dialog');

        self.finalStepDialog = document.getElementById('finalStep-dialog');

        self.slotWipe = document.getElementById('slotWipe');
        self.slotWipe.onclick = function (e) {
            document.getElementById('wipeCurrentSlotId').innerText = self.onlyKey.currentSlotId;
            dialog.open(self.slotWipeConfirmDialog, true);
            e && e.preventDefault && e.preventDefault();
        };

        self.slotWipeConfirmDialog = document.getElementById('slot-wipe-confirm');
        self.slotWipeConfirmBtn = document.getElementById('slotWipeConfirm');
        self.slotWipeConfirmBtn.onclick = function (e) {
            self.onlyKey.wipeSlot(null, null, function (err, msg) {
                // self.onlyKey.listen(function (err, msg) {
                    if (!err) {
                        self.slotConfigForm.reset();
                        self.onlyKey.getLabels();
                        dialog.closeAll();
                    }
                // });
            });

            e && e.preventDefault && e.preventDefault();
        };

        self.slotWipeCancelBtn = document.getElementById('slotWipeCancel');
        self.slotWipeCancelBtn.onclick = function (e) {
            dialog.close(self.slotWipeConfirmDialog);
            e && e.preventDefault && e.preventDefault();
        };

        self.slotSubmit = document.getElementById('slotSubmit');
        self.slotSubmit.onclick = function (e) {
            setSlot.call(self);
            e && e.preventDefault && e.preventDefault();
        };

        self.backupKeySubmit = document.getElementById('backupKeySubmit');
        self.backupKeySubmit.onclick = function (e) {
            submitBackupKey.call(self);
            e && e.preventDefault && e.preventDefault();
        };

        // BEGIN PRIVATE KEY SELECTOR
        self.selectPrivateKeyDialog = document.getElementById('select-private-key-dialog');
        self.selectPrivateKeyConfirmBtn = document.getElementById('selectPrivateKeyConfirm');
        self.selectPrivateKeyConfirmBtn.onclick = function (e) {
            e && e.preventDefault && e.preventDefault();
            var selectedKey = document.querySelector('input[name="rsaKeySelect"]:checked').value;
            self.onlyKey.confirmRsaKeySelect(self.onlyKey.tempRsaKeys[selectedKey]);
            self.onlyKey.tempRsaKeys = null;
            dialog.closeAll();
        };

        self.selectPrivateKeyCancelBtn = document.getElementById('selectPrivateKeyCancel');
        self.selectPrivateKeyCancelBtn.onclick = function (e) {
            e && e.preventDefault && e.preventDefault();
            self.onlyKey.tempRsaKeys = null;
            dialog.closeAll();
        };
        // END PRIVATE KEY SELECTOR

        setActiveStepUI.call(this);
    };

    Wizard.prototype.initKeySelect = function (rawKey, cb) {
        var self = this;

        if (! rawKey.primaryKey || ! rawKey.subKeys) {
            return cb('Cannot initialize key select form due to invalid keys object.');
        }

        var keys = [{
            name: 'Primary Key',
            p: rawKey.primaryKey.mpi[3].data.toByteArray(),
            q: rawKey.primaryKey.mpi[4].data.toByteArray()
        }];

        rawKey.subKeys.forEach(function (subKey, i) {
            keys.push({
                name: 'Subkey ' + (i + 1),
                p: subKey.subKey.mpi[3].data.toByteArray(),
                q: subKey.subKey.mpi[4].data.toByteArray()
            });
        });

        self.onlyKey.tempRsaKeys = keys;

        var pkDiv = document.getElementById('private-key-options');
        pkDiv.innerHTML = "";

        keys.forEach(function (key, i) {
            pkDiv.appendChild(makeRadioButton('rsaKeySelect', i, key.name));
            pkDiv.appendChild(document.createElement("br"));
        });

        pkDiv.appendChild(document.createElement("br"));

        dialog.open(self.selectPrivateKeyDialog, true);
    };

    function submitBackupKey(e) {
        var self = this; // wizard

        self.backupKeySubmit.disabled = true;

        var form = self.initForm;
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

            self.backupKeySubmit.disabled = false;
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

            self.backupKeySubmit.disabled = false;
            return;
        }

        self.onlyKey.setPrivateKey(slot, type, key1, function (err) {
            self.onlyKey.listen(handleMessage);
            ui.backupKeyForm.reset();
        });

    }

    function setSlot() {
        var self = this; // wizard

        self.slotSubmit.disabled = true;
        self.slotWipe.disabled = true;

        var form = self.slotConfigForm;
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

            self.slotSubmit.disabled = false;
            self.slotWipe.disabled = false;
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
                self.currentSlot[field] = formValue;
                switch(field) {
                    case 'txt2FAUserName':
                        if (self.currentSlot.mode === 'googleAuthOtp') {
                            console.info("BASE32 value:", formValue);
                            formValue = base32tohex(formValue.replace(/\s/g, ''));
                            formValue = formValue.match(/.{2}/g);
                            console.info("was converted to HEX:", formValue);
                        }
                        break;
                }

                self.onlyKey.setSlot(null, fieldMap[field].msgId, formValue, function (err, msg) {
                    if (!err) {
                        setSlot.call(self);
                    }
                });
                return;
            }
        }

        form.reset();
        self.currentSlot = {};
        self.slotSubmit.disabled = false;
        self.slotWipe.disabled = false;
        self.onlyKey.getLabels();
        dialog.close(self.slotConfigDialog);
    }

    Wizard.prototype.getMode = function () {
        return this.initForm['ConfigMode'].value;
    };

    function moveStep(direction) {
        // if a next/prev step exists, call current step-related exit function
        // and set new current step
        if (this.steps[this.currentStep][direction]) {
            if (this.steps[this.currentStep].exitFn) {
                this.steps[this.currentStep].exitFn(function (err, res) {
                    if (err) {
                        console.error(err);
                        goBackOnError(err, res);
                    } else if (res !== 'STOP') {
                        setNewCurrentStep.call(this, this.steps[this.currentStep][direction]);
                    }
                }.bind(this));
            } else {
                setNewCurrentStep.call(this, this.steps[this.currentStep][direction]);
            }
        }

        return false;
    }

    function goBackOnError(err, lastMessageSent) {
        console.info(err, lastMessageSent);
        if (err) {
            switch (lastMessageSent) {
                case 'OKSETPIN':
                    setNewCurrentStep.call(onlyKeyConfigWizard, 'Step2');
                    break;
                case 'OKSETSDPIN':
                    setNewCurrentStep.call(onlyKeyConfigWizard, 'Step6');
                    break;
                case 'OKSETPDPIN':
                    setNewCurrentStep.call(onlyKeyConfigWizard, 'Step8');
                    break;
            }
        }
    }

    function setNewCurrentStep(stepId) {
        this.currentStep = stepId;
        setActiveStepUI.call(this);

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
    }

    function setActiveStepUI() {
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

        var header = document.getElementById('HeaderTable');
        var tabs = header.getElementsByTagName("td");

        for (var i = 0; i < tabs.length; i++) {
            if(tabs[i].getAttribute("data-step") === this.currentStep) {
                tabs[i].classList.add('active');
            } else {
                    tabs[i].classList.remove('active');
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
        return false;
    }

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

function dialogMgr() {
    var self = this;
    self.open = function (el, keepOthersOpen) {
        if (!keepOthersOpen) {
            self.closeAll();
        }
        if (!el.open) {
            el.showModal();
        }
    };

    self.close = function (el) {
        if (el.open) {
            el.close();
        }
    };

    self.closeAll = function () {
        var allDialogs = document.getElementsByTagName('dialog');
        for (var i = 0; i < allDialogs.length; i++) {
            self.close(allDialogs[i]);
        }
    };
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
