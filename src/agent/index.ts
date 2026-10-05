/**
 * `agent` module — launching an agent's own CLI through a declared adapter (`adr-012`,
 * `spec-016-agent-execution` §1). It owns adapter manifest loading and validation, and later the
 * launcher and the run log. Today it holds the manifest only (task-177): the strict schema (§2.2), the
 * placeholder rules (§2.3), and discovery and loading at a revision (§2.1, §3.2 step 5). Nothing
 * launches yet, and its `CoreModule` (`src/core/index.ts`) registers no operation.
 */
export const MODULE_NAME = 'agent' as const;

export { ADAPTER_MANIFEST_FORMAT, AdapterManifest } from './schema';
export { E_ADAPTER_MANIFEST, parseAdapterManifest } from './manifest';
export type { AdapterKind, AdapterSource } from './manifest';
export { ADAPTER_PLACEHOLDERS, E_ADAPTER_PLACEHOLDER, placeholderIssues } from './placeholders';
export type { AdapterPlaceholder } from './placeholders';
export { ADAPTERS_DIR_PATH, E_ADAPTER_DUPLICATE, listAdaptersAtRev, loadAdapter } from './discovery';
export type { AdapterEntry, LoadedAdapter } from './discovery';
