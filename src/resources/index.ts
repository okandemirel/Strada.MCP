// Interfaces
export type { IResource, ResourceContent, ResourceMetadata } from './resource.interface.js';

// Registry
export { ResourceRegistry } from './resource-registry.js';

// Strada resources
export { ApiReferenceResource } from './strada/api-reference.js';
export { NamespacesResource } from './strada/namespaces.js';
export { ExamplesResource } from './strada/examples.js';

// Unity resources
export { ManifestResource } from './unity/manifest.js';
export { ProjectSettingsResource } from './unity/project-settings.js';
export { AsmdefListResource } from './unity/asmdef-list.js';
export { FileStatsResource } from './unity/file-stats.js';

// Bridge resources
export { SceneHierarchyResource } from './bridge/scene-hierarchy.js';
export { ConsoleLogsResource } from './bridge/console-logs.js';
export { PlayStateResource } from './bridge/play-state.js';
