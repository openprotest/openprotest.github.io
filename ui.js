const UNIX_BASE_TICKS = 62135596800000; //divided by 10000

const UI = {
	lastActivity: Date.now(),
	lastUpdateFilter: "",
	regionalFormat: "sys",
	onMobile: (/Android|webOS|iPhone|iPad|iPod|Opera Mini/i.test(navigator.userAgent)),

	Initialize: ()=> {
		for (let i = 0; i < 12; i++) { //clock dots
			const newDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			newDot.setAttribute("r", i % 3 == 0 ? 2.5 : 1.5);
			newDot.setAttribute("cx", 48 + Math.sin(i * 30 / 57.29577951) * 36);
			newDot.setAttribute("cy", 48 - Math.cos(i * 30 / 57.29577951) * 36);
			newDot.setAttribute("fill", "var(--clr-contrast)");
			analog_clock.appendChild(newDot);
		}

		//automatically disable animations if prefers-reduced-motion
		if (window.matchMedia('(prefers-reduced-motion)').matches && localStorage.getItem("animations") === null) {
			localStorage.setItem("animations", "false");
		}

		WIN.always_maxed = localStorage.getItem("w_always_maxed") === "true";
		taskbar.className = localStorage.getItem("w_tasktooltip") === "false" ? "no-tooltip" : "";
		document.body.className = localStorage.getItem("animations") !== "false" ? "" : "disable-animations";

		analog_clock.style.visibility = date_calendar.style.visibility = localStorage.getItem("desk_datetime") !== "false" ? "visible" : "hidden";
		analog_clock.style.opacity    = date_calendar.style.opacity    = localStorage.getItem("desk_datetime") !== "false" ? "1" : "0";

		container.className = "";
		if (localStorage.getItem("w_popout") !== "true") container.classList.add("no-popout");
		if (localStorage.getItem("w_dropshadow") === "false") container.classList.add("disable-window-dropshadows");
		if (localStorage.getItem("glass") === "true") container.classList.add("glass");

		let accentColor;
		try {
			accentColor = localStorage.getItem("accent_color") ?
				JSON.parse(localStorage.getItem("accent_color")) : [255, 102, 0];
		}
		catch {
			localStorage.removeItem("accent_color");
			accentColor = [];
		}

		let accentSaturation = localStorage.getItem("accent_saturation") ?
			localStorage.getItem("accent_saturation") : 100;

		if (accentSaturation !== 100) {
			UI.SetAccentColor(accentColor, accentSaturation / 100);
		}

		let scrollBarStyle = localStorage.getItem("scrollbar_style") ?
		localStorage.getItem("scrollbar_style") : "thin";
		container.classList.add(`scrollbar-${scrollBarStyle}`);

		UI.regionalFormat = localStorage.getItem("regional_format") ?
			localStorage.getItem("regional_format") : "sys";

		const pos = JSON.parse(localStorage.getItem("menu_button_pos"));
		if (pos) {
			menubutton.style.borderRadius = pos.borderRadius;
			menubutton.style.left = pos.left;
			menubutton.style.top = pos.top;
			menubutton.style.width = pos.width;
			menubutton.style.height = pos.height;

			const logo = menubutton.children[0];
			logo.style.left = pos.l_left;
			logo.style.top = pos.l_top;
			logo.style.width = pos.l_width;
			logo.style.height = pos.l_height;

			if (pos.l_top === "48px") {
				MENU.isDetached = false;
				attachedmenubutton.style.transform = "none";
				attachedmenubutton.style.boxShadow = "#202020 0 0 0 3px inset";
				menubutton.style.transform = "scaleY(0)";
				menubutton.children[0].style.top = "48px";
			}
			else {
				MENU.isDetached = true;
			}
		}
	},

	PromptAgent: (parent, command, value)=>{
		let key = localStorage.getItem("agent_key");

		if (!key) {
			const okButton = parent.ConfirmBox("Agent is not configured", false, "mono/agent.svg");
			okButton.value = "Configure";
			okButton.addEventListener("click", ()=>{new Personalize("agent")});
			return;
		}

		let url = btoa(`${key}${String.fromCharCode(127)}${command}${String.fromCharCode(127)}${value}`);
		const iframe = document.createElement("iframe");
		iframe.src = `protest://${url}`;
		iframe.style.border = "none";
		parent.win.appendChild(iframe);
		setTimeout(()=>{ parent.win.removeChild(iframe); }, 200);
	},

	SetAccentColor: (accent, saturation)=> {
		let hsl = UI.RgbToHsl(accent);

		let step1 = `hsl(${hsl[0] - 4},${hsl[1] * saturation}%,${hsl[2] * .78}%)`;
		let step2 = `hsl(${hsl[0] + 7},${hsl[1] * saturation}%,${hsl[2] * .9}%)`; //--clr-select
		let step3 = `hsl(${hsl[0] - 4},${hsl[1] * saturation}%,${hsl[2] * .8}%)`;
		let gradient = `linear-gradient(to bottom, ${step1}0%, ${step2}92%, ${step3}100%)`;

		let root = document.documentElement;
		root.style.setProperty("--clr-accent", `hsl(${hsl[0]},${hsl[1] * saturation}%,${hsl[2]}%)`);
		root.style.setProperty("--clr-select", step2);
		root.style.setProperty("--clr-transparent", `hsla(${hsl[0]},${hsl[1] * saturation}%,${hsl[2]}%,.6)`);
		root.style.setProperty("--grd-taskbar", gradient);
		root.style.setProperty("--grd-taskbar-rev", `linear-gradient(to bottom, ${step3}0%, ${step2}2%, ${step1}100%)`);

		let ico = "<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" x=\"0px\" y=\"0px\" width=\"48px\" height=\"48px\" viewBox=\"0 0 48 48\">" +
			"<g fill=\"" + step2 + "\">" +
			"<path d=\"M26.935,0.837h7.491l0.624,14.984l-8.24,1.873L26.935,0.837z\"/>" +
			"<path d=\"M38.172,19.068l-3.871,8.866l-22.974,9.489l0.125-8.44l13.412-2.299V15.821L1.712,20.566l1.998,26.221 l42.579,0.375l-0.249-30.466L38.172,19.068z\"/>" +
			"<path d=\"M4.459,0.837l0.374,16.857l8.741-1.873l-0.5-14.984H4.459z\"/>" +
			"<path d=\"M15.821,0.837h7.304L24,13.2l-8.054,1.498L15.821,0.837z\"/>" +
			"<path d=\"M37.672,0.837h7.367l1.249,12.986l-8.491,1.998L37.672,0.837z\"/>" +
			"</g></svg>";

		favicon.href = "data:image/svg+xml;base64," + btoa(ico);
	},

	RgbToHsl: color=> {
		let r = color[0] / 255;
		let g = color[1] / 255;
		let b = color[2] / 255;

		let min = Math.min(r, g, b);
		let max = Math.max(r, g, b);
		let delta = max - min;

		let h, s, l;

		if (delta == 0) h = 0;
		else if (max == r) h = ((g - b) / delta) % 6;
		else if (max == g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;

		h = Math.round(h * 60);

		if (h < 0) h += 360;

		l = (max + min) / 2;
		s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
		s = +(s * 100).toFixed(1);
		l = +(l * 100).toFixed(1);

		return [h, s, l];
	},

	PingColor(pingResult, lightness=50) {
		if (isNaN(pingResult))
			return (pingResult === "Timed out") ? "var(--clr-error)" : "var(--clr-orange)";
		
		if (pingResult === -1) {
			return "rgb(192,192,192)";
		}

		if (pingResult > 500) pingResult = 500;
		return `hsl(${Math.round(92 + pingResult / 2.2)},66%,${lightness}%)`;
	},

	TicksToUnixDate: ticks=> {
		ticks = ticks.toString();
		ticks = parseInt(ticks.substring(0, ticks.length - 4));
		return ticks - UNIX_BASE_TICKS;
	},

	UnixDateToTicks: long=> {
		return (long + UNIX_BASE_TICKS) * 10000;
	},

	SizeToString: size=> {
		if (size < 8_192) return `${size} bytes`;
		if (size < 8_192 * 1024) return `${Math.floor(size / 1024)} KB`;
		if (size < 8_192 * Math.pow(1024, 2)) return `${Math.floor(10 * size / Math.pow(1024, 2)) / 10}MB`;
		if (size < 8_192 * Math.pow(1024, 3)) return `${Math.floor(10 * size / Math.pow(1024, 3)) / 10}GB`;
		if (size < 8_192 * Math.pow(1024, 4)) return `${Math.floor(10 * size / Math.pow(1024, 4)) / 10}TB`;
		if (size < 8_192 * Math.pow(1024, 5)) return `${Math.floor(10 * size / Math.pow(1024, 5)) / 10}EB`;
		if (size < 8_192 * Math.pow(1024, 6)) return `${Math.floor(10 * size / Math.pow(1024, 6)) / 10}ZB`;
		if (size < 8_192 * Math.pow(1024, 7)) return `${Math.floor(10 * size / Math.pow(1024, 7)) / 10}YB`;
		if (size < 8_192 * Math.pow(1024, 8)) return `${Math.floor(10 * size / Math.pow(1024, 8)) / 10}BB`;
	},

	GenerateUuid: prefix=> {
		if (prefix) {
			return `${prefix}-${"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[x]/g, ()=>(window.crypto.getRandomValues(new Uint8Array(1))[0] & 0b00001111).toString(16))}`;
		}
		return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[x]/g, ()=>(window.crypto.getRandomValues(new Uint8Array(1))[0] & 0b00001111).toString(16));
	}
};

