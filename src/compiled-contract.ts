import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { witnesses } from './private-state';

const srcDirectory = path.dirname(fileURLToPath(import.meta.url));

export const zkConfigPath = path.resolve(
  srcDirectory,
  '..',
  'contracts',
  'managed',
  'veilpledge',
);

const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

export async function loadVeilPledgeContract() {
  if (!fs.existsSync(contractPath)) {
    throw new Error('Contract not compiled. Run `npm run compile` first.');
  }

  const contractModule = await import(pathToFileURL(contractPath).href);
  const compiledContract = CompiledContract.make(
    'veilpledge',
    contractModule.Contract,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );

  return { contractModule, compiledContract };
}
