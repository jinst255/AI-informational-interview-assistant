const TARGET_SAMPLE_RATE = 24000;

export async function requestMicrophone() {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export async function startAudioCapture({ onPcmData, onRecorderChunk }) {
  const stream = await requestMicrophone();
  const preferredType = "audio/webm";
  const options = MediaRecorder.isTypeSupported(preferredType)
    ? { mimeType: preferredType }
    : undefined;
  const mediaRecorder = new MediaRecorder(stream, options);
  const chunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
      if (onRecorderChunk) {
        onRecorderChunk(event.data);
      }
    }
  };

  mediaRecorder.start(1000);

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const gain = audioContext.createGain();
  gain.gain.value = 0;
  let stopProcessor = null;

  if (audioContext.audioWorklet) {
    try {
      stopProcessor = await setupAudioWorklet(audioContext, source, gain, onPcmData);
    } catch (error) {
      stopProcessor = setupScriptProcessor(audioContext, source, gain, onPcmData);
    }
  } else {
    stopProcessor = setupScriptProcessor(audioContext, source, gain, onPcmData);
  }

  await audioContext.resume();

  async function stop() {
    const stopped = new Promise((resolve) => {
      mediaRecorder.addEventListener(
        "stop",
        () => {
          resolve(new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" }));
        },
        { once: true }
      );
    });

    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    stream.getTracks().forEach((track) => track.stop());
    if (stopProcessor) stopProcessor();
    await audioContext.close();
    return stopped;
  }

  return {
    stop,
    getAudioBlob: () => new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" }),
  };
}

async function setupAudioWorklet(audioContext, source, gain, onPcmData) {
  const workletCode = `
    class PcmProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.targetRate = ${TARGET_SAMPLE_RATE};
        this.inputRate = sampleRate;
        this.ratio = this.inputRate / this.targetRate;
        this.accumulator = 0;
      }
      process(inputs) {
        const input = inputs[0] && inputs[0][0];
        if (!input) return true;
        const output = [];
        for (let i = 0; i < input.length; i++) {
          this.accumulator += 1;
          if (this.accumulator >= this.ratio) {
            this.accumulator -= this.ratio;
            output.push(input[i]);
          }
        }
        if (output.length) {
          const pcm = new Int16Array(output.length);
          for (let i = 0; i < output.length; i++) {
            let sample = Math.max(-1, Math.min(1, output[i]));
            pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          }
          this.port.postMessage(pcm, [pcm.buffer]);
        }
        return true;
      }
    }
    registerProcessor('pcm-processor', PcmProcessor);
  `;

  const blob = new Blob([workletCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await audioContext.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const node = new AudioWorkletNode(audioContext, "pcm-processor");
  node.port.onmessage = (event) => {
    if (onPcmData) {
      onPcmData(new Int16Array(event.data));
    }
  };

  source.connect(node).connect(gain).connect(audioContext.destination);

  return () => {
    node.disconnect();
    gain.disconnect();
  };
}

function setupScriptProcessor(audioContext, source, gain, onPcmData) {
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    if (!onPcmData) return;
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleBuffer(input, audioContext.sampleRate, TARGET_SAMPLE_RATE);
    const pcm16 = floatToPcm16(downsampled);
    onPcmData(pcm16);
  };

  source.connect(processor).connect(gain).connect(audioContext.destination);

  return () => {
    processor.disconnect();
    gain.disconnect();
  };
}

function downsampleBuffer(buffer, inputRate, targetRate) {
  if (targetRate === inputRate) return buffer;
  const ratio = inputRate / targetRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offset = 0;
  for (let i = 0; i < newLength; i++) {
    const nextOffset = Math.round((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = offset; j < nextOffset && j < buffer.length; j++) {
      sum += buffer[j];
      count++;
    }
    result[i] = count ? sum / count : 0;
    offset = nextOffset;
  }
  return result;
}

function floatToPcm16(buffer) {
  const pcm = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

export function encodePcm16ToBase64(pcm16) {
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
