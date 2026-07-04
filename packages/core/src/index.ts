/**
 * @claudedoctor/core
 *
 * Isomorphic (browser + Node) detection / scoring / forensics logic.
 * Pure: it takes a *sanitized* environment snapshot (no raw secrets) and returns
 * a diagnosis, so the CLI and the web app reuse the exact same scorers.
 * See ../../CLAUDE.md and ../../docs/ban-signals.md.
 */

export const VERSION = '0.1.0';

export type {
  Confidence,
  FindingStatus,
  SignalId,
  CredentialKind,
  ApiKeyEnvKind,
  NetworkInfo,
  DoctorInput,
  Fix,
  Finding,
  HealthLevel,
  Diagnosis,
} from './types.js';

export { diagnose } from './diagnose.js';
export { DETECTORS } from './signals.js';
export {
  SOURCES,
  KNOWN_UNSUPPORTED_REGIONS,
  OFFICIAL_API_HOSTS,
  RELAY_HOST_HINTS,
} from './catalog.js';
