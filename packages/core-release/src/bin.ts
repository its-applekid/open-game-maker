#!/usr/bin/env node
import { main } from './cli.js';

// The executable reads the process environment once and hands it to main; no other module reads it.
// eslint-disable-next-line no-restricted-properties
const code = await main(process.argv.slice(2), { env: process.env });
process.exitCode = code;
