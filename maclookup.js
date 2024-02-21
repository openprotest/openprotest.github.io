class MacLookup extends Console {
	constructor(params) {
		super();

		this.params = params ?? { entries: [] };

		this.AddCssDependencies("tools.css");

		this.hashtable = {}; //contains all elements

		this.SetTitle("MAC lookup");
		this.SetIcon("mono/maclookup.svg");

		this.SetupToolbar();
		this.clearButton   = this.AddToolbarButton("Clear", "mono/wing-light.svg");

		this.txtInput.placeholder = "mac address";

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

	Filter(macaddr) {
		if (macaddr.indexOf(";", 0) > -1) {
			let ips = macaddr.split(";");
			for (let i = 0; i < ips.length; i++) this.Add(ips[i].trim());

		}
		else if (macaddr.indexOf(",", 0) > -1) {
			let ips = macaddr.split(",");
			for (let i = 0; i < ips.length; i++) this.Add(ips[i].trim());

		}
		else {
			this.Add(macaddr);
		}
	}

	Add(macaddr) {
		while (macaddr.indexOf("-") > -1) macaddr = macaddr.replace("-", "");
		while (macaddr.indexOf(":") > -1) macaddr = macaddr.replace(":", "");
		while (macaddr.indexOf(" ") > -1) macaddr = macaddr.replace(" ", "");

		if (this.hashtable.hasOwnProperty(macaddr)) {
			this.list.appendChild(this.hashtable[macaddr].element);
			return;
		}

		this.txtInput.className = "input-box-dark";

		let element = document.createElement("div");
		element.className = "tool-element collapsible-box";
		this.list.appendChild(element);

		let name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.innerHTML = macaddr;
		element.appendChild(name);

		let result = document.createElement("div");
		result.className = "tool-result collapsed100";
		result.innerHTML = "";
		element.appendChild(result);

		let remove = document.createElement("div");
		remove.className = "tool-remove";
		element.appendChild(remove);

		this.hashtable[macaddr] = {
			element: element,
			result: result
		};

		remove.onclick = () => { this.Remove(macaddr); };

		this.params.entries.push(macaddr);

		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = () => {
			if (xhr.readyState == 4 && xhr.status == 200) {
				let bytes = xhr.responseText;

				let target = this.BytesToInt([
					parseInt(macaddr.toLowerCase().substring(4, 6), 16),
					parseInt(macaddr.toLowerCase().substring(2, 4), 16),
					parseInt(macaddr.toLowerCase().substring(0, 2), 16)
				]);

				let label = document.createElement("div");
				result.appendChild(label);

				if (isNaN(target)) {
					label.innerHTML = "not a valid mac address";
					return;
				}

				let namesBegin = this.BytesToInt([
					bytes.charCodeAt(0) & 0xff,
					bytes.charCodeAt(1) & 0xff,
					bytes.charCodeAt(2) & 0xff,
					bytes.charCodeAt(3) & 0xff
				]);

				let low = 4;
				let high = namesBegin;

				let pivot, current;

				do { //binary search
					pivot = (low + high) / 2;
					pivot = pivot - pivot % 7 + 4;

					current = this.BytesToInt([
						bytes.charCodeAt(pivot + 2) & 0xff,
						bytes.charCodeAt(pivot + 1) & 0xff,
						bytes.charCodeAt(pivot) & 0xff
					]);

					if (current == target) break; //found

					if (target < current) high = pivot;
					if (target > current) low = pivot;
				} while (high - low > 7);

				if (target == current) { //found
					let manufacturer = "";

					let name_index = this.BytesToInt([
						bytes.charCodeAt(pivot + 3) & 0xff,
						bytes.charCodeAt(pivot + 4) & 0xff,
						bytes.charCodeAt(pivot + 5) & 0xff,
						bytes.charCodeAt(pivot + 6) & 0xff
					]);

					let char = null;
					do {
						char = bytes.charCodeAt(namesBegin + name_index++) & 0xff;
						manufacturer += String.fromCharCode(char);
					} while (char != 0 && manufacturer.length < 512);

					label.innerHTML = manufacturer;
				} else {
					label.innerHTML = "not found";
				}

			} else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
				this.ConfirmBox("Server is unavailable.", true);
		};

		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.open("GET", "data/mac.bin", true);
		xhr.send();
	}

	BytesToInt(array) {
		var value = 0;
		for (var i = array.length - 1; i >= 0; i--)
			value = Number(value * 256) + Number(array[i]);
		return value;
	};

	Remove(macaddr) {
		if (!(macaddr in this.hashtable)) return;
		this.list.removeChild(this.hashtable[macaddr].element);
		delete this.hashtable[macaddr];

		const index = this.params.entries.indexOf(macaddr);
		if (index > -1)
			this.params.entries.splice(index, 1);
	}
}