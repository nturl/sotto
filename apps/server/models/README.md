# apps/server/models/

Run `pnpm --filter @sotto/server models:fetch` to download `silero_vad.onnx`
into this directory. The file itself is gitignored — it is fetched on demand,
not committed.

If the download fails, or `onnxruntime-node`'s native addon fails to load,
`src/voice/vad.ts` falls back to a simple energy (RMS) VAD automatically and
logs which backend is active at startup. `GET /health` also reports
`vad: 'silero' | 'energy'`.

## Attribution

Silero VAD v5 (`silero_vad.onnx`), from
https://github.com/snakers4/silero-vad — Copyright (c) 2020-present Silero
Team, licensed under the MIT License:

```
MIT License

Copyright (c) 2020-present Silero Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
```
