const nodeHID = require('node-hid');
const chalk = require('chalk');

var bytes2string = function bytes2string(bytes) {
	if (!bytes) return;
	var ret = Array.from(bytes).map(function chr(c) {
		return String.fromCharCode(c);
	}).join('');
	return ret;
};

var $hids = {};

function findHID(hid_interface) {
	var hids = nodeHID.devices();

	if (!$hids[hid_interface])
		$hids[hid_interface] = {};

	$hids[hid_interface].finding = true;

	if ($hids[hid_interface].com || $hids[hid_interface].error) {
		$hids[hid_interface].com = false;
		$hids[hid_interface].error = false;
	}

	for (var i in hids) {
		if (hids[i].product == "ONLYKEY" && hids[i].interface == 3) {
			if (hids[i].interface == hid_interface) {
				$hids[hid_interface].com = false;
				$hids[hid_interface].device = hids[i];

			}
		}
	}

	if (!$hids[hid_interface].com && $hids[hid_interface].device) {
		try {
			$hids[hid_interface].com = new nodeHID.HID($hids[hid_interface].device.path);
			process.stdout.write(chalk.yellow('Connected onlykey interface ' + hid_interface + '\r\n'));
			$hids[hid_interface].com.on('data', function(data) {
				var bfrstr = bytes2string(data);
				if (bfrstr) {
					if (bfrstr.includes('Error') || bfrstr.includes('error') || bfrstr.includes('Fail') || bfrstr.includes('fail')) process.stdout.write(chalk.red(bfrstr));
					else if (bfrstr.includes('success') || bfrstr.includes('Success')) process.stdout.write(chalk.green(bfrstr));
					else process.stdout.write(chalk.white(bfrstr));
				}
			});
			$hids[hid_interface].com.on('error', function(error) {
				$hids[hid_interface] = false;
				process.stdout.write(chalk.yellow('Disconnected onlykey interface ' + hid_interface + '\r\n' ));
			});
		}
		catch (e) {}
	}

	$hids[hid_interface].finding = false;
}

var looping = false;
setInterval(function() {
	if (looping) return;
	looping = true;
	try {
		loadInterface(3);
	}
	catch (e) {
		console.log(e);
	}
	try {
		loadInterface(2);
	}
	catch (e) {
		console.log(e);
	}
	looping = false;
}, 1);

function loadInterface(hid_interface) {
	if (!$hids[hid_interface] || !$hids[hid_interface].finding && !$hids[hid_interface].com)
		return findHID(hid_interface);
}

