#!/usr/bin/env node
/*
 * Creates local.settings.json file for the Azure Functions.
 * Uses .env file for loading environment variables.
 * Usage: update-local-settings.mjs
 */

import path from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env file is located in the root of the repository
const envPath = path.join(__dirname, '../../../.env');

try {
    if (existsSync(envPath)) {
        dotenv.config({ path: envPath, quiet: true });
    } else {
        // This is normal during cloud build
        console.log('No .env file found at root (skipping env load for local settings)');
    }
} catch (e) {
    console.warn('Error loading .env file:', e.message);
}

const settings = {
  FUNCTIONS_WORKER_RUNTIME: 'custom',
};
const settingsFilePath = path.join(__dirname, '../local.settings.json');

try {
    writeFileSync(
      settingsFilePath,
      JSON.stringify(
        {
          IsEncrypted: false,
          Values: settings,
        },
        null,
        2,
      ),
    );
    console.log('local.settings.json file updated successfully.');
} catch (err) {
    // In some CI/CD or restricted environments, writing might fail or not be necessary
    console.warn('Notice: Could not write local.settings.json. This is non-fatal for cloud deployment.', err.message);
}
