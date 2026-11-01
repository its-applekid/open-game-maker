#!/usr/bin/env node

import { runBlobGcCli } from '../dist/cli.js';

process.exitCode = await runBlobGcCli(process.argv.slice(2));
