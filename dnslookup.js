"use strict";
class DnsLookup extends Console {
	static RECORD_TYPES = [
		["A",     "IPv4 Address",          "hsl(20,85%,50%)",  1],
		["AAAA",  "IPv6 Address",          "hsl(50,85%,50%)",  28],
		["NS",    "Name Server",           "hsl(80,85%,50%)",  2],
		["CNAME", "Canonical Name",        "hsl(140,85%,50%)", 5],
		["SOA",   "Start Of Authority",    "hsl(200,85%,55%)", 6],
		["PTR",   "Pointer",               "hsl(230,95%,65%)", 12],
		["MX",    "Mail Exchange",         "hsl(260,95%,65%)", 15],
		["TXT",   "Text",                  "hsl(290,85%,55%)", 16],
		["SRV",   "Service",               "hsl(320,85%,50%)", 33],
		["CAA",   "Certification Authority Authorization", "hsl(350,85%,60%)", 257]
	];

	//DNS-over-HTTPS resolvers with a JSON API that browsers are allowed to call (CORS)
	static RESOLVERS = {
		cloudflare: { name: "Cloudflare", url: "https://cloudflare-dns.com/dns-query" },
		google:     { name: "Google",     url: "https://dns.google/resolve" }
	};

	static RCODES = ["NOERROR", "FORMERR", "SERVFAIL", "NXDOMAIN", "NOTIMP", "REFUSED"];

	constructor(params) {
		super();

		this.params = params ?? {
			entries   : [],
			resolver  : "cloudflare", //a key of RESOLVERS, or a custom url
			type      : "A",
			timeout   : 3000,
			dnssec    : false, //request DNSSEC records
			checking  : true   //let the resolver validate DNSSEC
		};

		Window.AddCssDependencies("tools.css");

		this.hashtable = Object.create(null); //contains all elements

		this.SetTitle("DNS lookup");
		this.SetIcon("mono/dns.svg");

		this.txtInput.placeholder = "domain or ip";

		this.SetupToolbar();
		this.reloadButton = this.AddToolbarButton("Reload", "mono/update-light.svg");
		this.clearButton = this.AddToolbarButton("Clear", "mono/wing-light.svg");
		this.AddToolbarSeparator();
		this.recordType = this.AddToolbarDropdown(this.GetTypeIcon(this.params.type));
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench-light.svg");

		this.UpdateTitle();

		if (this.params.entries) { //restore entries from previous session
			const temp = this.params.entries;
			this.params.entries = [];
			for (let i = 0; i < temp.length; i++) {
				const split = temp[i].split(",");
				if (split.length < 2) continue;
				this.Push(split.slice(1).join(","), split[0]);
			}
		}

		this.reloadButton.addEventListener("click", ()=> {
			if (this.params.entries.length === 0) return;
			const entries = this.params.entries;
			this.list.textContent = "";
			this.hashtable = Object.create(null);
			this.params.entries = [];

			for (let i = 0; i < entries.length; i++) {
				const split = entries[i].split(",");
				if (split.length < 2) continue;
				this.Add(split.slice(1).join(","), split[0]);
			}
		});

		this.clearButton.addEventListener("click", ()=> {
			const okButton = this.ConfirmBox("Are you sure you want to clear the list?");
			if (okButton) okButton.addEventListener("click", ()=> {
				this.list.textContent = "";
				this.hashtable = Object.create(null);
				this.params.entries = [];
			});
		});

		this.optionsButton.addEventListener("click", ()=> this.OptionsDialog());

		for (let i = 0; i < DnsLookup.RECORD_TYPES.length; i++) {
			const type = document.createElement("div");
			type.style.padding = "4px 8px";

			const label = this.CreateTypeLabel(DnsLookup.RECORD_TYPES[i][0]);
			label.style.height = "22px";
			label.style.lineHeight = "22px";

			const string = document.createElement("div");
			string.style.display = "inline-block";
			string.textContent = DnsLookup.RECORD_TYPES[i][1];

			type.append(label, string);
			this.recordType.list.append(type);

			type.onclick = ()=> this.SetType(DnsLookup.RECORD_TYPES[i][0]);
		}
		this.recordType.menu.style.height = `${DnsLookup.RECORD_TYPES.length * 30}px`;
	}

