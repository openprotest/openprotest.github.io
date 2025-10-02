class SerialRS232 extends Terminal {

	constructor(args) {
		super();

		this.args = Object.assign({
			ansi: true,
			autoScroll: true,
			bell: false,
			smoothCursor: false
		}, args);

		this.SetTitle("Serial RS232");
		this.SetIcon("mono/serialconsole.svg");

		this.Connect();
	}

	Close() { //override
		if (this.port) {
			this.port.close();
			this.port = null;
		}

		super.Close();
	}

	async Connect() {
		let reader;
		let writer;

		this.port = await navigator.serial.requestPort();
		console.log(this.port);

		await this.port.open({
			baudRate: 9600,
			dataBits: 8,
			stopBits: 1,
			parity: "none",
			flowControl: "none"
		});


		// Get reader and writer
		const decoder = new TextDecoderStream();
		this.port.readable.pipeTo(decoder.writable);
		reader = decoder.readable.getReader();

		console.log(decoder);
		
		const encoder = new TextEncoderStream();
		encoder.readable.pipeTo(this.port.writable);
		writer = encoder.writable.getWriter();
		
		console.log(encoder);

		// Example: write to serial
		await writer.write("\n");
		await writer.write("\n");

		// Example: read from serial
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;

			console.log("Received:", value);
		}

	}

}