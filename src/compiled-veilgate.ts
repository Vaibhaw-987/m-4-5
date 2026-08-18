import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CompiledContract } from '@midnight-ntwrk/compact-js';

import { veilGateWitnesses } from './veilgate-private-state';

const srcDirectory = path.dirname(fileURLToPath(import.meta.url));

export const veilGateZkConfigPath = path.resolve(
  srcDirectory,
  '..',
  'contracts',
  'managed',
  'veilgate',
);

const contractPath = path.join(veilGateZkConfigPath, 'contract', 'index.js');

export async function loadVeilGateContract() {
  if (!fs.existsSync(contractPath)) {
    throw new Error('VeilGate not compiled. Run `npm run compile` first.');
  }

  const contractModule = await import(pathToFileURL(contractPath).href);
  const compiledContract = CompiledContract.make(
    'veilgate',
    contractModule.Contract,
  ).pipe(
    CompiledContract.withWitnesses(veilGateWitnesses as never),
    CompiledContract.withCompiledFileAssets(veilGateZkConfigPath),
  );

  return { contractModule, compiledContract };
}
