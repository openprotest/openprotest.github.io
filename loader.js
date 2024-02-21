const LOADER = {
	baseStyles: [
		"window.css",
		"ui.css",
		"tip.css",
		"button.css",
		"textbox.css",
		"checkbox.css",
		"radio.css",
		"range.css"
	],

	baseScripts: [
		"ui.js",
		"window.js"
	],

	primaryScripts: [
		"tabs.js",
		"console.js",
		"ipbox.js",
		"wasm_exec.js"
	],
	
	secondaryScripts: [
		"about.js",
		"personalize.js",
		"locateip.js",
		"maclookup.js",
		"passwordgen.js",
		"encoder.js",
		"netcalc.js",
		"keyboardtester.js",
		"mictester.js",
		"cameratester.js",
		"screencapture.js",
		"chess/chess.js"
	],

	Initialize: ()=> {
		let count = 0;
		const total = LOADER.baseStyles.length + LOADER.baseScripts.length + LOADER.primaryScripts.length + LOADER.secondaryScripts.length;

		const callbackHandle = (status, filename)=> {
			loadingbar.style.width = 100 * ++count / total + "%";

			if (LOADER.baseStyles.length + LOADER.baseScripts.length === count) { //load primary
				for (let i = 0; i < LOADER.primaryScripts.length; i++)
					LOADER.LoadScript(LOADER.primaryScripts[i], callbackHandle);
			}
			else if (LOADER.baseStyles.length + LOADER.baseScripts.length + LOADER.primaryScripts.length === count) { //load secondary
				UI.Initialize();
				for (let i = 0; i < LOADER.secondaryScripts.length; i++)
					LOADER.LoadScript(LOADER.secondaryScripts[i], callbackHandle);
			}
			else if (count === total) { //all done
			
				setTimeout(()=> {
					loadingcontainer.style.filter = "opacity(0)";
					setTimeout(()=> container.removeChild(loadingcontainer), 200);
					setTimeout(()=> LOADER.RestoreSession(), 250); //restore previous session
				}, 200);
			}
		};

		for (let i = 0; i < LOADER.baseStyles.length; i++)
			LOADER.LoadStyle(LOADER.baseStyles[i], callbackHandle);

		for (let i = 0; i < LOADER.baseScripts.length; i++)
			LOADER.LoadScript(LOADER.baseScripts[i], callbackHandle);
	},

	LoadStyle: (filename, callback)=> {
		if (document.head.querySelectorAll(`link[href$='${filename}']`).length > 0) {
			callback("exists", filename);
			return;
		}

		const cssLink = document.createElement("link");
		cssLink.rel = "stylesheet";
		cssLink.href = filename;
		document.head.appendChild(cssLink);

		cssLink.onload = ()=> callback("ok", filename);
		cssLink.onerror = ()=> callback("error", filename);
	},

	LoadScript: (filename, callback)=> {
		if (document.head.querySelectorAll(`script[src$='${filename}']`).length > 0) {
			callback("exists", filename);
			return;
		}

		const script = document.createElement("script");
		script.setAttribute("defer", true);
		script.src = filename;
		document.body.appendChild(script);

		script.onload = ()=> callback("ok", filename);
		script.onerror = ()=> callback("error", filename);
	},

	StoreSession: ()=> {
		let session = [];

		if (localStorage.getItem("restore_session") === "true")
			for (let i = 0; i < WIN.array.length; i++)
				session.push({
					class: WIN.array[i].constructor.name,
					params: WIN.array[i].params,
					isMaximized: WIN.array[i].isMaximized,
					isMinimized: WIN.array[i].isMinimized,
					position: WIN.array[i].position,
					left: WIN.array[i].win.style.left,
					top: WIN.array[i].win.style.top,
					width: WIN.array[i].win.style.width,
					height: WIN.array[i].win.style.height
				});

		localStorage.setItem("session", JSON.stringify(session));

		return session;
	},

	RestoreSession: ()=> {
		fragment = window.location.href.substring(window.location.href.indexOf("#") + 1, window.location.href.length);
		if (fragment === "passgen") {
			new PassGen();
			return;
		}

		let session = localStorage.getItem("session") ? JSON.parse(localStorage.getItem("session")) : {};

		if (localStorage.getItem("restore_session") != "true") return;
		if (session == null || session.length == 0) return;

		for (let i = 0; i < session.length; i++) {
			let win = LOADER.Invoke(session[i]);

			if (win) {
				if (session[i].isMaximized) win.Toggle();
				if (session[i].isMinimized) win.Minimize();
				win.position = session[i].position;
	
				if (!WIN.always_maxed) {
					win.win.style.left = session[i].left;
					win.win.style.top = session[i].top;
					win.win.style.width = session[i].width;
					win.win.style.height = session[i].height;
				}
			}
		}
	},

	Invoke: (command)=> {
		switch (command.class) {
		case "LocateIp"      : return new LocateIp(command.params);
		case "MacLookup"      : return new MacLookup(command.params);
		case "PassGen"        : return new PassGen(command.params);
		case "Encoder"        : return new Encoder(command.params);
		case "NetCalc"        : return new NetCalc(command.params);
		case "KeyboardTester" : return new KeyboardTester(command.params);
		case "MicTester"      : return new MicTester(command.params);
		case "CameraTester"   : return new CameraTester(command.params);
		case "ScreenCapture"  : return new ScreenCapture(command.params);
		case "Chess"          : return new Chess();
		case "About"          : return new About(command.params);
		case "Personalize"    : return new Personalize(command.params);
		}
	},

	HttpErrorHandler: statusCode=> {
		switch (statusCode) {
		case 401: throw new Error("Unauthorized user or authorization expired");
		case 403: throw new Error("Insufficient permissions");
		default: throw new Error(`Server responded with: ${statusCode}`);
		}
	}
};

LOADER.Initialize();