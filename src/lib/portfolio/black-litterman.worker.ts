import engineUrl from './black-litterman.wasm?url';
// Int note, lowkey uhhh this should fix the problem

type Engine = {
  memory: WebAssembly.Memory;
  alloc: (length: number) => number;
  dealloc: (pointer: number, length: number) => void;
  calculate: (pointer: number, length: number) => bigint;
};

self.onmessage = async event => {
  try {
    const response = await fetch(engineUrl);
    if (!response.ok) throw new Error('The Rust calculation engine could not be loaded.');
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
    const engine = instance.exports as Engine;
    const request = new TextEncoder().encode(JSON.stringify(event.data));
    const pointer = engine.alloc(request.length);
    let packed: bigint;
    try {
      new Uint8Array(engine.memory.buffer, pointer, request.length).set(request);
      packed = engine.calculate(pointer, request.length);
    } finally { engine.dealloc(pointer, request.length); }
    const resultPointer = Number(packed & 0xffffffffn);
    const resultLength = Number(packed >> 32n);
    let text: string;
    try { text = new TextDecoder().decode(new Uint8Array(engine.memory.buffer, resultPointer, resultLength)); }
    finally { engine.dealloc(resultPointer, resultLength); }
    self.postMessage(JSON.parse(text));
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'The calculation could not be completed.' });
  }
};
