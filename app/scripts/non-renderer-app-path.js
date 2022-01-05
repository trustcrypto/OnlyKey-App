const devApp = 'nwjs Helper.app';
const prodApp = 'OnlyKey App.app';
// path should use "nwjs Helper", not "nwjs Helper (Renderer)"
const tempPath = process.execPath.replace(/ \(Renderer\)/g, '');
let appPath;
if (tempPath.includes(prodApp)) {
  const pathParts = tempPath.split(prodApp);
  appPath = pathParts[0] + prodApp;
} else {
  const pathParts = tempPath.split(devApp);
  appPath = pathParts[0] + devApp;
}

module.exports = appPath;