const MENU = {
	items: [
		{ t:"Locate IP",          i:"mono/locate-light.svg",       g:"utilities", h:false, f:params=> new LocateIp(params),     k:"location" },
		{ t:"MAC lookup",         i:"mono/maclookup-light.svg",    g:"utilities", h:false, f:params=> new MacLookup(params),    k:"vendor resolver" },
		{ t:"Encoder",            i:"mono/encoder-light.svg",      g:"utilities", h:false,  f:params=> new Encoder(params),   k:"binary hex base64 url html decode" },
		{ t:"Network calculator", i:"mono/netcalc-light.svg",      g:"utilities", h:false,  f:params=> new NetCalc(params),   k:"subnet" },
		{ t:"Password generator", i:"mono/passgen-light.svg",      g:"utilities", h:false, f:params=> new PassGen(params),  k:"code" },
		{ t:"Screen capture",     i:"mono/screenrecord-light.svg", g:"utilities", h:false,  f:params=> new ScreenCapture(),  k:"recorder shot" },
		{ t:"Camera tester",      i:"mono/webcam-light.svg",       g:"utilities", h:false,  f:params=> new CameraTester(),   k:"webcam" },
		{ t:"Microphone tester",  i:"mono/mic-light.svg",          g:"utilities", h:false,  f:params=> new MicTester(),      k:"audio input" },
		{ t:"Keyboard tester",    i:"mono/keyboard-light.svg",     g:"utilities", h:false,  f:params=> new KeyboardTester(), k:"keys" },
		{ t:"Gamepad tester",     i:"mono/gamepad-light.svg",      g:"utilities", h:false,  f:params=> new KeyboardTester("gamepad"), k:"joystick" },
		
		{ t:"Chess",              i:"chess/king-light.svg",              g:"game",      h:false,  f:params=> new Chess()},

		{ t:"Personalize",    i:"mono/personalize-light.svg", g:"manage", h:true, f:params=> new Personalize() },
		{ t:"Appearance",     i:"mono/tv-light.svg",          g:"manage", h:true,  f:params=> new Personalize("appearance") },
		{ t:"Reginal format", i:"mono/earth-light.svg",       g:"manage", h:true,  f:params=> new Personalize("region") },
		{ t:"Session",        i:"mono/hourglass-light.svg",   g:"manage", h:true,  f:params=> new Personalize("session") },

		{ t:"About",          i:"mono/logo-light.svg",        g:"manage", h:false, f:params=> new About("about") },
		{ t:"Legal",          i:"mono/law-light.svg",         g:"manage", h:true,  f:params=> new About("legal") },
	],

	isOpen: false,
	isDragging: false,
	isMoved: false,
	isDetached: true,
	position: [0, 0],
	index: -1,
	list: [],
	history: [],
	lastAltPress: 0,
	lastSearchValue: "",

	Clear: ()=> {
		if (searchinput.value.length > 0) {
			searchinput.value = "";
			MENU.Update();
		}
		else {
			MENU.Close();
		}
	},

	Open: ()=> {
		MENU.Update();

		MENU.isOpen = true;
		MENU.UpdatePosition();
		
		setTimeout(()=> searchinput.focus(), 150);
	},

	Close: ()=> {
		MENU.isOpen = false;
		MENU.UpdatePosition();

		searchinput.value = "";
		MENU.Update();
	},

	Toggle: ()=> {
		MENU.Update("");

		MENU.isOpen = !MENU.isOpen;
		MENU.UpdatePosition();

		if (MENU.isOpen) {
			setTimeout(()=> searchinput.focus(), 150);
		}
	},

	Update: filter=> {
		menulist.textContent = "";
		MENU.list = [];
		MENU.index = -1;

		const normalizedFilter = filter ? filter.trim() : "";
		const keywords = normalizedFilter.toLowerCase().split(" ").filter(o=> o.length > 0);

		const isGrid = normalizedFilter.length === 0;
		const showHidden = keywords.length > 0;

		for (let i = 0; i < MENU.items.length; i++) { //menu items
			if (MENU.items[i].h && !showHidden) continue;

			const match = keywords.every(
				keyword=> MENU.items[i].t.toLowerCase().includes(keyword) || MENU.items[i].g.includes(keyword) || (MENU.items[i].k && MENU.items[i].k.includes(keyword))
			);
			if (!match) continue;

			const newItem = document.createElement("div");
			newItem.className = isGrid ? "menu-grid-item" : "menu-list-item";
			newItem.textContent = MENU.items[i].t;
			newItem.style.backgroundImage = `url(${MENU.items[i].i})`;
			menulist.appendChild(newItem);

			MENU.list.push(newItem);
			MENU.ItemEvent(newItem, MENU.items[i].f);
		}
	},

	ItemEvent: (element, func)=> {
		element.onclick = event=> {
			if (event.ctrlKey) return;
			event.stopPropagation();
			MENU.Close();
			func();
		};

		element.onmousedown = event=> {
			if (event.button !== 1 && (event.button !== 0 || !event.ctrlKey)) return;
			if (event.preventDefault) event.preventDefault();
			func();
			WIN.GridWindows();
		};
	},

	Filter: index=> {
		menufilterdot.style.transform = "scale(1)";
		menufilterdot.style.width = "32px";
		menufilterdot.style.height = "4px";
		menufilterdot.style.left = `${menufilter.offsetLeft + index * 40 + 1}px`;

		MENU.Update(searchinput.value);
	},

	UpdatePosition: ()=> {
		menubox.style.visibility = MENU.isOpen ? "visible" : "hidden";
		cap.style.visibility = MENU.isOpen ? "visible" : "hidden";

		let left = menubutton.style.left ? parseInt(menubutton.style.left) : 0;

		if (left < 10) {
			menubox.style.left = "20px";
			menubox.style.top = "20px";
			menubox.style.bottom = "20px";
			menubox.style.transform = MENU.isOpen ? "none" : "translateX(calc(-100% - 24px))";
		}
		else if (menubutton.style.left == "calc(100% - 48px)" || left > 90) {
			menubox.style.left = "calc(100% - var(--sidemenu-width) - 20px)";
			menubox.style.top = "20px";
			menubox.style.bottom = "20px";
			menubox.style.transform = MENU.isOpen ? "none" : "translateX(100%)";

		}
		else {
			menubox.style.left = `max(20px, min(calc(${left}% - var(--sidemenu-width) / 2) + 32px, calc(100% - var(--sidemenu-width) - 20px)))`;

			if (menubutton.style.top == "0px") {
				menubox.style.top = "20px";
				menubox.style.bottom = window.innerHeight > 640 ? "25%" : "20px";
				menubox.style.transform = MENU.isOpen ? "none" : "translateY(-100%)";
			}
			else {
				menubox.style.top = window.innerHeight > 640 ? "25%" : "20px";
				menubox.style.bottom = "20px";
				menubox.style.transform = MENU.isOpen ? "none" : "translateY(100%)";
			}
		}
	},

	StorePosition: ()=> {
		const logo = menubutton.children[0];
		localStorage.setItem("menu_button_pos", JSON.stringify({
			borderRadius: menubutton.style.borderRadius,
			left: menubutton.style.left,
			top: menubutton.style.top,
			width: menubutton.style.width,
			height: menubutton.style.height,
			l_left: logo.style.left,
			l_top: logo.style.top,
			l_width: logo.style.width,
			l_height: logo.style.height
		}));
	}
};

