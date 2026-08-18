# Reproducible command evidence

The text files in this directory are terminal transcripts captured directly
from these successful commands on 2026-07-10. Recorder control sequences are
normalized to their final visible terminal lines:

```bash
npm run compile
npm test
npm run test:e2e -- --network preview
```

`docs/screenshots/*.png` are deterministic raster renderings of these exact
transcripts. They contain no manually added command-output lines and exclude
the gitignored wallet seed and encrypted private state.
