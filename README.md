# OnlyKey App

This is the official app for **OnlyKey**

OnlyKey can be purchased here: [OnlyKey order](http://www.crp.to/p/)

## Geting Started

Just getting started with OnlyKey?

[Start here](http://www.crp.to/okstart)

## About

**OnlyKey App** is an app to be used along with an OnlyKey device. The app is used for things like:

- Initial setup of OnlyKey (Setup)
- Configuration of accounts (Slots)
- Loading keys for PGP, SSH, and secure backup (Keys)
- Backup and restore of OnlyKey (Backup/Restore)
- Setting OnlyKey preferences (Preferences)
- Setting advanced options such as Yubikey and U2F security info (Advanced)

*The app is required on all systems where OATH-TOTP (Google Authenticator) is used*

For information on using the app see the [OnlyKey User's Guide](https://docs.crp.to/usersguide.html)

## Installation

To use the **standalone app:**

- Obtain an installer from https://github.com/trustcrypto/OnlyKey-Chrome-App/releases/latest
- Install and launch the app.

Linux users installing the deb package should verify the GPG signature using `debsig-verify`. There is an article outlining this process [here](https://www.unboundsecurity.com/docs/UKC/UKC_Code_Signing_IG/HTML/Content/Products/UKC-EKM/UKC_Code_Signing_IG/LinuxPackage/SignDebian.html#h3_4).

To use the **OnlyKey Chrome App:** (Chromebook Users)

- Go to https://chrome.google.com/webstore/detail/onlykey-configuration/adafilbceehejjehoccladhbkgbjmica,
  click the **ADD TO CHROME** button.
- Once the app installs ensure that your Chrome Bookmarks Bar is visible by
  going to Bookmarks -> Show Bookmarks bar.
- Select "Apps" icon in the bookmarks bar and select **OnlyKey Configuration**.

## Support ##

Check out the [OnlyKey Support Forum](https://groups.google.com/forum/#!forum/onlykey)

Check out the [OnlyKey Documentation](https://docs.crp.to)

## Developer Notes

This repository contains shared code that can be used to build multiple types of
apps.

To run this code as a Chrome app:

    $ npm run chrome

To run as NWJS app:

    $ npm start

To create releases:

    $ npm run release

This will create an installer in the `releases/` subfolder. The installer is created for the current OS; this means you will need to run the `release` command on Windows, Linux, and Mac OS to generate all the installers.

On Windows, you need to install [NSIS][nsis] first, and ensure that it's present in your shell's `%PATH%`. That is, add `C:/Program Files (x86)/NSIS` or similar to your `%PATH%` in the operating system settings. On Mac OS, you need to install an optional NPM dependecy: `npm install appdmg`.

To run tests:

    $ npm test

Running tests requires the SDK version of NWJS, which comes with a `chromedriver` that handles automated Selenium tests. To install that version, run `npm install nw --nwjs_build_type=sdk`. Note that to create releases, you should install the non-sdk variant again; otherwise the installer will be unnecessarily large.

## Cryptography Notice

This distribution includes cryptographic software. The country in which you currently reside may have restrictions on the import, possession, use, and/or re-export to another country, of encryption software.
BEFORE using any encryption software, please check your country's laws, regulations and policies concerning the import, possession, or use, and re-export of encryption software, to see if this is permitted.
See <http://www.wassenaar.org/> for more information.

The U.S. Government Department of Commerce, Bureau of Industry and Security (BIS), has classified this software as Export Commodity Control Number (ECCN) 5D002.C.1, which includes information security software using or performing cryptographic functions with asymmetric algorithms.
The form and manner of this distribution makes it eligible for export under the License Exception ENC Technology Software Unrestricted (TSU) exception (see the BIS Export Administration Regulations, Section 740.13) for both object code and source code.

The following cryptographic software is included in this distribution:

   "OpenPGP.js - OpenPGP JavaScript Implementation." - https://openpgpjs.org/

For more information on export restrictions see: http://www.apache.org/licenses/exports/

## Source

[OnlyKey App on Github](https://github.com/trustcrypto/OnlyKey-Chrome-App)