window.addEventListener("mousedown", ()=> {
	UI.lastActivity = Date.now();
});

window.addEventListener("keydown", ()=> {
	UI.lastActivity = Date.now();
});

window.addEventListener("resize", ()=> {
	if (UI.onMobile) return;
	MENU.UpdatePosition();
});

document.body.addEventListener("mousemove", event=> {
	if (event.buttons != 1) {
		if (MENU.isDragging) MENU.StorePosition();
		MENU.isDragging = false;
	}

	if (!MENU.isDragging) return;

	//ignore if move is less than 2px
	if (Math.abs(MENU.position[0] - event.clientX) > 2 || Math.abs(MENU.position[1] - event.clientY) > 2) {
		MENU.isMoved = true;
	}

	const logo = menubutton.children[0];

	let px = event.x / container.clientWidth;
	let py = event.y / container.clientHeight;

	if (event.x < 56 && event.y < 56) {
		menubutton.style.borderRadius = "4px 8px 48px 8px";
		menubutton.style.left = "0px";
		menubutton.style.top = "0px";
		menubutton.style.width = "48px";
		menubutton.style.height = "48px";

		logo.style.left = "8px";
		logo.style.top = "6px";
		logo.style.width = "26px";
		logo.style.height = "26px";
	}
	else if (event.x < 56 && event.y > container.clientHeight - 48) {
		menubutton.style.borderRadius = "8px 48px 8px 4px";
		menubutton.style.left = "0px";
		menubutton.style.top = "calc(100% - 48px)";
		menubutton.style.width = "48px";
		menubutton.style.height = "48px";

		logo.style.left = "8px";
		logo.style.top = "16px";
		logo.style.width = "26px";
		logo.style.height = "26px";
	}
	else if (event.x > container.clientWidth - 48 && event.y < 56) {
		menubutton.style.borderRadius = "8px 4px 8px 64px";
		menubutton.style.left = "calc(100% - 48px)";
		menubutton.style.top = "0px";
		menubutton.style.width = "48px";
		menubutton.style.height = "48px";

		logo.style.left = "16px";
		logo.style.top = "6px";
		logo.style.width = "26px";
		logo.style.height = "26px";
	}
	else if (event.x > container.clientWidth - 48 && event.y > container.clientHeight - 48) {
		menubutton.style.borderRadius = "64px 8px 4px 8px";
		menubutton.style.left = "calc(100% - 48px)";
		menubutton.style.top = "calc(100% - 48px)";
		menubutton.style.width = "48px";
		menubutton.style.height = "48px";

		logo.style.left = "16px";
		logo.style.top = "16px";
		logo.style.width = "26px";
		logo.style.height = "26px";
	}
	else if (px < py && 1 - px > py) { //left
		let y = 100 * (event.y - 32) / container.clientHeight;

		menubutton.style.borderRadius = "14px 40px 40px 14px";
		menubutton.style.left = "0px";
		menubutton.style.top = `${y}%`;
		menubutton.style.width = "48px";
		menubutton.style.height = "64px";

		logo.style.left = "8px";
		logo.style.top = "18px";
		logo.style.width = "28px";
		logo.style.height = "28px";
	}
	else if (px > py && 1 - px > py) { //top
		let x = 100 * (event.x - 32) / container.clientWidth;

		menubutton.style.borderRadius = "14px 14px 40px 40px";
		menubutton.style.left = `${x}%`;
		menubutton.style.top = "0px";
		menubutton.style.width = "64px";
		menubutton.style.height = "48px";

		logo.style.left = "19px";
		logo.style.top = "6px";
		logo.style.width = "28px";
		logo.style.height = "28px";
	}
	else if (px < py && 1 - px < py) { //bottom
		let x = 100 * (event.x - 32) / container.clientWidth;

		menubutton.style.borderRadius = "40px 40px 14px 14px";
		menubutton.style.left = `${x}%`;
		menubutton.style.top = "calc(100% - 48px)";
		menubutton.style.width = "64px";
		menubutton.style.height = "48px";

		logo.style.left = "19px";
		logo.style.top = "16px";
		logo.style.width = "28px";
		logo.style.height = "28px";
	}
	else if (px > py && 1 - px < py) { //right
		let y = 100 * (event.y - 32) / container.clientHeight;

		menubutton.style.borderRadius = "40px 14px 14px 40px";
		menubutton.style.left = "calc(100% - 48px)";
		menubutton.style.top = `${y}%`;
		menubutton.style.width = "48px";
		menubutton.style.height = "64px";

		logo.style.left = "14px";
		logo.style.top = "18px";
		logo.style.width = "28px";
		logo.style.height = "28px";
	}

	if (event.x < 56 && event.y > container.clientHeight - 48 && container.clientHeight - event.y < 0) {
		attachedmenubutton.style.transform = "none";
		attachedmenubutton.style.boxShadow = "#202020 0 0 0 3px inset";
		menubutton.style.transform = "scaleY(0)";
		logo.style.top = "48px";

		if (MENU.isDetached) {
			MENU.isDetached = false;
			WIN.AlignIcon();
		}
	}
	else {
		attachedmenubutton.style.transform = "scaleY(0)";
		attachedmenubutton.style.boxShadow = "none";
		menubutton.style.transform = "none";

		if (!MENU.isDetached) {
			MENU.isDetached = true;
			WIN.AlignIcon();
		}
	}

	MENU.UpdatePosition();
});

