import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.browser,
        },
    },
    {
        files: ['test/unit/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.node, ...globals.jest },
        },
    },
    {
        // DOM tests run under jest-environment-jsdom (see the @jest-environment
        // docblock in each file), so they get browser globals (document, window,
        // ...) on top of node/jest — unlike test/unit, which is plain Node and
        // has no DOM available.
        files: ['test/dom/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.node, ...globals.jest, ...globals.browser },
        },
    },
    {
        // package.json declares "type": "commonjs", so this file (plain .js) is
        // Node-loaded CommonJS, unlike everything else here.
        files: ['babel.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },
    {
        // This config file itself: Node-loaded (like babel.config.js above), but
        // .mjs makes it real ESM regardless of package.json's "type", so it uses
        // import/export rather than require()/module.exports.
        files: ['eslint.config.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node,
        },
    },
];
