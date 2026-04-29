'use strict';

// Stub for the Aleo dependency tree (@provablehq/* and @hyperlane-xyz/aleo-sdk).
// Those packages are GPL-3.0; GasStorm bridges EVM-only and never invokes Aleo.
// They are routed here via pnpm.overrides in bridge-ui/package.json so the
// GPL-3.0 packages never reach the lockfile.
//
// The module exports a frozen empty object. Any named import (e.g. import
// { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react') resolves
// to undefined; if such a symbol is ever invoked at runtime, the resulting
// "undefined is not a function" surfaces the regression clearly rather than
// silently re-introducing GPL-3.0 code.

const stub = Object.freeze({ __esModule: true, default: undefined });

module.exports = stub;