document.body.addEventListener("mouseup", event=> {
	if (MENU.isMoved) {
		MENU.StorePosition();
	}

	MENU.isDragging = false;
	setTimeout(()=> {
		MENU.isMoved = false;
	}, 0);
});

document.body.addEventListener("keyup", event=> {
	if (event.code == "AltLeft") {
		event.preventDefault();

		if (Date.now() - MENU.lastAltPress < 250) {
			MENU.lastAltPress = 0;
			MENU.Toggle();
		}
		else {
			MENU.lastAltPress = Date.now();
		}
	}
	else {
		MENU.lastAltPress = 0;
	}
});

menubutton.onclick = event=> {
	if (MENU.isMoved) return;
	if (event.button == 0) MENU.Toggle();
};

attachedmenubutton.onclick = event=> {
	if (MENU.isMoved) return;
	if (event.button == 0) MENU.Toggle();
};

menubutton.onmousedown = event=> {
	MENU.position = [event.clientX, event.clientY];
	MENU.isDragging = true;
	event.stopPropagation();
};

attachedmenubutton.onmousedown = event=> {
	MENU.position = [event.clientX, event.clientY];
	MENU.isDragging = true;
	event.stopPropagation();
};

menubox.onclick = ()=> searchinput.focus();

searchinput.onchange = searchinput.oninput = event=> {
	if (MENU.lastSearchValue === searchinput.value.trim()) return;
	let current = searchinput.value;
	MENU.lastSearchValue = current.trim();

	setTimeout(()=> {
		if (current !== searchinput.value) return;
		MENU.Update(current);
	}, 100);
};

