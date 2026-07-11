/**
 * @claudedoctor/cli — programmatic entry. The executable lives in bin/, which
 * loads dist/cli.js; this file re-exports the pieces for reuse/testing.
 * All evidence classification stays in @claudedoctor/core; this package only does I/O.
 */
export { main } from './cli.js';
export { collect } from './collect.js';
export { probeNetwork } from './probe.js';
export { verifyDateLine } from './verify.js';
export { applyToProfile, revertProfile, detectProfile, blockLines } from './apply.js';
