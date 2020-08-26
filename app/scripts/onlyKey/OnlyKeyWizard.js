if (chrome.passwordsPrivate) {
  // Remove all saved vault passwords in this app and prevent future saving
  chrome.passwordsPrivate.getSavedPasswordList(passwords => {
    passwords.forEach((p, i) => chrome.passwordsPrivate.removeSavedPassword(i));
  });

  chrome.privacy.services.passwordSavingEnabled.set({
    value: false
  });
}

// Wizard
(function () {
  const STEP1 = 'Step1', NEXT = 'next';

  let onlyKeyConfigWizard;

  function Wizard() {
    this.steps = {};
    this.dialog = new DialogMgr();
    this.currentSlot = {};
  }

  Wizard.prototype.init = function (myOnlyKey) {
    // reset all forms
    document.querySelectorAll('form').forEach(form => form.reset());

    this.setAdvancedSetup(false);
    this.onlyKey = myOnlyKey;
    this.initSteps();
    this.currentStep = null;
    this.uiInit();
    this.reset();
  };

  Wizard.prototype.initSteps = function () {
    const deviceType = this.onlyKey && this.onlyKey.getDeviceType();
    switch (deviceType) {
      case 'classic':
        this.initClassicSteps();
        break;
      case 'go':
      default:
        this.initGoSteps();
        break;
    }
    console.log(`Wizard.initSteps() called with ${deviceType}`);
  };

  Wizard.prototype.initGoSteps = function () {
    this.steps = {
      Step1: {
        enterFn: this.setGuided.bind(this, true),
        next: this.advancedSetup ? 'Step2' : 'Step8',
        noExit: true,
      },
      Step2: {
        prev: 'Step1',
        next: 'Step8',
        disclaimerTrigger: 'passcode1Disclaimer',
        enterFn: (cb) => {
          if (!this.checkInitialized()) {
            document.getElementById('step2-text').innerHTML = `
              <h3>Change PINs</h3>
              <p>
                Make sure to choose PINs that you will not forget and that only you know.
                It is also good to keep a secure backup of your PINs somewhere in case you forget.
              </p>
              <p>
                DISCLAIMER &mdash; I understand that there is no way to recover my PINs, and,
                if I forget my PINs, the only way to recover my OnlyKey GO is to perform a
                factory reset which wipes all sensitive information.
              </p>
              <label>
                <input type='checkbox' name='passcode1Disclaimer' />
                I understand and accept the above risk.
              </label>
              <p>
                <strong>Enter 7-16 digits for each PIN:</strong>
              </p>
              <div class='flex-container'>
                <div class='flex-item col-3'>
                  <p class='center'>
                    <u>Primary Profile</u><br/>
                    <input type='password' id='goPrimaryPin' name='goPrimaryPin' required maxlength='16' placeholder='Primary PIN' /><br/>
                    <input type='password' id='goPrimaryPinConfirm' name='goPrimaryPinConfirm' required maxlength='16' placeholder='Confirm' /><br/>
                    [required]
                  </p>
                  <p id='goPrimaryPinErrors' class='form-error'></p>
                </div>
                <div class='flex-item col-3'>
                  <p class='center'>
                    <u>Secondary Profile</u><br/>
                    <input type='password' id='goSecondaryPin' name='goSecondaryPin' required maxlength='16' placeholder='Secondary PIN' /><br/>
                    <input type='password' id='goSecondaryPinConfirm' name='goSecondaryPinConfirm' required maxlength='16' placeholder='Confirm' /><br/>
                    [optional]
                  </p>
                  <p id='goSecondaryPinErrors' class='form-error'></p>
                </div>
                <div class='flex-item col-3'>
                  <p class='center'>
                    <u>Self-Destruct</u><br/>
                    <input type='password' id='goSDPin' name='goSDPin' required maxlength='16' placeholder='Self-Destruct PIN' /><br/>
                    <input type='password' id='goSDPinConfirm' name='goSDPinConfirm' required maxlength='16' placeholder='Confirm' /><br/>
                    [optional]
                  </p>
                  <p id='goSdPinErrors' class='form-error'></p>
                </div>
              </div>
            `;
          }
        },
        exitFn: (cb) => {
          const pins = this.validateGoPins();
          pins && this.onlyKey.sendPin_GO(pins, cb);
        }
      },
      Step8: { // backup passphrase
        prev: 'Step2',
        next: 'Step10',
        enterFn: () => {
          if (this.checkInitialized() || !this.advancedSetup) {
            document.getElementById('step8-2-text').innerHTML = "";
          }
          this.btnSubmitStep.disabled = false;
          this.steps.Step8.prev = this.advancedSetup ? 'Step4' : 'Step1';
          this.steps.Step8.next = this.guided ? 'Step10' : 'Step1';
        },
        exitFn: (cb) => {
          if (this.direction === NEXT) {
            if (!this.checkInitialized() && this.advancedSetup) {
              const backupKeyMode = this.initForm.backupKeyMode;
              this.onlyKey.setbackupKeyMode(backupKeyMode.value, this.submitBackupKey.bind(this, cb));
            } else {
              // not going to next step due to [Previous] click
              this.submitBackupKey(cb);
            }
          } else {
            cb();
          }
        }
      },
      Step10: { //Restore from backup
        prev: 'Step8',
        next: 'Step1',
        enterFn: () => {
          this.btnSubmitStep.disabled = false;
        },
        exitFn: this.submitRestoreFile.bind(this),
      },
      Step11: { //Load Firmware
        prev: 'Step1',
        next: 'Step1',
        enterFn: () => {
          this.btnSubmitStep.disabled = false;
        },
        exitFn: this.submitFirmwareFile.bind(this),
      },
    };
  };

  Wizard.prototype.initClassicSteps = function () {
    this.steps = {
      Step1: {
        enterFn: this.setGuided.bind(this, true),
        next: 'Step2',
        noExit: true,
      },
      Step2: {
        prev: 'Step1',
        next: 'Step3',
        disclaimerTrigger: 'passcode1Disclaimer',
        enterFn: (cb) => {
          if (this.checkInitialized()) {
            document.getElementById('step2-text').innerHTML = "<h3>Change Primary Profile PIN</h3><br>Make sure to choose a new PIN that you will not forget and that only you know. It may be easier to remember a pattern rather than numbers. It is also good to keep a secure backup of your PIN somewhere just in case you forget.</p><p>DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and, if I forget my PIN, the only way to recover my OnlyKey is to perform a factory reset which wipes all sensitive information.</p><label><input type='checkbox' name='passcode1Disclaimer' />I understand and accept the above risk.</label><p>Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [<span class='nextTxt'>Next</span>] below.</p>";
          }
          this.steps.Step3.next = this.guided ? 'Step4' : 'Step1';
          this.onlyKey.flushMessage(this.onlyKey.sendSetPin.bind(this.onlyKey, cb));
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
        prev: 'Step2',
        next: 'Step5',
        disclaimerTrigger: 'passcode3Disclaimer',
        enterFn: () => {
          this.setSecondPINHtml('step4-text');
          this.steps.Step5.next = this.guided ? 'Step6' : 'Step1';
          this.onlyKey.flushMessage(this.onlyKey.sendSetPin2.bind(this.onlyKey));
        },
        exitFn: (cb) => {
          if (!this.checkInitialized() && this.advancedSetup) {
            const setSecProfileMode = this.initForm.secProfileMode;
            this.onlyKey.setSecProfileMode(setSecProfileMode.value, this.onlyKey.sendSetPin2.bind(this.onlyKey, cb));
          } else {
            this.onlyKey.sendSetPin2(cb);
          }
        },
      },
      Step5: {
        prev: 'Step4',
        next: 'Step6',
        enterFn: this.onlyKey.sendSetPin2.bind(this.onlyKey),
        exitFn: this.onlyKey.sendSetPin2.bind(this.onlyKey),
      },
      Step6: {
        prev: 'Step4',
        next: 'Step7',
        disclaimerTrigger: 'passcode2Disclaimer',
        enterFn: () => {
          if (this.checkInitialized()) {
            document.getElementById('step6-text').innerHTML = "<h3>Change Self-Destruct PIN</h3><p>OnlyKey permits adding a self-destruct PIN that when entered will restore the OnlyKey to factory default settings. This is a helpful way to quickly wipe the OnlyKey. Alternatively, entering 10 incorrect PIN codes will wipe the OnlyKey.</p><br /><p>WARNING &mdash; Make sure to choose a PIN that is not similar to your profile PINs as this could result in unintentionally wiping your OnlyKey.</p><p>DISCLAIMER &mdash; I understand that entering this PIN will cause OnlyKey to perform a factory default which wipes all sensitive information.</p><label><input type='checkbox' name='passcode2Disclaimer' />I understand and accept the above risk.</label><p>Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [<span class='nextTxt'>Next</span>] below.</p>";
          }
          this.steps.Step7.next = this.guided ? 'Step8' : 'Step1';
          this.onlyKey.flushMessage(this.onlyKey.sendSetSDPin.bind(this.onlyKey));
        },
        exitFn: this.onlyKey.sendSetSDPin.bind(this.onlyKey),
      },
      Step7: {
        prev: 'Step6',
        next: 'Step8',
        enterFn: this.onlyKey.sendSetSDPin.bind(this.onlyKey),
        exitFn: this.onlyKey.sendSetSDPin.bind(this.onlyKey),
      },
      Step8: {
        prev: 'Step6',
        next: 'Step10',
        enterFn: () => {
          if (this.checkInitialized() || !this.advancedSetup) {
            document.getElementById('step8-2-text').innerHTML = "";
          }
          this.btnSubmitStep.disabled = false;
          this.steps.Step8.next = this.guided ? 'Step10' : 'Step1';
          this.onlyKey.flushMessage();
        },
        exitFn: (cb) => {
          if (this.direction === NEXT) {
            if (!this.checkInitialized() && this.advancedSetup) {
              const backupKeyMode = this.initForm.backupKeyMode;
              this.onlyKey.setbackupKeyMode(backupKeyMode.value, this.submitBackupKey.bind(this, cb));
            } else {
              // not going to next step due to [Previous] click
              this.submitBackupKey(cb);
            }
          } else {
            cb();
          }
        }
      },
      Step9: { //Set PGP Key
        prev: 'Step7',
        next: 'Step10',
        enterFn: () => {
          this.btnSubmitStep.disabled = false;
          this.steps.Step9.next = this.guided ? 'Step10' : 'Step1';
          this.onlyKey.flushMessage();
        },
        exitFn: (cb) => {
          const backupKeyMode = this.initForm.backupKeyMode;
          this.onlyKey.setbackupKeyMode(backupKeyMode.value, this.submitBackupRSAKey.bind(this, cb));
        }
      },
      Step10: { //Restore from backup
        prev: 'Step9',
        next: 'Step11',
        enterFn: () => {
          this.btnSubmitStep.disabled = false;
        },
        exitFn: this.submitRestoreFile.bind(this),
      },
      Step11: { //Load Firmware
        prev: 'Step10',
        next: 'Step1',
        enterFn: () => {
          this.btnSubmitStep.disabled = false;
        },
        exitFn: this.submitFirmwareFile.bind(this),
      },
    };
  };

  Wizard.prototype.enableDisclaimer = function (fieldName) {
    if (!fieldName) return;

    const field = this.initForm[fieldName];

    field.removeEventListener('change', this.enableDisclaimer);

    this.btnNext.disabled = !field.checked;
    this.btnSubmitStep.disabled = !field.checked;

    field.addEventListener('change', e => {
      this.enableDisclaimer(fieldName);
    });
  };

  Wizard.prototype.setUnguidedStep = function (newStep) {
    this.setGuided(false);
    this.setNewCurrentStep(newStep);
  };

  Wizard.prototype.gotoStep = function (newStep) {
    this.setGuided(true);
    this.setNewCurrentStep(newStep);
  };

  Wizard.prototype.setAdvancedSetup = function (settingArg) {
    let setting = settingArg;
    if (typeof setting === undefined) {
      setting = document.getElementById('advancedSetup').checked;
    }
    this.advancedSetup = Boolean(setting);
  };

  Wizard.prototype.uiInit = function () {
    const deviceType = this.onlyKey.getDeviceType();
    const main = document.getElementById('main');
    const deviceTypes = Object.values(DEVICE_TYPES);
    // const deviceTypes = ['classic', 'go'];
    deviceTypes.forEach(type => {
      main.classList.remove(`ok-${type}`);
    });
    deviceType && main.classList.add(`ok-${deviceType}`);
    
    this.initForm = document['init-panel'];
    document.getElementById('step8-2-text').innerHTML = `
      <label>
        <input type='radio' checked name='backupKeyMode' value=0 />
        <u>Permit future backup key changes(Default)</u>
      </label>
      <br />
      <label>
        <input type='radio' name='backupKeyMode' value=1 />
        <u>Lock backup key on this device</u>
      </label>
      <br />
      <td>
        <button id='SetPGPKey' type='button'>
          <b>Use PGP Key instead of passphrase</b>
        </button>
      </td>
      <br />
    `;
    this.setPrimaryPINHtml('step2-text');
    this.setSecondPINHtml('step4-text');
    document.getElementById('step6-text').innerHTML = `
      <h3>Enter Self-Destruct PIN on OnlyKey Keypad</h3>
      <p>
        Your OnlyKey is now set up to store 24 accounts and is ready to use!
        OnlyKey permits adding a self-destruct PIN that when entered will restore
        the OnlyKey to factory default settings. This is a helpful way to quickly
        wipe the OnlyKey. Alternatively, entering 10 incorrect PIN codes will wipe
        the OnlyKey.
      </p>
      <td>
        <button id='SkipSDPIN' type='button'>
          <b>I don't want a self-destruct PIN, skip this step</b>
        </button>
      </td>
      <br /><br />
      <p>
        WARNING &mdash; Make sure to choose a PIN that is not similar to your
        profile PINs as this could result in unintentionally wiping your OnlyKey.
      </p>
      <p>
        DISCLAIMER &mdash; I understand that entering this PIN will cause OnlyKey
        to perform a factory default which wipes all sensitive information.
      </p>
      <label>
        <input type='checkbox' name='passcode2Disclaimer' />
        I understand and accept the above risk.
      </label>
      <p>
        Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are
        finished, click [<span class='nextTxt'>Next</span>] below.
      </p>
    `;

    this.rsaForm_additional_options = document.getElementById('rsaForm-additional-options');
    this.rsaForm_additional_options.innerHTML = "";
    this.rsaSlot_selection = document.getElementById('rsaSlot');

    this.rsaSlot_selection.onchange = (e) => {
      e && e.preventDefault && e.preventDefault();
      if (e && e.target && e.target.value == '99') {
        this.rsaForm_additional_options.innerHTML = "";
      } else {
        this.rsaForm_additional_options.innerHTML = `
          <label>
            <input type='checkbox' id='rsaSetAsSignature' name='rsaSetAsSignature' value='true' />
            Signature key (use to sign messages)
          </label>
          <br />
          <label>
            <input type='checkbox' id='rsaSetAsDecryption' name='rsaSetAsDecryption' value='true' />
            Decryption key (use to decrypt messages)
          </label>
          <br />
        `;
      }
    };

    this.initConfigErrors = document.getElementById('initConfigErrors');

    this.setPIN = document.getElementById('SetPIN');
    this.setBackup = document.getElementById('SetBackup');
    this.setSDPIN = document.getElementById('SetSDPIN');
    this.skipSDPIN = document.getElementById('SkipSDPIN');
    this.setPIN2 = document.getElementById('SetPIN2');
    this.setPassphrase = document.getElementById('SetPassphrase');
    this.setPGPKey = document.getElementById('SetPGPKey');
    this.restoreBackup = document.getElementById('RestoreBackup');
    this.loadFirmware = document.getElementById('LoadFirmware');

    this.btnNext = document.getElementById('btnNext');
    this.btnPrev = document.getElementById('btnPrevious');
    this.btnExit = document.getElementById('btnExit');

    this.btnSubmitStep = document.getElementById('btnSubmitStep');
    this.btnCancelStep = document.getElementById('btnCancelStep');

    this.setBackup.onclick = this.setUnguidedStep.bind(this, 'Step8');
    this.setSDPIN.onclick = this.setUnguidedStep.bind(this, 'Step6');
    this.setPIN.onclick = this.setUnguidedStep.bind(this, 'Step2');
    this.setPIN2.onclick = this.setUnguidedStep.bind(this, 'Step4');

    this.skipSDPIN.onclick = (e) => {
      e && e.preventDefault && e.preventDefault();
      this.onlyKey.flushMessage.call(this.onlyKey, this.gotoStep.bind(this, 'Step8'));
    };

    this.setPassphrase.onclick = (e) => {
      e && e.preventDefault && e.preventDefault();
      this.gotoStep('Step8');
    };

    this.setPGPKey.onclick = (e) => {
      e && e.preventDefault && e.preventDefault();
      this.gotoStep('Step9');
    };

    this.loadFirmware.onclick = this.setUnguidedStep.bind(this, 'Step11');

    this.btnNext.onclick = (e) => {
      e && e.preventDefault && e.preventDefault();
      this.setGuided(true);
      this.moveStep('next');
    };

    this.btnPrev.onclick = (e) => {
      e && e.preventDefault && e.preventDefault();
      this.setGuided(true);
      this.onlyKey.flushMessage.call(this.onlyKey, this.moveStep.bind(this, 'prev'));
    };

    this.btnExit.onclick = (e) => {
      e && e.preventDefault && e.preventDefault();
      this.reset();
    };

    this.btnSubmitStep.onclick = (e) => {
      // e && e.preventDefault && e.preventDefault();
      this.moveStep('next');
    };

    this.btnCancelStep.onclick = (e) => {
      e && e.preventDefault && e.preventDefault();
      this.reset();
    };

    this.slotConfigForm = document['slot-config-form'];
    this.slotConfigDialog = document.getElementById('slot-config-dialog');

    this.finalStepDialog = document.getElementById('finalStep-dialog');

    this.slotWipe = document.getElementById('slotWipe');
    this.slotWipe.onclick = e => {
      e && e.preventDefault && e.preventDefault();
      document.getElementById('wipeCurrentSlotId').innerText = this.onlyKey.currentSlotId;
      this.dialog.open(this.slotWipeConfirmDialog, true);
    };

    this.slotWipeConfirmDialog = document.getElementById('slot-wipe-confirm');
    this.slotWipeConfirmBtn = document.getElementById('slotWipeConfirm');
    this.slotWipeConfirmBtn.onclick = e => {
      e && e.preventDefault && e.preventDefault();
      this.onlyKey.wipeSlot(null, null, (err, msg) => {
        // this.onlyKey.listen(function (err, msg) {
        if (!err) {
          this.slotConfigForm.reset();
          this.onlyKey.getLabels();
          this.dialog.closeAll();
        }
        // });
      });
    };

    this.slotWipeCancelBtn = document.getElementById('slotWipeCancel');
    this.slotWipeCancelBtn.onclick = e => {
      e && e.preventDefault && e.preventDefault();
      this.dialog.close(this.slotWipeConfirmDialog);
    };

    this.slotSubmit = document.getElementById('slotSubmit');
    this.slotSubmit.onclick = e => {
      e && e.preventDefault && e.preventDefault();
      this.setSlot();
    };

    this.unlockOkGoPinInput = document.getElementById('unlockOkGoPin');
    this.unlockOkGoSubmitBtn = document.getElementById('unlockOkGoSubmit');
    this.unlockOkGoSubmitBtn.onclick = e => {
      e && e.preventDefault && e.preventDefault();
      this.onlyKey.sendPin_GO([ this.unlockOkGoPinInput.value ], (err, msg) => {
        // this.onlyKey.listen(function (err, msg) {
          if (err) {
            console.dir({
              UNLOCK_ERR: err
            });
            throw Error('shit');
          }
        // });
      });
    };

    // BEGIN PRIVATE KEY SELECTOR
    this.selectPrivateKeyDialog = document.getElementById('select-private-key-dialog');
    this.selectPrivateKeyConfirmBtn = document.getElementById('selectPrivateKeyConfirm');
    this.selectPrivateKeyConfirmBtn.onclick = e => {
      e && e.preventDefault && e.preventDefault();
      const selectedKey = document.querySelector('input[name="rsaKeySelect"]:checked').value;
      this.onlyKey.confirmRsaKeySelect(this.onlyKey.tempRsaKeys[selectedKey], null, err => {
          if (err) {
            //   return ???
          }

          this.onlyKey.tempRsaKeys = null;
          this.dialog.closeAll();

          if (this.guided) {
            this.setNewCurrentStep(this.steps[this.currentStep]['next'])
          } else {
            this.reset();
          }
      });
    };

    this.selectPrivateKeyCancelBtn = document.getElementById('selectPrivateKeyCancel');
    this.selectPrivateKeyCancelBtn.onclick = e => {
      e && e.preventDefault && e.preventDefault();
      this.onlyKey.tempRsaKeys = null;
      this.dialog.closeAll();
    };
    // END PRIVATE KEY SELECTOR

    // toggle advanced setup mode and update wizard steps accordingly
    document.getElementById("advancedSetup").removeEventListener('change', toggleAdvancedUI, false);
    document.getElementById("advancedSetup").addEventListener('change', toggleAdvancedUI.bind(this), false);

    // SPECIAL EVENT LISTENERS
    document.removeEventListener('click', setupSpecialEventListeners);
    document.addEventListener('click', setupSpecialEventListeners.bind(this));

    this.setActiveStepUI();
  };

  Wizard.prototype.checkInitialized = function () {
    const isInitialized = this.onlyKey && this.onlyKey.isInitialized;

    if (isInitialized) {
      document.querySelectorAll('.init-only').forEach(el => el.classList.remove('hide'));
      document.querySelectorAll('.uninit-only').forEach(el => el.classList.add('hide'));
    } else {
      document.querySelectorAll('.init-only').forEach(el => el.classList.add('hide'));
      document.querySelectorAll('.uninit-only').forEach(el => el.classList.remove('hide'));
    }

    return isInitialized;
  };

  Wizard.prototype.setGuided = function (guided) {
    this.guided = !!guided && !this.checkInitialized(); // guided setup is only for uninitialized devices
  };


  Wizard.prototype.initKeySelect = async function (rawKey, cb) {
    //console.info(rawKey.primaryKey);
    const keys = [{
      name: 'Primary Key',
      p: rawKey.primaryKey.params[3].data,
      q: rawKey.primaryKey.params[4].data
    }];

    rawKey.subKeys.forEach((subKey, i) => {
        //console.info(subKey.keyPacket);
      keys.push({
        name: 'Subkey ' + (i + 1),
        p: subKey.keyPacket.params[3].data,
        q: subKey.keyPacket.params[4].data
      });
    });

    this.onlyKey.tempRsaKeys = keys;

    //if (!autokeyload) {
    if (this.rsaSlot_selection.value === '99') {
      // Set Keybase keys, we already know what goes where
      // If there are two subkeys
      // subkey 1 is set as decryption key
      // subkey 2 is set as signature key
      // else
      // subkey 1 is set as decryption key
      // primary key (there should only be 1) set as signing key
      const decryptionKey = keys[1];
      const signingKey = keys.length > 2 ? keys[2] : keys[0];

      this.onlyKey.confirmRsaKeySelect(decryptionKey, 1, err => {
        this.onlyKey.confirmRsaKeySelect(signingKey, 2, err => {
          if (err) {
              //   return ???
          }

          this.onlyKey.tempRsaKeys = null;
          this.reset();
        });
      });
    } else {
      const pkDiv = document.getElementById('private-key-options');
      pkDiv.innerHTML = "";

      keys.forEach((key, i) => {
        pkDiv.appendChild(makeRadioButton('rsaKeySelect', i, key.name));
        pkDiv.appendChild(document.createElement("br"));
      });

      pkDiv.appendChild(document.createElement("br"));

      this.dialog.open(this.selectPrivateKeyDialog, true);
    }
  };


  Wizard.prototype.submitFirmwareFile = function (cb) {
    var firmwareSelect = document.getElementById('firmwareSelectFile');
    this.onlyKey.submitFirmware(firmwareSelect, cb);
  };

  Wizard.prototype.submitRestoreFile = function (cb) {
    var fileSelector = document.getElementById('restoreSelectFile');
    if (!fileSelector.files.length) {
      fileSelector = new File(["-----BEGIN ONLYKEY BACKUP-----\n-----END ONLYKEY BACKUP-----"], "emptybackup.txt");
    }
    this.onlyKey.submitRestore(fileSelector, cb);
  };

  Wizard.prototype.submitBackupKey = function (cb) {
    const key1Input = document.getElementById('backupPassphrase');
    const key2Input = document.getElementById('backupPassphrasec');
    const formErrors = [];

    this.initConfigErrors.innerHTML = "";

    if (!key1Input.value) {
      formErrors.push('Passphrase cannot be empty.');
    }

    if (key1Input.value !== key2Input.value) {
      formErrors.push('Passphrase fields do not match.');
    }

    if (key1Input.value.length < 25) {
      formErrors.push('Passphrase must be at least 25 characters.');
    }

    if (formErrors.length) {
      // early exit
      let html = "<ul>";
      for (let i = 0; i < formErrors.length; i++) {
        html += "<li>" + formErrors[i] + "</li>";
      }
      this.initConfigErrors.innerHTML = html + "</ul>";
      return;
    }

    //formErrors.push(key1.value);
    this.onlyKey.setBackupPassphrase(key1Input.value, cb);
  };

  Wizard.prototype.submitBackupRSAKey = function (cb) {
    const backuprsaKey = document.getElementById('backupRSAKey');
    const backuprsaPasscode = document.getElementById('backupRSAPasscode');
    const backupRSASetAsSignature = document.getElementById('backupRSASetAsSignature')
    if (backupRSASetAsSignature.checked) {
      backupsigFlag = 1;
    } else {
      backupsigFlag = 0;
    }

    this.initConfigErrors.innerHTML = "";

    var key = backuprsaKey.value || '';
    var passcode = backuprsaPasscode.value || '';

    if (!key) {
        this.initConfigErrors.innerHTML = 'RSA Key cannot be empty.';
        return false;
    }

    if (!passcode) {
        this.initConfigErrors.innerHTML = 'Passcode cannot be empty.';
        return false;
    }
    backuprsaKey.value = '';
    backuprsaPasscode.value = '';

    this.onlyKey.setRSABackupKey(key, passcode, cb);
  };

  Wizard.prototype.setSlot = function () {
    this.slotSubmit.disabled = true;
    this.slotWipe.disabled = true;

    const form = this.slotConfigForm;
    const formErrors = [];
    const formErrorsContainer = document.getElementById('slotConfigErrors');
    const fieldMap = {
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
      let html = "<ul>";
      for (let i = 0; i < formErrors.length; i++) {
        html += "<li><blink>" + formErrors[i]; + "</blink></li>";
      }
      formErrorsContainer.innerHTML = html + "</ul>";

      this.slotSubmit.disabled = false;
      this.slotWipe.disabled = false;
      return;
    }

    // process all form fields
    for (let field in fieldMap) {
      let isChecked = false;
      let formValue = null;

      switch (form[field].type) {
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
          const checkVar = ('' + (form[field].value)).trim();
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

        switch (field) {
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
  }

  Wizard.prototype.getMode = function () {
    return this.initForm['ConfigMode'].value;
  };

  Wizard.prototype.moveStep = function (direction) {
    // if a next/prev step exists, call current step-related exit function
    // and set new current step
    this.currentStep = this.currentStep || STEP1;
    this.direction = direction;

    if (this.steps[this.currentStep][direction]) {
      if (this.steps[this.currentStep].exitFn) {
        console.info(`Calling ${this.currentStep} exitFn.`);
        this.steps[this.currentStep].exitFn((err, res) => {
          if (err) {
            console.error(err);
            return this.goBackOnError(err, res);
          } else if (res !== 'STOP') {
            console.info(`exitFn callback res === ${res}`);
            return this.setNewCurrentStep(this.steps[this.currentStep][direction]);
          }

          console.warn(`exitFn callback called with no return.`)
        });
      } else {
        this.setNewCurrentStep(this.steps[this.currentStep][direction]);
      }
    }
  };

  Wizard.prototype.goBackOnError = function (err, lastMessageSent) {
    console.warn(`goBackOnError handling ${lastMessageSent} error: ${err}`);
    if (err) {
      switch (lastMessageSent) {
        case 'OKSETPIN':
          this.setNewCurrentStep('Step2');
          break;
        case 'OKSETPIN2':
          this.setNewCurrentStep('Step4');
          break;
        case 'OKSETSDPIN':
          this.setNewCurrentStep('Step6');
          break;
      }
    }
  };

  Wizard.prototype.setNewCurrentStep = function (stepId) {
    this.currentStep = stepId;

    if (this.currentStep) {

      // call new current step-related enter function
      if (this.steps[stepId].enterFn) {
        console.info(`Calling ${stepId} enterFn.`);
        this.steps[stepId].enterFn((err, res) => {
          if (err) {
            console.error(err);
            this.goBackOnError(err, res);
          } else {
            console.info(res);
          }
        });
      }
    }

    this.setActiveStepUI();
  };

  Wizard.prototype.setActiveStepUI = function () {
    // set display style for all steps
    const currentStepOrFirst = this.currentStep || STEP1;

    for (var stepId in this.steps) {
      var el = document.getElementById(stepId);
      if (el) {
        if (stepId === currentStepOrFirst) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    }

    const disclaimerTrigger = this.steps[currentStepOrFirst].disclaimerTrigger;

    if (this.guided) {
      document.getElementById('guided').classList.remove('hide');
      document.getElementById('unguided').classList.add('hide');

      if (this.steps[currentStepOrFirst].next) {
        if (!disclaimerTrigger) {
          this.btnNext.removeAttribute('disabled');
        } else {
          this.enableDisclaimer(disclaimerTrigger);
        }
      } else {
        this.btnNext.setAttribute('disabled', 'disabled');
      }

      if (this.steps[currentStepOrFirst].prev) {
        this.btnPrev.removeAttribute('disabled');
      } else {
        this.btnPrev.setAttribute('disabled', 'disabled');
      }

      if (this.steps[currentStepOrFirst].noExit) {
        this.btnExit.classList.add('hide');
      } else {
        this.btnExit.classList.remove('hide');
      }
    } else {
      document.getElementById('guided').classList.add('hide');

      if (this.currentStep && this.currentStep !== STEP1) {
        this.enableDisclaimer(disclaimerTrigger);
        document.getElementById('unguided').classList.remove('hide');
      } else {
        document.getElementById('unguided').classList.add('hide');
      }
    }

    this.initConfigErrors.innerHTML = '';

    return false;
  };

  Wizard.prototype.setPrimaryPINHtml = function (id) {
    document.getElementById('step2-text').innerHTML = `
      <h3>Enter PIN on OnlyKey Keypad</h3>
      <p>
        The first step in setting up OnlyKey is to set a PIN code using the
        six-button keypad on the OnlyKey. This PIN will be used to unlock
        your OnlyKey to access your accounts.
        <br /><br />
        Make sure to choose a PIN that you will not forget and that only you know.
        It may be easier to remember a pattern rather than numbers. It is also
        good to keep a secure backup of your PIN somewhere just in case you forget.
      </p>
      <p>
        DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and,
        if I forget my PIN, the only way to recover my OnlyKey is to perform a
        factory reset which wipes all sensitive information.
      </p>
      <label>
        <input type='checkbox' name='passcode1Disclaimer' >
        I understand and accept the above risk.
      </label>
      <p>
        Enter a 7 - 10 digit PIN on your OnlyKey six button keypad. When you are
        finished, click [<span class='nextTxt'>Next</span>] below.
      </p>
    `;
  };

  Wizard.prototype.setSecondPINHtml = function (id) {
    let html;

    if (this.checkInitialized()) {
      html = `
        <h3>Change Second Profile PIN</h3>
        <p>
          Make sure to choose a new PIN that you will not forget and that only you know.
          It may be easier to remember a pattern rather than numbers.
          It is also good to keep a secure backup of your PIN somewhere just in case you forget.
        </p>
        <p>
          DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and,
          if I forget my PIN, the only way to recover my OnlyKey is to perform a factory reset
          which wipes all sensitive information.
        </p>
        <label>
          <input type='checkbox' name='passcode3Disclaimer' />
          I understand and accept the above risk.
        </label>
        <p>
          Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished,
          click [<span class='nextTxt'>Next</span>] below.
        </p>
      `;
    } else if (!this.checkInitialized() && this.advancedSetup) {
      html = `
        <h3>Enter PIN for Second Profile on OnlyKey Keypad</h3>
        <p>
          Your OnlyKey is now set up to store 12 accounts and is ready to use! OnlyKey permits adding
          a second profile to store an additonal 12 accounts (24 total). Set a second PIN to access the
          second profile. Second profile must be configured during initial setup and cannot be set up later.
          <br /><br />
          <td>
            <button id='SkipPIN2' type='button'>
              <b>I don't want a second profile, skip this step</b>
            </button>
          </td>
          <br>
        </p>
        Select a second profile type:
        <br><br>
        <label>
          <input type='radio' checked name='secProfileMode' value=1 />
          <u>Standard Profile (recommended for most users)</u>
        </label>
        <br />
        <label>
          <input type='radio' name='secProfileMode' value=2 />
          <u>Plausible Deniability Profile</u>
        </label>
        <br />
        Learn more about standard and plausible deniability profile
        <a href='https://docs.crp.to/features.html#self-destruct' class='external' target='_new'>here</a>.
        <p>
          DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and, if I forget my PIN,
          the only way to recover my OnlyKey is to perform a factory reset which wipes all sensitive information.
        </p>
        <label>
          <input type='checkbox' name='passcode3Disclaimer' />
          I understand and accept the above risk.
        </label>
        <p>
          Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished,
          click [<span class='nextTxt'>Next</span>] below.
        </p>
      `;
    } else {
      html = `
        <h3>Enter PIN for Second Profile on OnlyKey Keypad</h3>
        <p>
          Your OnlyKey is now set up to store 12 accounts and is ready to use! OnlyKey
          permits adding a second profile to store an additonal 12 accounts (24 total).
          Set a second PIN to access the second profile. Second profile must be
          configured during initial setup and cannot be set up later. <br /><br />
          <td>
            <button id="SkipPIN2" type="button">
              <b>I don't want a second profile, skip this step</b>
            </button>
          </td>
          <br />
        </p>
        <p>
          DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and,
          if I forget my PIN, the only way to recover my OnlyKey is to perform a factory
          reset which wipes all sensitive information.
        </p>
        <label><input type="checkbox" name="passcode3Disclaimer" />I understand and accept
          the above risk.</label>
        <p>
          Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are
          finished, click [<span class="nextTxt">Next</span>] below.
        </p>
    `;
    }
    this.setElementHtml(id, html);
  };

  Wizard.prototype.setElementHtml = function (id, html) {
    document.getElementById(id).innerHTML = html;
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

  Wizard.prototype.validateGoPins = function () {
    const pin1 = document.getElementById('goPrimaryPin').value;
    const pin1Confirm = document.getElementById('goPrimaryPinConfirm').value;
    const pin1Errors = [];
    const pin2 = document.getElementById('goSecondaryPin').value;
    const pin2Confirm = document.getElementById('goSecondaryPinConfirm').value;
    const pin2Errors = [];
    const pin3 = document.getElementById('goSDPin').value;
    const pin3Confirm = document.getElementById('goSDPinConfirm').value;
    const pin3Errors = [];

    const minPinLength = 7;

    const mismatchErrorStr = 'Fields do not match.';
    const numeralErrorStr = 'PIN must be all numerals.';
    const lengthErrorStr = `PIN must be at least ${minPinLength} numbers.`;

    !pin1 && pin1Errors.push('Primary PIN cannot be empty.');
    pin1 !== pin1Confirm && pin1Errors.push(mismatchErrorStr);
    pin1.match(/\D/g) && pin1Errors.push(numeralErrorStr);
    pin1.length < minPinLength && pin1Errors.push(lengthErrorStr);

    pin2 && pin2 !== pin2Confirm && pin2Errors.push(mismatchErrorStr);
    pin2.match(/\D/g) && pin2Errors.push(numeralErrorStr);
    pin2 && pin2.length < minPinLength && pin2Errors.push(lengthErrorStr);
    pin2 && pin2 == pin1 && pin2Errors.push('Secondary PIN cannot match Primary.');

    pin3 && pin3 !== pin3Confirm && pin3Errors.push(mismatchErrorStr);
    pin3.match(/\D/g) && pin3Errors.push(numeralErrorStr);
    pin3 && pin3.length < minPinLength && pin3Errors.push(lengthErrorStr);
    pin3 && (pin3 == pin1 || pin3 == pin2) && pin3Errors.push('SD PIN cannot match others.');

    let errorsFound = false;
    [
      { errors: pin1Errors, containerId: 'goPrimaryPinErrors' },
      { errors: pin2Errors, containerId: 'goSecondaryPinErrors' },
      { errors: pin3Errors, containerId: 'goSdPinErrors' }
    ].forEach(pinForm => {
      document.getElementById(pinForm.containerId).innerHTML = '';
      if (pinForm.errors.length) {
        errorsFound = true;
        for (let i = 0; i < pinForm.errors.length; i++) {
          document.getElementById(pinForm.containerId).innerHTML += (i > 0 ? '<br/>' : '') + pinForm.errors[i];
        }
      }
    });

    return !errorsFound && [pin1, pin2, pin3];
  };

  Wizard.prototype.reset = function () {
    this.setGuided(true);
    this.onlyKey.flushMessage.call(this.onlyKey, this.setNewCurrentStep.bind(this, null));
  };

  document.addEventListener('DOMContentLoaded', () => {
    console.info("Creating wizard instance...");
    onlyKeyConfigWizard = new Wizard();
    OnlyKeyHID(onlyKeyConfigWizard);
  }, false);
})();

function clearRadios(name) {
  var btns = document.getElementsByName(name);
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].checked) btns[i].checked = false;
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

function toggleAdvancedUI(e) {
  e && e.preventDefault && e.preventDefault();
  this.advancedSetup = e.target.checked;
  this.initSteps();
}

function setupSpecialEventListeners(evt) {
  if (evt.onclick) return;

  const targets = [{
    // This handler lets users safely cancel a PIN confirmation step
    id: '#SkipPIN2',
    fn: (e) => {
      e.preventDefault && e.preventDefault();
      this.onlyKey.flushMessage.call(this.onlyKey, this.gotoStep.bind(this, 'Step6'));
    }
  }];

  const target = targets.filter(t => evt.target.matches(t.id) || (evt.target.parentElement && evt.target.parentElement.matches(t.id)));
  return target.length && target[0].fn.call(this, evt);
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

  for (var i = 0; i + 4 <= bits.length; i += 4) {
    var chunk = bits.substr(i, 4);
    hex = hex + parseInt(chunk, 2).toString(16);
  }

  return hex;
}