searchinput.onclick = event=> event.stopPropagation();

searchinput.onkeydown = event=> {
	switch (event.key) {
	case "Escape":
		event.stopPropagation();
		MENU.Clear();
		break;

	case "Enter":
		if (event.ctrlKey) {
			MENU.list[MENU.index].onmousedown({ button: 1 });
			searchinput.focus();
			setTimeout(searchinput.focus(), 10);
		}
		else {
			if (MENU.index > -1)
				MENU.list[MENU.index].onclick(event);
		}
		break;

	case "ArrowUp":
		event.preventDefault();
		if (MENU.list.length > 0) {
			if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "";
			MENU.index--;
			if (MENU.index < 0) MENU.index = MENU.list.length - 1;
			if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "var(--clr-transparent)";
			}
		break;

	case "ArrowDown":
		event.preventDefault();
		if (MENU.list.length > 0) {
			if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "";
			MENU.index++;
			if (MENU.index >= MENU.list.length) MENU.index = 0;
			MENU.list[MENU.index].style.backgroundColor = "var(--clr-transparent)";
		}
		break;
	}

	if (MENU.list.length > 0 && (event.key === "ArrowUp" || event.key === "ArrowDown")) { //scroll into view
		MENU.list[MENU.index].scrollIntoView({ behavior: "smooth", block: "center" });
	}
};

