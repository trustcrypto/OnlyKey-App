# OnlyKey App

The OnlyKey App is a configuration utility for the OnlyKey. For general
information on OnlyKey check out [the OnlyKey Product Page](https://crp.to/p/)
or [the OnlyKey Kickstarter Page][kickstarter].

OnlyKeys can be ordered from [the OnlyKey Product Page](https://crp.to/p/).

## Introduction

**OnlyKey App** is an app to be used along with an OnlyKey device. The app can
be used for initial setup of your OnlyKey as well as configuration of usernames,
passwords, and two-factor authentication.

## Installation

To use the **OnlyKey Chrome App:**

- Go to https://chrome.google.com/webstore/detail/onlykey-configuration/adafilbceehejjehoccladhbkgbjmica,
  click the **ADD TO CHROME** button.
- Once the app installs ensure that your Chrome Bookmarks Bar is visible by
  going to Bookmarks -> Show Bookmarks bar.
- Select "Apps" icon in the bookmarks bar and select **OnlyKey Configuration**.

To use the **standalone app:**

- Obtain an installer from https://github.com/trustcrypto/OnlyKey-Chrome-App/releases/latest
- Install and launch the app.

## Developer Notes

This repository contains shared code that can be used to build multiple types of
apps.

To run this code as a Chrome app:

    $ npm run chrome

To run as NWJS app:

    $ npm start

To create releases:

    $ npm run release

This will create an installer in the `releases/` subfolder. The installer is
created for the current OS; this means you will need to run the `release`
command on Windows, Linux, and Mac OS to generate all the installers.

On Windows, you need to install [NSIS][nsis] first, and ensure that it's present
in your shell's `%PATH%`. That is, add `C:/Program Files (x86)/NSIS` or similar
to your `%PATH%` in the operating system settings. On Mac OS, you need to
install an optional NPM dependecy: `npm install appdmg`.


[kickstarter]: https://www.kickstarter.com/projects/1048259057/openkey-the-two-factor-authentication-and-password/description
[nsis]: http://nsis.sourceforge.net/Main_Page
