#!/usr/bin/env node
// Lance les tests de la couche d'API des extensions dans le vrai navigateur.
//   node scripts/test-ext.js           extension d'essai, sans réseau (tests/ext-api.js)
//   node scripts/test-ext.js reelles   vraies extensions du Chrome Web Store (tests/ext-reelles.js)
const path = require('path');
const { supervise, root } = require('./dev');

const scenario = process.argv[2] === 'reelles' ? 'ext-reelles.js' : 'ext-api.js';
supervise(['--selftest'], { ...process.env, ORBE_SCENARIO: path.join(root, 'tests', scenario) });