clearmenusearch.onclick = event=> {
	event.stopPropagation();
	MENU.Clear();
};

cap.onclick = ()=> MENU.Close();

btnPersonalize.onclick = ()=> {
	MENU.Close();
	new Personalize();
};

taskbar.onmouseup = event=> {
	if (WIN.array.length === 0) return;

	if (event.button !== 2) return;
	contextmenu.style.display = "block";
	contextmenu.style.left = `${event.x}px`;
	contextmenu.focus();

	contextmenu.textContent = "";

	const grid = WIN.CreateContextMenuItem("Grid", "controls/grid.svg");
	grid.onclick = ()=> WIN.GridWindows();

	const minimizeAll = WIN.CreateContextMenuItem("Minimize all", "controls/minimize.svg");
	minimizeAll.onclick = ()=> {
		for (let i = 0; i < WIN.array.length; i++) {
			if (WIN.array[i].isMinimized) continue;
			WIN.array[i].Minimize(true);
		}
	};

	const closeAll = WIN.CreateContextMenuItem("Close all", "controls/close.svg");
	closeAll.onclick = ()=> {
		let copy = WIN.array.filter(()=> true);
		for (let i = 0; i < copy.length; i++) {
			copy[i].Close();
		}
	};

	if (contextmenu.offsetLeft + contextmenu.offsetWidth > container.offsetWidth) {
		contextmenu.style.left = `${container.offsetWidth - contextmenu.offsetWidth - 8}px`;
	}
};

