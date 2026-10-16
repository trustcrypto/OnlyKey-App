/** Tooltip text and documentation links for the OnlyKey desktop app. */
export const TOOLTIPS = {
  setup: {
    href: 'https://docs.crp.to/usersguide.html#onlykey-setup',
    duoHref: 'https://docs.crp.to/duousersguide.html#onlykey-setup',
    text: 'Setup of OnlyKey includes things like setting PINs and backup passphrase. These can be changed later in the OnlyKey app.',
  },
  slots: {
    href: 'https://docs.crp.to/usersguide.html#slots',
    text: "On the OnlyKey you have multiple buttons and each button has two slots assigned that can be activated by holding the button for less than or more than one second. Each slot can be set with a Label, URL, Username, Password, and multi-factor authentication. Slots with no label are shown as '<empty>' in the app. For security, only labels are read from the device — not other login fields — so '<empty>' does not indicate whether a slot is in use.",
  },
  typeSpeed: {
    href: 'https://docs.crp.to/usersguide.html#configurable-keyboard-type-speed',
    text: 'Change the rate of speed at which OnlyKey types out characters.\n\n1 - about one character per second\n4 - default\n10 - almost instantaneous type speed',
  },
  keyboardLayout: {
    href: 'https://docs.crp.to/usersguide.html#configurable-keyboard-layouts',
    text: 'Select any of the supported keyboard layouts.',
  },
  ledBrightness: {
    href: 'https://docs.crp.to/usersguide.html#configurable-led-brightness',
    text: 'Change the OnlyKey LED brightness.\n\n1 - dimmest\n8 - default\n10 - brightest',
  },
  sysadminMode: {
    href: 'https://docs.crp.to/usersguide.html#sysadmin-mode',
    text: 'By default, OnlyKey may only type regular keyboard characters, TAB, and RETURN. This is useful for entering login information like usernames and passwords. For more advanced use cases such as for system administrators, keystroke combinations such as CTRL-ALT-DEL and username/password or system commands may be used.',
  },
  hmacMode: {
    href: 'https://docs.crp.to/usersguide.html#hmac-mode',
    text: "By default, you must press a button on OnlyKey to perform HMAC challenge-response operations. Selecting 'NO' for this option allows those operations without pressing a button.",
  },
  fullWipe: {
    href: 'https://docs.crp.to/usersguide.html#configurable-wipe-mode',
    text: "By default, only sensitive data is wiped from OnlyKey when 10 incorrect PINs are entered. You can wipe the firmware as well by changing this option to 'Full Wipe.'",
  },
  lockout: {
    href: 'https://docs.crp.to/usersguide.html#configurable-inactivity-lockout-period',
    text: "By default, OnlyKey locks itself after 30 minutes. Change this setting to any duration (in minutes) up to 255. If you don't want OnlyKey to lock, enter 0.",
  },
  lockButton: {
    href: 'https://docs.crp.to/usersguide.html#configurable-lock-button',
    text: 'Choose a button (1-6) that you can quickly press to lock your OnlyKey and computer, or enter 0 to disable this feature.',
  },
  userInputModes: {
    href: 'https://docs.crp.to/usersguide.html#challenge-mode',
    text: 'How you confirm an operation on the OnlyKey itself. Each key family has its own setting; they are saved together when you press Save but stored separately on the device.',
  },
  webAgentDerive: {
    text: 'Keys derived on demand from a label, shared by the OnlyKey web app and by local tools over USB (python-onlykey and its age plugin). SSH and GPG keys from onlykey-agent use the SSH/GPG derived keys setting above.',
  },
  webAgentNoInput: {
    text: 'No confirmation at all, for unattended tools that decrypt with web and agent derived keys (for example age). Applies over USB and to the OnlyKey web app: while it is set, either can derive and decrypt silently whenever the key is unlocked. Off by default; leave it off unless an unattended tool needs it. onlykey-agent SSH and GPG keys are not affected.',
  },
  webcryptAccess: {
    href: 'https://docs.crp.to/webcrypt.html',
    text: 'What Webcrypt - the OnlyKey web app - is allowed to do with this OnlyKey. The origins that can reach the key are compiled into the firmware; this is not a list you can add to. Separate from the confirmation settings above.',
  },
  webAllowStoredKey: {
    text: 'On until you save this setting, as on older firmware. Untick and save to stop the web app using the keys stored on this OnlyKey; it can still use derived keys, which are label-scoped and reproducible.',
  },
  webDisableExtension: {
    text: 'Turns off the OnlyKey FIDO2 extension completely, including derived keys, so the web app cannot reach this key at all. If you had this turned off on older firmware, it stays off until you change it here.',
  },
  backupKeyMode: {
    href: 'https://docs.crp.to/usersguide.html#backup-key-mode',
    text: 'Backup key may be changed by default. Enabling this setting prevents any changes to the backup key and if no backup key is set will disable backups. Setting remains in effect until a factory default is completed.',
  },
  backup: {
    href: 'https://docs.crp.to/usersguide.html#secure-encrypted-backup-anywhere',
    text: 'The Secure Encrypted Backup Anywhere feature allows you to backup OnlyKey on the go. The way that this works is that the OnlyKey encrypts everything on your OnlyKey using an encryption key and then types it out. This allows saving the backup in a text file or email on any computer.',
  },
  restore: {
    href: 'https://docs.crp.to/usersguide.html#restoring-onlykey',
    text: 'Using the backup file created, OnlyKey can be restored to a previous state. This also allows restoring to a different OnlyKey or a second OnlyKey in order to have an extra.',
  },
  firmware: {
    href: 'https://docs.crp.to/upgradeguide.html#download-firmware',
    text: "OnlyKey supports auto firmware update through the OnlyKey App. This requires that 'Automatically check for firmware updates' is checked in your OnlyKey App settings. Firmware can also be manually downloaded by clicking here to open the firmware upgrade guide.",
  },
  webcrypt: {
    href: 'https://docs.crp.to/webcrypt.html',
    text: 'OnlyKey WebCrypt provides a way to securely use OpenPGP in the browser. The Webcrypt app loads everything necessary to encrypt messages and files directly in the local browser without the need to send messages or files over the Internet. Data between OnlyKey and the browser is end-to-end encrypted.',
  },
  encryptMessages: {
    text: 'Securely encrypt messages in the browser using OnlyKey.',
  },
  decryptMessages: {
    text: 'Securely decrypt OpenPGP encrypted messages in the browser using OnlyKey',
  },
  encryptFiles: {
    text: 'Securely encrypt files in the browser using OnlyKey.',
  },
  decryptFiles: {
    text: 'Securely decrypt OpenPGP encrypted files in the browser using OnlyKey.',
  },
  agent: {
    href: 'https://docs.crp.to/onlykey-agent.html',
    text: 'OnlyKey Agent is a hardware-based SSH and GPG agent that allows offline cold storage of your SSH and OpenPGP keys. Instead of keeping keys on a computer, OnlyKey generates and securely stores your keys off of the computer and you can still easily use SSH and GPG.',
  },
  gpgAgent: {
    text: 'Provides a way to securely use OnlyKey for OpenPGP on a local computer. Instead of keeping keys on a computer, OnlyKey generates and securely stores keys off of the computer and you can still easily use GPG to do things like sign emails, git commits, software packages etc.',
  },
  sshAgent: {
    text: 'Provides a way to securely use OnlyKey for SSH authentication on a local computer. Instead of keeping keys on a computer, OnlyKey generates and securely stores your keys off of the computer and you can still easily use SSH.',
  },
} as const;