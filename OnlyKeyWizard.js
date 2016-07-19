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
            prev: 'Step7'
        }
    };

    function Wizard() {
        this.steps = steps;
        this.currentSlot = {};
    }

    Wizard.prototype.init = function (myOnlyKey) {
        var self = this;
        self.onlyKey = myOnlyKey;
        self.currentStep = Object.keys(self.steps)[0];
        self.uiInit();

        self.steps.Step3.enterFn = function () {
            enableDisclaimer.call(self, 'passcode1Disclaimer');
            myOnlyKey.sendSetPin.call(myOnlyKey);
        };
        self.steps.Step3.exitFn = myOnlyKey.sendSetPin.bind(myOnlyKey);
        self.steps.Step4.enterFn = myOnlyKey.sendSetPin.bind(myOnlyKey);
        self.steps.Step4.exitFn = myOnlyKey.sendSetPin.bind(myOnlyKey);
        self.steps.Step5.enterFn = function () {
            enableDisclaimer.call(self, 'passcode2Disclaimer');
            myOnlyKey.sendSetSDPin.call(myOnlyKey);
        };
        self.steps.Step5.exitFn = myOnlyKey.sendSetSDPin.bind(myOnlyKey);
        self.steps.Step6.enterFn = myOnlyKey.sendSetSDPin.bind(myOnlyKey);
        self.steps.Step6.exitFn = myOnlyKey.sendSetSDPin.bind(myOnlyKey);
        self.steps.Step7.enterFn = function () {
            enableDisclaimer.call(self, 'passcode3Disclaimer');
            myOnlyKey.sendSetPDPin.call(myOnlyKey);
        };
        self.steps.Step7.exitFn = myOnlyKey.sendSetPDPin.bind(myOnlyKey);
        self.steps.Step8.enterFn = myOnlyKey.sendSetPDPin.bind(myOnlyKey);
        self.steps.Step8.exitFn = myOnlyKey.sendSetPDPin.bind(myOnlyKey);
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

        self.btnNext = document.getElementById('ButtonNext');
        self.btnPrev = document.getElementById('ButtonPrevious');
        self.btnFinal = document.getElementById('SubmitFinal');

        self.btnNext.onclick = moveStep.bind(this, 'next');
        self.btnPrev.onclick = moveStep.bind(this, 'prev');
        self.btnFinal.onclick = self.loadReview.bind(this);

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

        document.getElementById('closeFinal').addEventListener('click', function (e) {
            e.preventDefault();
            dialog.close(self.finalStepDialog);

            document.getElementById('slot-panel').classList.remove('hide');
            document.getElementById('init-panel').classList.add('hide');

            return false;
        });

        setActiveStepUI.call(this);
    };

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
            chkUserName: {
                input: form.txtUserName,
                msgId: 'USERNAME'
            },
            chkDelay1: {
                input: form.numDelay1,
                msgId: 'DELAY1'
            },
            tabReturn1: {
                input: form.tabReturn1,
                msgId: 'NEXTKEY1'
            },
            chkPassword: {
                input: form.txtPassword,
                msgId: 'PASSWORD'
            },
            chkDelay2: {
                input: form.numDelay2,
                msgId: 'DELAY2'
            },
            tabReturn2: {
                input: form.tabReturn2,
                msgId: 'NEXTKEY2'
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

    Wizard.prototype.setLabels = function (labels) {

    };

    function moveStep(direction) {
        // if a next/prev step exists, call current step-related exit function
        // and set new current step
        if (this.steps[this.currentStep][direction]) {
            if (this.steps[this.currentStep].exitFn) {
                this.steps[this.currentStep].exitFn(function (err, res) {
                    if (err) {
                        console.error(err);
                    } else {
                        console.info(res);
                        setNewCurrentStep.call(this, this.steps[this.currentStep][direction]);                    
                    }
                }.bind(this));
            } else {
                setNewCurrentStep.call(this, this.steps[this.currentStep][direction]);
            }
        }

        return false;
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
                // el.style.display = (stepId === this.currentStep ? '' : 'none');
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
            this.btnFinal.setAttribute('disabled', 'disabled');
        } else {
            this.btnNext.setAttribute('disabled', 'disabled');
            this.btnFinal.removeAttribute('disabled');
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
    };

    // This function handles loading the review table innerHTML for the user to review before final submission
    Wizard.prototype.loadReview = function () {
        this.onlyKey.sendSetPDPin.call(this.onlyKey);
        dialog.open(this.finalStepDialog);
        return;
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

function strPad(str, places, char) {
    while (str.length < places) {
        str = "" + (char || 0) + str;
    }

    return str;
}

// we owe russ a beer
// http://blog.tinisles.com/2011/10/google-authenticator-one-time-password-algorithm-in-javascript/
function base32tohex(base32) {
    var base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    var bits = "";
    var hex = "";

    for (var i = 0; i < base32.length; i++) {
        var val = base32chars.indexOf(base32.charAt(i).toUpperCase());
        bits += strPad(val.toString(2), 5, '0');
    }

    for (var i = 0; i+4 <= bits.length; i+=4) {
        var chunk = bits.substr(i, 4);
        hex = hex + parseInt(chunk, 2).toString(16) ;
    }
    return hex;

}