	SetType(type) {
		this.params.type = type;
		this.recordType.button.style.backgroundImage = `url(${this.GetTypeIcon(type)})`;
	}

	UpdateTitle() {
		const resolver = DnsLookup.RESOLVERS[this.params.resolver];
		this.SetTitle(`DNS lookup: ${resolver ? resolver.name : this.params.resolver}`);
	}

	GetResolverUrl() {
		return DnsLookup.RESOLVERS[this.params.resolver]?.url ?? this.params.resolver;
	}

	static TypeColor(type) {
		return DnsLookup.RECORD_TYPES.find(o=> o[0] === type)?.[2] ?? "hsl(0,0%,80%)";
	}

	//record types outside RECORD_TYPES (like RRSIG) are shown by their number
	static TypeName(number) {
		const known = { 43:"DS", 46:"RRSIG", 47:"NSEC", 48:"DNSKEY", 50:"NSEC3", 64:"SVCB", 65:"HTTPS" };
		return DnsLookup.RECORD_TYPES.find(o=> o[3] === number)?.[0] ?? known[number] ?? `TYPE${number}`;
	}

	CreateTypeLabel(type) {
		const label = document.createElement("div");
		label.textContent = type;
		label.style.display = "inline-block";
		label.style.color = DnsLookup.TypeColor(type);
		label.style.backgroundColor = "#222";
		label.style.fontFamily = "monospace";
		label.style.fontWeight = "600";
		label.style.marginRight = "4px";
		label.style.padding = "1px 4px";
		label.style.borderRadius = "4px";
		label.style.userSelect = "none";
		return label;
	}

	GetTypeIcon(type) {
		const icon = "<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" x=\"0px\" y=\"0px\" width=\"48px\" height=\"48px\" viewBox=\"0 0 48 48\">"+
		"<polygon fill=\"#c0c0c0\" points=\"15.68,1 7,10.96 7,47 41,47 41,1\"/>"+
		`<rect fill="${DnsLookup.TypeColor(type)}" x="12" y="26" width="36" height="16" rx="4" />`+
		`<text fill="#202020" x="30" y="35" text-anchor="middle" dominant-baseline="middle" font-size="${18 - type.length}" font-family="monospace" font-weight="800">${type}</text>`+
		"</svg>";

		return `data:image/svg+xml;base64,${btoa(icon)}`;
	}

