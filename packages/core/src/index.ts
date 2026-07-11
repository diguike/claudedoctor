/**
 * @claudedoctor/core
 *
 * Isomorphic (browser + Node) evidence classification / forensics logic.
 * Pure: it takes a *sanitized* environment snapshot (no raw secrets) and returns
 * a diagnosis, so the CLI and the web app reuse the same policy data and rules.
 * See ../../CLAUDE.md and ../../docs/ban-signals.md.
 */

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
  SUPPORTED_REGION_CODES,
  OFFICIAL_API_HOSTS,
  RELAY_HOST_HINTS,
  regionSupport,
} from './catalog.js';