contextmenu.onclick = ()=> {
	contextmenu.style.display = "none";
};

contextmenu.onblur = ()=> {
	contextmenu.style.display = "none";
};

(function minuteLoop() {
	//check session
	const timeMapping = { 1: 15, 2: 30, 3: 60, 4: 2 * 60, 5: 4 * 60, 6: 8 * 60, 7: 24 * 60, 8: Infinity };
	const index = localStorage.getItem("session_timeout") == null ? 1 : parseInt(localStorage.getItem("session_timeout"));

	/*if ((Date.now() - UI.lastActivity) > 60 * 1000 * timeMapping[index]) {
		fetch("/logout").then(response=> { if (response.status === 200) location.reload(); });
	}*/

	//update clock
	const now = new Date();
	const m = now.getMinutes();
	const h = (now.getHours() % 12) + m / 60;

	analog_clock_m.style.transform = "rotate(" + m * 6 + "deg)";
	analog_clock_h.style.transform = "rotate(" + h * 30 + "deg)";

	regionalFormat = localStorage.getItem("regional_format") ? localStorage.getItem("regional_format") : "sys";

	date_month.textContent = now.toLocaleDateString(regionalFormat, { month: "short" }).toUpperCase();
	date_date.textContent = now.getDate();
	date_day.textContent = now.toLocaleDateString(regionalFormat, { weekday: "long" });

	setTimeout(()=> minuteLoop(), 60000);
})();
