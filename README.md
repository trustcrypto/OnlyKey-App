# OnlyKey-Chrome-App

The OnlyKey Chrome App is a configuration utility for the OnlyKey. For general information on OnlyKey check out the Kickstarter page: [OnlyKey Kickstarter Page](http://www.crp.to/ok)

OnlyKey pre-orders are available here: [OnlyKey Pre-order](http://www.crp.to/po)
 
## Introduction ##
**OnlyKey Chrome App** is an app to be used along with an OnlyKey device. The Chrome app can be used for initial setup of your OnlyKey as well as configuration of usernames, passwords, and two-factor authentication.

## Installation ##
To use the **OnlyKey Chrome App** :  
- Go to https://github.com/onlykey/OnlyKey-Chrome-App, click the **Download ZIP** button and save the ZIP file to a convenient location on your PC.
- Navigate to chrome://extensions and enable Developer Mode by clicking a checkbox in the top right corner.
- Select "Load unpacked extension" and open the zip file that was downloaded to your PC.

## Start the App ##
In order to launch the app you can either go to chrome://extensions and select the "Launch" button located under the OnlyKey Configuration app. Or alternativly, you can install [Apps Launcher] (https://chrome.google.com/webstore/detail/apps-launcher/ijmgkhchjindcjamnckoiahagecjnkdc) from the Google Chrome Web store: 

## Development ##
This app is currently in development. The following features have yet to be implemented:
- U2F Certificate upload - Field to enter certificate text where the certificate is put into packets (max 64 bytes) and sent to the OnlyKey.
- Plausible Deniability/Self Destruct PIN set - The current PIN set feature should be implemented the same way for the Plausible Deniability/Self Destruct PIN set.
- Error Display - The Errors received from OnlyKey "starting with Error" Should be displayed to user.
- Success Display - When an operation succeeds a success message is received from OnlyKey "starting with Sucess" Should be displayed to user.
- Get Labels - The labels are sent to the chrome app as 12 separate packets each with one label. These should populate the label fields in the configuration page.
- Set Slot - Data entered into the various fields should be sent to OnlyKey when submit button is pressed.
- Wipe Slot - A wipe slot messege should be sent when a field is selected and wipe button is pressed.


