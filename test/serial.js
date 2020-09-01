const nodeHID = require('node-hid');

var bytes2string = function bytes2string(bytes) {
	if (!bytes) return;
	var ret = Array.from(bytes).map(function chr(c) {
		return String.fromCharCode(c);
	}).join('');
	return ret;
};

var $hids = {};

var color = {};

(function(){
	var colorRGB = function(c) { return '\x1b[38;2;' + c + 'm'; };
	var colorSwatch = {
		"red": "255;0;0",
		"orange": "255;165;0",
		"yellow": "255;255;0",
		"green": "50;205;50",
		"teal": "0;128;128",
		"blue": "0;0;255",
		"purple": "128;0;128",
		"white": "255;255;255",
	};
	for (var i in colorSwatch) {
		color[i] = colorRGB(colorSwatch[i]);
	}
})();


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
			process.stdout.write(color.yellow + "Connected onlykey interface " + hid_interface + "\r\n" + color.white);
			$hids[hid_interface].com.on('data', function(data) {
				var bfrstr = bytes2string(data);
				var $color = color.white;
				if (bfrstr) {
					$color = (bfrstr.includes("Error") ? color.red : color.white);
					$color = (bfrstr.includes("Success") ? color.green : color.white);
					var addNewLines = (hid_interface == 2 ? true : false);
					process.stdout.write($color);
					process.stdout.write(bfrstr);
					process.stdout.write(color.white);
				}
			});
			$hids[hid_interface].com.on('error', function(error) {
				$hids[hid_interface] = false;
				process.stdout.write(color.yellow + "Disconnected onlykey interface " + hid_interface + "\r\n" + color.white);
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

var readline = require('readline'),
	rl = readline.createInterface(process.stdin, process.stdout),
	prefix = '';

rl.on('line', function(line) {
	switch (line.trim()) {
		default: if (line.length) {
			var inter = 3;
			if ($hids[inter] && $hids[inter].com) {
				var messageA = [];
				for (var i = 0; i < line.length; i++) {
					messageA.push(line.charCodeAt(i));
				}
				messageA.push("\n".charCodeAt(0));
				if (process.platform.indexOf("win") > -1)
					process.stdout.write("\n");
				messageA.unshift(0x00);
				$hids[inter].com.write(messageA);
			}
		}
		break;
	}
	rl.setPrompt(prefix, prefix.length);
	rl.prompt();
}).on('close', function() {
	process.exit(0);
});
rl.setPrompt(prefix, prefix.length);
rl.prompt();
