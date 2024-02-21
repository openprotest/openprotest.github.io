class LocateIp extends Console {
	constructor(params) {
		super();

		this.params = params ?? { entries: [] };

		this.AddCssDependencies("tools.css");

		this.hashtable = {}; //contains all elements

		this.SetTitle("Locate IP");
		this.SetIcon("mono/locate.svg");

		this.SetupToolbar();
		this.clearButton   = this.AddToolbarButton("Clear", "mono/wing-light.svg");

		if (this.params.entries) { //restore entries from previous session
			let temp = this.params.entries;
			this.params.entries = [];
			for (let i = 0; i < temp.length; i++)
				this.Push(temp[i]);
		}

		this.clearButton.addEventListener("click", ()=> {
			const btnOK = this.ConfirmBox("Are you sure you want to clear the list?");
			if (btnOK) btnOK.addEventListener("click", ()=> {
				this.list.textContent = "";
				this.hashtable = {};
				this.params.entries = [];
			});
		});
	}

	Push(name) { //override
		if (!super.Push(name)) return;
		this.Filter(name);
	}

	Filter(ipaddr) {
		if (ipaddr.indexOf(";", 0) > -1) {
			let ips = ipaddr.split(";");
			for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());
		}
		else if (ipaddr.indexOf(",", 0) > -1) {
			let ips = ipaddr.split(",");
			for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());
		}
		else if (ipaddr.indexOf("-", 0) > -1) {
			let split = ipaddr.split("-");
			let start = split[0].trim().split(".");
			let end = split[1].trim().split(".");

			let istart = (parseInt(start[0]) << 24) + (parseInt(start[1]) << 16) + (parseInt(start[2]) << 8) + (parseInt(start[3]));
			let iend = (parseInt(end[0]) << 24) + (parseInt(end[1]) << 16) + (parseInt(end[2]) << 8) + (parseInt(end[3]));

			if (istart > iend) iend = istart;
			if (iend - istart > 255) iend = istart + 255;

			function intToBytes(int) {
				let b = [0, 0, 0, 0];
				let i = 4;
				do {
					b[--i] = int & (255);
					int = int >> 8;
				} while (i);
				return b;
			}

			for (let i = istart; i <= iend; i++)
				this.Add(intToBytes(i).join("."));
		}
		else if (ipaddr.indexOf("/", 0) > -1) {
			let cidr = parseInt(ipaddr.split("/")[1].trim());
			if (isNaN(cidr)) return;

			let ip = ipaddr.split("/")[0].trim();
			let ipBytes = ip.split(".");
			if (ipBytes.length != 4) return;

			ipBytes = ipBytes.map(o=> parseInt(o));

			let bits = "1".repeat(cidr).padEnd(32, "0");
			let mask = [];
			mask.push(parseInt(bits.substr(0, 8), 2));
			mask.push(parseInt(bits.substr(8, 8), 2));
			mask.push(parseInt(bits.substr(16, 8), 2));
			mask.push(parseInt(bits.substr(24, 8), 2));

			let net = [], broadcast = [];
			for (let i = 0; i < 4; i++) {
				net.push(ipBytes[i] & mask[i]);
				broadcast.push(ipBytes[i] | (255 - mask[i]));
			}

			this.Filter(net.join(".") + " - " + broadcast.join("."));
		}
		else {
			this.Add(ipaddr);
		}
	}

	Add(ipaddr) {
		if (ipaddr.length == 0) return;
		if (ipaddr.indexOf(" ") > -1) return;

		if (this.hashtable.hasOwnProperty(ipaddr)) {
			this.list.appendChild(this.hashtable[ipaddr].element);
			return;
		}

		this.txtInput.className = "input-box-dark";

		let element = document.createElement("div");
		element.className = "tool-element collapsible-box";
		this.list.appendChild(element);

		let name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.innerHTML = ipaddr;
		element.appendChild(name);

		let result = document.createElement("div");
		result.className = "tool-result collapsed100";
		result.innerHTML = "";
		element.appendChild(result);

		let remove = document.createElement("div");
		remove.className = "tool-remove";
		element.appendChild(remove);

		this.hashtable[ipaddr] = {
			element: element,
			result: result
		};

		remove.onclick = () => { this.Remove(ipaddr); };

		this.params.entries.push(ipaddr);

		let ipBytes = ipaddr.split(".");
		if (ipBytes.length < 4) {
			result.innerHTML = "not a valid ip address";
			return;
		}

		for (let i = 0; i < 4; i++)
			if (isNaN(ipBytes[i]) || ipBytes[i] < 0 || ipBytes[i] > 255) {
				result.innerHTML = "not a valid ip address";
				return;
			}

		let target = this.BytesToInt([
			ipBytes[3],
			ipBytes[2],
			ipBytes[1],
			ipBytes[0]
		]);

		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = () => {
			if (xhr.readyState == 4 && xhr.status == 200) {
				let bytes = xhr.responseText;

				let namesBegin = this.BytesToInt([
					bytes.charCodeAt(0) & 0xff,
					bytes.charCodeAt(1) & 0xff,
					bytes.charCodeAt(2) & 0xff,
					bytes.charCodeAt(3) & 0xff
				]);

				let index = 4;
				let from, to;
				while (index < namesBegin) {
					from = this.BytesToInt([
						0 & 0xff,
						bytes.charCodeAt(index) & 0xff,
						bytes.charCodeAt(index + 1) & 0xff,
						ipBytes[0] & 0xff
					]);

					to = this.BytesToInt([
						255 & 0xff,
						bytes.charCodeAt(index + 2) & 0xff,
						bytes.charCodeAt(index + 3) & 0xff,
						ipBytes[0] & 0xff
					]);

					if (target >= from && target <= to) break;
					index += 26;
				}

				if (target >= from && target <= to) { //found
					let fl = bytes[index + 4] + bytes[index + 5];
					let p = [null, null, null, null];


					for (let i = 0; i < 4; i++) p[i] = bytes.charCodeAt(index + 6 + i) & 0xff;
					let ptr1 = this.BytesToInt(p);
					for (let i = 0; i < 4; i++) p[i] = bytes.charCodeAt(index + 10 + i) & 0xff;
					let ptr2 = this.BytesToInt(p);
					for (let i = 0; i < 4; i++) p[i] = bytes.charCodeAt(index + 14 + i) & 0xff;
					let ptr3 = this.BytesToInt(p);

					let s1 = "";
					for (let i = 0; i < 256; i++) {
						let b = bytes.charCodeAt(namesBegin + ptr1 + i) & 0xff;
						if (b == 0) break;
						s1 += String.fromCharCode(b);
					}

					let s2 = "";
					for (let i = 0; i < 256; i++) {
						let b = bytes.charCodeAt(namesBegin + ptr2 + i) & 0xff;
						if (b == 0) break;
						s2 += String.fromCharCode(b);
					}

					let s3 = "";
					for (let i = 0; i < 256; i++) {
						let b = bytes.charCodeAt(namesBegin + ptr3 + i) & 0xff;
						if (b == 0) break;
						s3 += String.fromCharCode(b);
					}

					if (fl != "--") {
						let divFlag = document.createElement("div");
						divFlag.style.width = "24px";
						divFlag.style.height = "18px";
						divFlag.style.margin = "8px 8px 0 0";
						divFlag.style.backgroundImage = "url(/flags/" + fl.toLocaleLowerCase() + ".svg)";
						divFlag.style.animation = "fade-in .4s";
						result.appendChild(divFlag);
					}

					if (s2 == "--" && s3 == "--")
						result.innerHTML += s1;
					else
						result.innerHTML += s1 + ", " + s2 + ", " + s3;

					let lon = 0;
					let lat = 0;

					if (lon != 0 && lat != 0) {
						let divLocation = document.createElement("div");
						divLocation.style.position = "absolute";
						divLocation.style.width = "24px";
						divLocation.style.height = "24px";
						divLocation.style.right = "32px";
						divLocation.style.top = "4px";
						divLocation.style.backgroundSize = "contain";
						divLocation.style.backgroundImage = "url(res/locate.svg)";
						divLocation.style.filter = "invert(1)";
						divLocation.style.cursor = "pointer";
						element.appendChild(divLocation);

						divLocation.onclick = () => window.open("http://www.google.com/maps/place/" + split[4]);
					}

				} else
					result.innerHTML = "not found";

			} else if (xhr.readyState == 4 && xhr.status == 404) {
				result.innerHTML = "not found";

			} else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
				this.ConfirmBox("Server is unavailable.", true);
		};

		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.open("GET", "data/ip/" + ipBytes[0] + ".bin", true);
		xhr.send();
	}

	BytesToInt(array) {
		var value = 0;
		for (var i = array.length - 1; i >= 0; i--)
			value = Number(value * 256) + Number(array[i]);
		return value;
	};

	Remove(ipaddr) {
		if (!(ipaddr in this.hashtable)) return;
		this.list.removeChild(this.hashtable[ipaddr].element);
		delete this.hashtable[ipaddr];

		const index = this.params.entries.indexOf(ipaddr);
		if (index > -1)
			this.params.entries.splice(index, 1);
	}
}