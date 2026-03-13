// Interfaces
export type { IPrompt, PromptArgument, PromptMessage } from './prompt.interface.js';

// Registry
export { PromptRegistry } from './prompt-registry.js';

// Strada prompts
export { CreateEcsFeaturePrompt } from './strada/create-ecs-feature.js';
export { CreateMvcsFeaturePrompt } from './strada/create-mvcs-feature.js';
export { AnalyzeArchitecturePrompt } from './strada/analyze-architecture.js';

// Unity prompts
export { DebugPerformancePrompt } from './unity/debug-performance.js';
export { OptimizeBuildPrompt } from './unity/optimize-build.js';
export { SetupScenePrompt } from './unity/setup-scene.js';
