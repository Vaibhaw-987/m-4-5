import { Buffer } from 'buffer';

type BrowserGlobals = {
  Buffer?: typeof Buffer;
  process?: { env: { NODE_ENV: string } };
};

const browserGlobals = globalThis as unknown as BrowserGlobals;

browserGlobals.Buffer ??= Buffer;
browserGlobals.process ??= {
  env: {
    NODE_ENV: import.meta.env.MODE,
  },
};
