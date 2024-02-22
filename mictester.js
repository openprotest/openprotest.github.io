class MicTester extends Window {
	constructor(params) {
		super();

		this.params = params ?? {
			echoCancellation: true,
			noiseSuppression: false,
			sampleSize: 16,
			sampleRate: 48_000,
			graphResolution: 512
		};

		this.SetTitle("Microphone tester");
		this.SetIcon("mono/mic.svg");

		this.recorder = null;
		this.recordChunks = [];

		this.content.style.padding = "20px";

		this.SetupToolbar();
		this.recordButton = this.AddToolbarButton("Record", "mono/record-light.svg");
		this.startButton = this.AddToolbarButton("Start", "mono/play-light.svg");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop-light.svg");
		this.AddToolbarSeparator();
		this.settingsButton = this.AddToolbarButton("Settings", "mono/wrench-light.svg");

		this.canvas = document.createElement("canvas");
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		this.content.appendChild(this.canvas);

		this.infoBox = document.createElement("div");
		this.infoBox.style.position = "absolute";
		this.infoBox.style.right = "8px";
		this.infoBox.style.bottom = "8px";
		this.infoBox.style.zIndex = "1";
		this.infoBox.style.color = "var(--clr-light)";
		this.infoBox.style.textShadow = "black 0 0 2px";
		this.content.appendChild(this.infoBox);

		this.stopButton.disabled = true;

		this.stream = null;
		this.audioContext = null;
		this.analyser = null;

		this.recordButton.onclick = () => this.Record();

		this.startButton.onclick = () =>  this.Start(
			this.params.echoCancellation,
			this.params.noiseSuppression,
			this.params.sampleSize,
			this.params.sampleRate
		);

		this.stopButton.onclick = () => this.Stop();

		this.settingsButton.onclick = () => this.Settings();
	}

	AfterResize() { //override
		this.canvas.width = this.content.clientWidth;
		this.canvas.height = this.content.clientHeight;
	}

	async Settings() {
		const dialog = this.DialogBox("300px");
		if (dialog === null) return;

		const btnOK = dialog.btnOK;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "480px";

		const chkEchoCancellation = document.createElement("input");
		chkEchoCancellation.type = "checkbox";
		innerBox.appendChild(chkEchoCancellation);
		this.AddCheckBoxLabel(innerBox, chkEchoCancellation, "Echo cancellation").style.paddingBottom = "16px";

		innerBox.appendChild(document.createElement("br"));

		const chkNoiseSuppression = document.createElement("input");
		chkNoiseSuppression.type = "checkbox";
		innerBox.appendChild(chkNoiseSuppression);
		this.AddCheckBoxLabel(innerBox, chkNoiseSuppression, "Noise suppression").style.paddingBottom = "16px";

		innerBox.appendChild(document.createElement("br"));

		const sampleSizeLabel = document.createElement("div");
		sampleSizeLabel.textContent = "Bit depth:";
		sampleSizeLabel.style.display = "inline-block";
		sampleSizeLabel.style.minWidth = "140px";
		sampleSizeLabel.style.paddingBottom = "16px";
		innerBox.appendChild(sampleSizeLabel);

		const sampleSizeInput = document.createElement("select");
		sampleSizeInput.style.width = "100px";
		innerBox.appendChild(sampleSizeInput);
		const size16 = document.createElement("option");
		size16.value = 16;
		size16.text = "16-bit";
		const size24 = document.createElement("option");
		size24.value = 24;
		size24.text = "24-bit";
		const size32 = document.createElement("option");
		size32.value = 32;
		size32.text = "32-bit";
		sampleSizeInput.append(size16, size24, size32);

		innerBox.appendChild(document.createElement("br"));

		const sampleRateLabel = document.createElement("div");
		sampleRateLabel.textContent = "Sample rate:";
		sampleRateLabel.style.display = "inline-block";
		sampleRateLabel.style.minWidth = "140px";
		sampleRateLabel.style.paddingBottom = "16px";
		innerBox.appendChild(sampleRateLabel);

		const sampleRateInput = document.createElement("select");
		sampleRateInput.style.width = "100px";
		innerBox.appendChild(sampleRateInput);
		const rate44 = document.createElement("option");
		rate44.value = 44_100;
		rate44.text = "44.1KHz";
		const rate48 = document.createElement("option");
		rate48.value = 48_000;
		rate48.text = "48KHz";
		const rate96 = document.createElement("option");
		rate96.value = 96000;
		rate96.text = "96KHz";
		sampleRateInput.append(rate44, rate48, rate96);

		innerBox.appendChild(document.createElement("br"));

		const graphResolutionLabel = document.createElement("div");
		graphResolutionLabel.textContent = "Graph resolution:";
		graphResolutionLabel.style.display = "inline-block";
		graphResolutionLabel.style.minWidth = "140px";
		graphResolutionLabel.style.paddingBottom = "16px";
		innerBox.appendChild(graphResolutionLabel);

		const graphResolutionInput = document.createElement("select");
		graphResolutionInput.style.width = "100px";
		innerBox.appendChild(graphResolutionInput);
		const resVeryLow = document.createElement("option");
		resVeryLow.value = 64;
		resVeryLow.text = "Very low";
		const resLow = document.createElement("option");
		resLow.value = 128;
		resLow.text = "Low";
		const resMed = document.createElement("option");
		resMed.value = 256;
		resMed.text = "Medium";
		const resHigh = document.createElement("option");
		resHigh.value = 512;
		resHigh.text = "High";
		const resVeryHigh = document.createElement("option");
		resVeryHigh.value = 1024;
		resVeryHigh.text = "Very high";
		const resUltra = document.createElement("option");
		resUltra.value = 2048;
		resUltra.text = "Ultra";
		graphResolutionInput.append(resVeryLow, resLow, resMed, resHigh, resVeryHigh, resUltra);

		chkEchoCancellation.checked = this.params.echoCancellation;
		chkNoiseSuppression.checked = this.params.noiseSuppression;
		sampleSizeInput.value = this.params.sampleSize;
		sampleRateInput.value = this.params.sampleRate;
		graphResolutionInput.value = this.params.graphResolution;

		btnOK.onclick = async ()=> {
			this.params.graphResolution = parseInt(graphResolutionInput.value);
			this.params.echoCancellation = chkEchoCancellation.checked;
			this.params.noiseSuppression = chkNoiseSuppression.checked;
			this.params.sampleSize = parseInt(sampleSizeInput.value);
			this.params.sampleRate = parseInt(sampleRateInput.value);

			dialog.Close();
		};
	}

	async Start(echoCancellation, noiseSuppression, sampleSize, sampleRate, withRecording=false) {
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: echoCancellation,
					noiseSuppression: noiseSuppression,
					sampleSize: sampleSize,
					sampleRate: sampleRate
				},
				video: false
			});
			
			const audioTrack = this.stream.getAudioTracks()[0];
			const audioSettings = audioTrack.getSettings();
			audioTrack.onended = () => this.Stop();

			this.StartVisualizer();
	
			if (audioSettings.sampleRate && audioSettings.sampleSize) {
				this.infoBox.textContent = `${audioSettings.sampleRate}Hz @ ${audioSettings.sampleSize}-bits`;
			}

			if (withRecording) {
				this.recorder = new MediaRecorder(this.stream);
				this.recordChunks = [];

				this.recorder.ondataavailable = event=> this.recordChunks.push(event.data);
				this.recorder.onstop = ()=> this.HandleRecording();
				this.recorder.start();
			}

			this.startButton.disabled = true;
			this.stopButton.disabled = false;
			this.settingsButton.disabled = true;
		}
		catch (ex) {
			setTimeout(() => this.ConfirmBox(ex, true, "mono/error.svg"), 400);
		}
	}

	Stop() {
		if (this.recorder) {
			this.recorder.stop();
		}

		if (this.stream) {
			const tracks = this.stream.getTracks();
			tracks.forEach(track => track.stop());
			this.stream = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		this.infoBox.textContent = "";
		this.recordButton.disabled = false;
		this.startButton.disabled = false;
		this.stopButton.disabled = true;
		this.settingsButton.disabled = false;
	}

	Record() {
		this.Stop();
		this.recordButton.disabled = true;
		this.Start(
			this.params.echoCancellation,
			this.params.noiseSuppression,
			this.params.sampleSize,
			this.params.sampleRate,
			true
		);
	}

	HandleRecording() {
		const dialog = this.DialogBox("120px");
		if (dialog === null) return;
		
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		btnOK.value = "Export";
		btnCancel.value = "Discard";

		innerBox.style.padding = "20px 20px 0 20px";
		innerBox.parentElement.style.maxWidth = "480px";

		const typeLabel = document.createElement("div");
		typeLabel.textContent = "Type:";
		typeLabel.style.display = "inline-block";
		typeLabel.style.minWidth = "80px";
		typeLabel.style.paddingBottom = "16px";
		innerBox.appendChild(typeLabel);

		const typeInput = document.createElement("select");
		typeInput.style.width = "280px";
		innerBox.appendChild(typeInput);

		const wav = document.createElement("option");
		wav.text = "WAV - Waveform audio format";
		wav.value = "audio/wav";
		
		const mp3 = document.createElement("option");
		mp3.text = "MP3 - MPEG audio layer III";
		mp3.value = "audio/mpeg";

		const ogg = document.createElement("option");
		ogg.text = "OGG container format";
		ogg.value = "audio/ogg";

		const webm = document.createElement("option");
		webm.text = "WebM audio";
		webm.value = "audio/aac";

		const acc = document.createElement("option");
		acc.text = "AAC - Advanced Audio Codec";
		acc.value = "audio/wav";

		const flac = document.createElement("option");
		flac.text = "FLAC - Free Lossless Audio Codec";
		flac.value = "audio/flac";

		typeInput.append(wav, mp3, ogg, webm, acc, flac);

		btnOK.onclick = async ()=> {
			const blob = new Blob(this.recordChunks, { type: typeInput.value });
			const audioURL = URL.createObjectURL(blob);
			window.open(audioURL, "_blank");
	
			this.recordChunks = [];
			this.recorder = null;
			dialog.Close();
		};
		
		btnCancel.onclick = ()=> {
			this.recordChunks = [];
			this.recorder = null;
			dialog.Close();
		};
	}

	StartVisualizer() {
		if (this.stream) {
			this.audioContext = new window.AudioContext();
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = this.params.graphResolution ?? 512;
			const bufferLength = this.analyser.frequencyBinCount;
			const dataArray = new Uint8Array(bufferLength);

			const source = this.audioContext.createMediaStreamSource(this.stream);
			source.connect(this.analyser);

			this.canvas.width = this.content.clientWidth;
			this.canvas.height = this.content.clientHeight;

			const ctx = this.canvas.getContext("2d");
			//ctx.imageSmoothingQuality = false;
			
			let maxHeight = [];
			let maxAcc = [];
			for (let i = 0; i < this.analyser.frequencyBinCount; i++) {
				maxHeight.push(0);
				maxAcc.push(0);
			}

			const drawVisualizer = ()=> {
				if (!this.stream) {
					ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
					return;
				}

				this.analyser.getByteFrequencyData(dataArray);
				ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

				ctx.fillStyle = "#c0c0c0";
				ctx.font = "14px Consolas";
				ctx.textAlign = "right";
				ctx.textBaseline = 'middle';

				const step = this.canvas.height > 800 ? 32 : this.canvas.height > 400 ? 64 : 128;
				for (let i=step; i<256; i+=step) {
					let y = i * this.canvas.height / 512;
					const dB = 20 * Math.log10((i / 255));
					ctx.fillText(`${dB.toFixed(1)}dB`, 56, this.canvas.height / 2 - y);
					ctx.fillRect(64, this.canvas.height / 2 - y, this.canvas.width, 1);

					ctx.fillText(`${dB.toFixed(1)}dB`, 56, this.canvas.height / 2 + y);
					ctx.fillRect(64, this.canvas.height / 2 + y, this.canvas.width, 1);
				}

				const centerX = this.canvas.width / 2;
				const centerY = this.canvas.height / 2;
				const barWidth = Math.max(this.canvas.width / bufferLength, 4);
				let barHeight;
				let x = 0;
				let peakFrequency = 0;
				let peakIndex = -1;

				ctx.textAlign = "center";
				ctx.textBaseline = "middle";

				for (let i=0; i < bufferLength; i++) {
					if (peakFrequency < dataArray[i]) {
						peakFrequency = dataArray[i];
						peakIndex = i;
					}

					ctx.fillStyle = "#c0c0c0";

					//draw bars
					barHeight = dataArray[i] * this.canvas.height / 255;
					ctx.fillRect(centerX + x, (this.canvas.height - barHeight) / 2, barWidth, barHeight);
					ctx.fillRect(centerX - x, (this.canvas.height - barHeight) / 2, barWidth, barHeight);
					
					//draw labels
					if (i > 0 && i % (this.canvas.width > 800 ? 32 : 64) === 0) {
						const frequency = i * this.audioContext.sampleRate / bufferLength / 2000;
						ctx.fillText(`${frequency}KHz`, centerX + x, 10);
						ctx.fillText(`${frequency}KHz`, centerX - x, 10);
						ctx.fillRect(centerX + x, 20, 3, 3);
						ctx.fillRect(centerX - x, 20, 3, 3);
					}

					//calculate recent max
					if (maxHeight[i] < dataArray[i]) {
						maxHeight[i] = dataArray[i];
						maxAcc[i] = 0;
					}
					else {
						maxAcc[i] += .15;
						maxHeight[i] = Math.max(maxHeight[i] - maxAcc[i], 0);
					}

					//draw recent max
					ctx.fillStyle = `hsl(${12 + dataArray[i]/2},100%,40%)`;
					barHeight = maxHeight[i] * this.canvas.height / 255;
					
					ctx.fillRect(centerX + x, centerY - (barHeight + barWidth) / 2, barWidth, barWidth);
					ctx.fillRect(centerX - x, centerY - (barHeight + barWidth) / 2, barWidth, barWidth);
					ctx.fillRect(centerX + x, centerY + (barHeight - barWidth) / 2, barWidth, barWidth);
					ctx.fillRect(centerX - x, centerY + (barHeight - barWidth) / 2, barWidth, barWidth);

					x += barWidth - 1;

					if (x > centerX) {
						break;
					}
				}

				if (peakIndex > -1 && this.params.graphResolution > 64) { //draw peak
					ctx.fillStyle = "#c0c0c0";
					ctx.textBaseline = "bottom";
					const frequency = Math.round(peakIndex * this.audioContext.sampleRate / bufferLength / 2);
					const frequencyString = frequency < 1000 ? `${frequency}Hz` : `${frequency/1000}KHz`;
					const x = (centerX + (barWidth-1) * peakIndex + barWidth / 2);
					const y = this.canvas.height * 46 / 48;

					if (frequency > 2) {
						ctx.fillRect(x-2, this.canvas.height - 52, 5, 5);
						ctx.fillRect(x, this.canvas.height - 48, 1, 10);
						ctx.fillText(`${frequencyString}`, x, this.canvas.height-20);
						if (frequency >= 220 && this.params.graphResolution > 128) {
							let note = this.CalculateNote(frequency);
							ctx.fillText(`${note.note} ${note.cents}`, x, this.canvas.height);
						}
					}
				}

				requestAnimationFrame(drawVisualizer);
			};

			drawVisualizer();
		}
	}

	CalculateNote(frequency) {
		const referenceFrequency = 440; //A4
		const referenceNote = 69; //MIDI note number for A4
	
		let cents = Math.round(1200 * Math.log2(frequency / referenceFrequency)) % 1200;
		let note = 12 * Math.log2(frequency / referenceFrequency) + referenceNote;

		if (cents > 600) {
			note += 1;
			cents -= 1200;
		}
		else if (cents < -600){
			note -= 1;
			cents += 1200;
		}

		const roundedNote = Math.round(note);

		const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
		const noteIndex = (roundedNote % 12 + 12) % 12;
		const octave = Math.floor(roundedNote / 12) - 1; //MIDI octave starts from -1
	
		const closestNote = `${noteNames[noteIndex]}${octave}`;

		return { note: closestNote, cents: cents > 0 ? `+${cents}` : `${cents}`};
	}

	Close() { //override
		this.Stop();
		if (!this.recorder) {
			super.Close();
		}
	}
}