	OptionsDialog() {
		const dialog = this.DialogBox("320px");
		if (dialog === null) return;

		const {btnOK, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "560px";
		innerBox.style.padding = "40px 0px 0px 40px";

		const AddLabel = text=> {
			const label = document.createElement("div");
			label.textContent = text;
			label.style.display = "inline-block";
			label.style.minWidth = "150px";
			innerBox.appendChild(label);
		};

		AddLabel("Resolver:");
		const resolverInput = document.createElement("select");
		resolverInput.style.width = "260px";
		innerBox.appendChild(resolverInput);

		for (const key in DnsLookup.RESOLVERS) {
			const option = document.createElement("option");
			option.value = key;
			option.textContent = `${DnsLookup.RESOLVERS[key].name} (${new URL(DnsLookup.RESOLVERS[key].url).host})`;
			resolverInput.appendChild(option);
		}
		const customOption = document.createElement("option");
		customOption.value = "custom";
		customOption.textContent = "Custom";
		resolverInput.appendChild(customOption);

		innerBox.appendChild(document.createElement("br"));

		AddLabel("Resolver URL:");
		const urlInput = document.createElement("input");
		urlInput.type = "text";
		urlInput.placeholder = "https://resolver/dns-query";
		urlInput.style.width = "260px";
		innerBox.appendChild(urlInput);

		innerBox.appendChild(document.createElement("br"));

		AddLabel("Record type:");
		const recordTypeInput = document.createElement("select");
		recordTypeInput.style.width = "260px";
		innerBox.appendChild(recordTypeInput);
		for (let i = 0; i < DnsLookup.RECORD_TYPES.length; i++) {
			const option = document.createElement("option");
			option.value = DnsLookup.RECORD_TYPES[i][0];
			option.textContent = `${DnsLookup.RECORD_TYPES[i][0]} - ${DnsLookup.RECORD_TYPES[i][1]}`;
			recordTypeInput.appendChild(option);
		}
		recordTypeInput.value = this.params.type;

		innerBox.appendChild(document.createElement("br"));

		AddLabel("Time out (ms):");
		const timeoutInput = document.createElement("input");
		timeoutInput.type = "number";
		timeoutInput.min = 100;
		timeoutInput.max = 30000;
		timeoutInput.value = this.params.timeout;
		timeoutInput.style.width = "260px";
		innerBox.appendChild(timeoutInput);

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const dnssecToggle = this.CreateToggle("Request DNSSEC records", this.params.dnssec, innerBox);
		innerBox.appendChild(document.createElement("br"));

		const checkingToggle = this.CreateToggle("Validate DNSSEC", this.params.checking, innerBox);
		innerBox.appendChild(document.createElement("br"));

		if (DnsLookup.RESOLVERS[this.params.resolver]) {
			resolverInput.value = this.params.resolver;
			urlInput.value = DnsLookup.RESOLVERS[this.params.resolver].url;
			urlInput.disabled = true;
		}
		else {
			resolverInput.value = "custom";
			urlInput.value = this.params.resolver;
		}

		resolverInput.onchange = ()=> {
			const preset = DnsLookup.RESOLVERS[resolverInput.value];
			urlInput.disabled = !!preset;
			if (preset) urlInput.value = preset.url;
			else urlInput.focus();
		};

		const Apply = ()=> {
			this.params.resolver = resolverInput.value === "custom" ? urlInput.value.trim() : resolverInput.value;
			if (this.params.resolver.length === 0) this.params.resolver = "cloudflare";
			this.params.timeout = parseInt(timeoutInput.value) || 3000;
			this.params.dnssec = dnssecToggle.checkbox.checked;
			this.params.checking = checkingToggle.checkbox.checked;
			this.SetType(recordTypeInput.value);
			this.UpdateTitle();
		};

		const OnKeydown = event=> {
			if (event.key === "Enter") {
				Apply();
				btnOK.onclick();
			}
		};

		urlInput.addEventListener("keydown", OnKeydown);
		timeoutInput.addEventListener("keydown", OnKeydown);

		btnOK.addEventListener("click", ()=> Apply());

		resolverInput.focus();

		return dialog;
	}

	Push(name, type=null) { //overrides
		if (!super.Push(name)) return;
		this.Filter(name, type);
	}

	Filter(domain, type=null) {
		if (domain.indexOf(";", 0) > -1) {
			const names = domain.split(";");
			for (let i = 0; i < names.length; i++) this.Add(names[i].trim(), type);
		}
		else if (domain.indexOf(",", 0) > -1) {
			const names = domain.split(",");
			for (let i = 0; i < names.length; i++) this.Add(names[i].trim(), type);
		}
		else {
			this.Add(domain, type);
		}
	}

	//An ip address is looked up in reverse: 8.8.8.8 is queried as a PTR of 8.8.8.8.in-addr.arpa
	static ReverseName(address) {
		if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address))
			return address.split(".").reverse().join(".") + ".in-addr.arpa";

		if (address.includes(":") && /^[0-9a-f:.]+$/i.test(address)) {
			const halves = address.split("::");
			if (halves.length > 2) return null;
			const left = halves[0] ? halves[0].split(":") : [];
			const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
			const missing = 8 - left.length - right.length;
			if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
			const groups = [...left, ...new Array(missing).fill("0"), ...right];
			if (groups.some(o=> !/^[0-9a-f]{1,4}$/i.test(o))) return null;
			return groups.map(o=> o.padStart(4, "0")).join("").split("").reverse().join(".") + ".ip6.arpa";
		}

		return null;
	}

	async Add(domain, type=null) {
		if (domain.length === 0) return;

		const reverse = DnsLookup.ReverseName(domain);
		type = reverse ? "PTR" : (type ?? this.params.type);

		const entryKey = `${type},${domain}`;

		if (entryKey in this.hashtable) {
			this.list.appendChild(this.hashtable[entryKey].element);
			return;
		}

		const element = document.createElement("div");
		element.className = "tool-element";
		this.list.appendChild(element);

		const expandedButton = document.createElement("div");
		expandedButton.className = "tool-button-expanded";

		const name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.setAttribute("label", type);
		name.textContent = domain;

		const result = document.createElement("div");
		result.className = "tool-result collapsed";
		result.textContent = "";

		const remove = document.createElement("div");
		remove.className = "tool-remove";

		element.append(expandedButton, name, result, remove);

		this.hashtable[entryKey] = {
			element: element,
			result: result,
			expand: false
		};

		remove.onclick = ()=> this.Remove(entryKey);

		expandedButton.onclick = ()=> {
			if (this.hashtable[entryKey].expand) {
				this.hashtable[entryKey].expand = false;
				element.style.height = "32px";
				expandedButton.style.transform = "rotate(-90deg)";
				result.className = "tool-result collapsed";
				result.scrollTop = 0;
			}
			else {
				this.hashtable[entryKey].expand = true;
				element.style.height = "auto";
				expandedButton.style.transform = "rotate(0deg)";
				result.className = "tool-result expanded";
			}
		};

		this.params.entries.push(entryKey);

		const ShowError = text=> {
			expandedButton.style.display = "none";
			result.textContent = "";
			const span = document.createElement("span");
			span.style.color = "var(--clr-error)";
			span.style.fontWeight = "bold";
			span.textContent = text;
			result.appendChild(span);
		};

		try {
			const url = new URL(this.GetResolverUrl());
			url.searchParams.set("name", reverse ?? domain);
			url.searchParams.set("type", type);
			if (this.params.dnssec)    url.searchParams.set("do", "1");
			if (!this.params.checking) url.searchParams.set("cd", "1");

			const abort = new AbortController();
			const timeout = setTimeout(()=> abort.abort(), this.params.timeout);

			let response;
			try {
				response = await fetch(url, {
					headers: { "accept": "application/dns-json" },
					signal: abort.signal
				});
			}
			finally {
				clearTimeout(timeout);
			}

			if (response.status !== 200) {
				ShowError(`HTTP ${response.status}`);
				return;
			}

			const json = await response.json();

			if (json.Status !== 0) {
				ShowError(DnsLookup.RCODES[json.Status] ?? `error code ${json.Status}`);
				return;
			}

			if (json.AD) name.title = "Authenticated with DNSSEC";

			const records = json.Answer ?? [];
			if (records.length === 0) {
				expandedButton.style.display = "none";
				const span = document.createElement("span");
				span.style.opacity = ".6";
				span.textContent = "no records";
				result.appendChild(span);
				return;
			}

			for (let i = 0; i < records.length; i++) {
				const recordType = DnsLookup.TypeName(records[i].type);

				const box = document.createElement("div");
				box.title = `TTL: ${records[i].TTL}s`;

				const label = this.CreateTypeLabel(recordType);
				label.style.height = "18px";
				label.style.lineHeight = "20px";

				const string = document.createElement("div");
				string.style.display = "inline-block";
				string.textContent = records[i].data;

				box.append(label, string);
				result.appendChild(box);
			}
		}
		catch (ex) {
			ShowError(ex.name === "AbortError" ? "timed out" : "unreachable resolver");
		}
	}

	Remove(entryKey) {
		if (!(entryKey in this.hashtable)) return;
		this.list.removeChild(this.hashtable[entryKey].element);
		delete this.hashtable[entryKey];

		const index = this.params.entries.indexOf(entryKey);
		if (index > -1) this.params.entries.splice(index, 1);
	}
}
