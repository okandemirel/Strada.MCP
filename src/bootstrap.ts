import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import type { ResourceRegistry } from './resources/resource-registry.js';
import type { PromptRegistry } from './prompts/prompt-registry.js';
import type { ITool, ToolContext } from './tools/tool.interface.js';
import type { IResource } from './resources/resource.interface.js';
import type { IPrompt } from './prompts/prompt.interface.js';
import type { StradaMcpConfig } from './config/config.js';
import { parseAllowedPaths } from './security/path-guard.js';

// --- Tool imports (barrel exports) ---
import {
  FileReadTool, FileWriteTool, FileEditTool,
  FileDeleteTool, FileRenameTool, ListDirectoryTool,
} from './tools/file/index.js';
import {
  GitStatusTool, GitDiffTool, GitLogTool,
  GitCommitTool, GitBranchTool, GitStashTool,
} from './tools/git/index.js';
import {
  GlobSearchTool, GrepSearchTool, CodeSearchTool,
} from './tools/search/index.js';
import {
  DotnetBuildTool, DotnetTestTool,
} from './tools/dotnet/index.js';
import {
  ComponentCreateTool, SystemCreateTool, ModuleCreateTool,
  MediatorCreateTool, ServiceCreateTool, ControllerCreateTool,
  ModelCreateTool, ProjectAnalyzeTool, ArchitectureValidateTool,
  FeatureScaffoldTool,
} from './tools/strada/index.js';
import {
  CreateGameObjectTool, FindGameObjectsTool, ModifyGameObjectTool,
  DeleteGameObjectTool, DuplicateGameObjectTool,
  AddComponentTool, RemoveComponentTool, GetComponentsTool,
  SetTransformTool, GetTransformTool, SetParentTool,
  PlayModeTool, GetPlayStateTool, ExecuteMenuTool,
  ConsoleLogTool, ConsoleClearTool, ConsoleReadTool, ConsoleAnalyzeTool,
  SelectionGetTool, SelectionSetTool, BuildPipelineTool, PackageManageTool, EditorPreferencesTool,
} from './tools/unity/index.js';
import {
  SceneCreateTool, SceneOpenTool, SceneSaveTool, SceneInfoTool,
  SceneAnalyzeTool, PrefabCreateTool, PrefabInstantiateTool, PrefabAnalyzeTool,
} from './tools/unity-scene/index.js';
import {
  AssetFindTool, AssetDependenciesTool, AssetUnusedTool,
  MaterialGetTool, MaterialSetTool, ShaderListTool,
  ScriptableObjectCreateTool, TextureInfoTool,
} from './tools/unity-asset/index.js';
import {
  AnimationPlayTool, AnimationListTool, PhysicsRaycastTool,
  NavMeshBakeTool, ParticlesControlTool, LightingBakeTool,
} from './tools/unity-subsystem/index.js';
import {
  PlayerSettingsTool, QualitySettingsTool, BuildSettingsTool,
  ProjectSettingsTool as ProjectSettingsToolConfig,
} from './tools/unity-config/index.js';
import {
  BatchExecuteTool, ScriptExecuteTool, ScriptValidateTool,
  CSharpReflectionTool, UnityProfilerTool,
} from './tools/advanced/index.js';

// --- Resource imports ---
import {
  ApiReferenceResource, NamespacesResource, ExamplesResource,
  ManifestResource, ProjectSettingsResource, AsmdefListResource,
  FileStatsResource, SceneHierarchyResource, ConsoleLogsResource,
  PlayStateResource,
} from './resources/index.js';

// --- Prompt imports ---
import {
  CreateEcsFeaturePrompt, CreateMvcsFeaturePrompt, AnalyzeArchitecturePrompt,
  DebugPerformancePrompt, OptimizeBuildPrompt, SetupScenePrompt,
} from './prompts/index.js';

// --- Bridge-aware type guard ---
interface BridgeAware {
  setBridgeClient(client: unknown): void;
}

function hasBridgeClient(obj: unknown): obj is BridgeAware {
  return typeof obj === 'object' && obj !== null && 'setBridgeClient' in obj;
}

export interface BootstrapOptions {
  config: StradaMcpConfig;
  server: McpServer;
  toolRegistry: ToolRegistry;
  resourceRegistry: ResourceRegistry;
  promptRegistry: PromptRegistry;
}

export interface BootstrapResult {
  tools: ITool[];
  resources: IResource[];
  prompts: IPrompt[];
  bridgeAwareTools: BridgeAware[];
  bridgeAwareResources: BridgeAware[];
  toolContext: ToolContext;
}

export function bootstrap(options: BootstrapOptions): BootstrapResult {
  const { config, server, toolRegistry, resourceRegistry, promptRegistry } = options;

  const projectPath = config.unityProjectPath ?? process.cwd();

  // Shared ToolContext captured by closures; unityBridgeConnected is mutable
  const toolContext: ToolContext = {
    projectPath,
    workingDirectory: projectPath,
    readOnly: config.readOnly,
    unityBridgeConnected: false,
    allowedPaths: parseAllowedPaths(config.allowedPaths),
  };

  // -------------------------------------------------------------------------
  // 1. Instantiate and register all tools
  // -------------------------------------------------------------------------
  const tools: ITool[] = [
    // File tools (6)
    new FileReadTool(),
    new FileWriteTool(),
    new FileEditTool(),
    new FileDeleteTool(),
    new FileRenameTool(),
    new ListDirectoryTool(),

    // Git tools (6)
    new GitStatusTool(),
    new GitDiffTool(),
    new GitLogTool(),
    new GitCommitTool(),
    new GitBranchTool(),
    new GitStashTool(),

    // Search tools (3)
    new GlobSearchTool(),
    new GrepSearchTool(),
    new CodeSearchTool(),

    // Dotnet tools (2)
    new DotnetBuildTool(),
    new DotnetTestTool(),

    // Strada tools (10)
    new ComponentCreateTool(),
    new SystemCreateTool(),
    new ModuleCreateTool(),
    new MediatorCreateTool(),
    new ServiceCreateTool(),
    new ControllerCreateTool(),
    new ModelCreateTool(),
    new ProjectAnalyzeTool(),
    new ArchitectureValidateTool(),
    new FeatureScaffoldTool(),

    // Unity tools (23)
    new CreateGameObjectTool(),
    new FindGameObjectsTool(),
    new ModifyGameObjectTool(),
    new DeleteGameObjectTool(),
    new DuplicateGameObjectTool(),
    new AddComponentTool(),
    new RemoveComponentTool(),
    new GetComponentsTool(),
    new SetTransformTool(),
    new GetTransformTool(),
    new SetParentTool(),
    new PlayModeTool(),
    new GetPlayStateTool(),
    new ExecuteMenuTool(),
    new ConsoleLogTool(),
    new ConsoleClearTool(),
    new ConsoleReadTool(),
    new ConsoleAnalyzeTool(),
    new SelectionGetTool(),
    new SelectionSetTool(),
    new BuildPipelineTool(),
    new PackageManageTool(),
    new EditorPreferencesTool(),

    // Unity Scene tools (8)
    new SceneCreateTool(),
    new SceneOpenTool(),
    new SceneSaveTool(),
    new SceneInfoTool(),
    new SceneAnalyzeTool(),
    new PrefabCreateTool(),
    new PrefabInstantiateTool(),
    new PrefabAnalyzeTool(),

    // Unity Asset tools (8)
    new AssetFindTool(),
    new AssetDependenciesTool(),
    new AssetUnusedTool(),
    new MaterialGetTool(),
    new MaterialSetTool(),
    new ShaderListTool(),
    new ScriptableObjectCreateTool(),
    new TextureInfoTool(),

    // Unity Subsystem tools (6)
    new AnimationPlayTool(),
    new AnimationListTool(),
    new PhysicsRaycastTool(),
    new NavMeshBakeTool(),
    new ParticlesControlTool(),
    new LightingBakeTool(),

    // Unity Config tools (4)
    new PlayerSettingsTool(),
    new QualitySettingsTool(),
    new BuildSettingsTool(),
    new ProjectSettingsToolConfig(),

    // Advanced tools (5) - some have special constructors
    new BatchExecuteTool(toolRegistry),
    new ScriptExecuteTool({ scriptExecuteEnabled: config.scriptExecuteEnabled }),
    new ScriptValidateTool(),
    new CSharpReflectionTool({ reflectionInvokeEnabled: config.reflectionInvokeEnabled }),
    new UnityProfilerTool(),
  ];

  const bridgeAwareTools: BridgeAware[] = [];

  for (const tool of tools) {
    toolRegistry.register(tool);

    if (hasBridgeClient(tool)) {
      bridgeAwareTools.push(tool);
    }

    // Bind to MCP server using registerTool with passthrough input schema.
    // Our tools handle their own zod validation internally, so we accept
    // any object from the SDK and forward it to tool.execute().
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: z.object({}).passthrough(),
      },
      async (args: Record<string, unknown>) => {
        const result = await tool.execute(args, toolContext);
        return {
          content: [{ type: 'text' as const, text: result.content }],
          isError: result.isError,
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // 2. Instantiate and register all resources
  // -------------------------------------------------------------------------
  const resources: IResource[] = [
    // Strada resources (no constructor args)
    new ApiReferenceResource(),
    new NamespacesResource(),
    new ExamplesResource(),

    // Unity resources (require projectPath)
    new ManifestResource(projectPath),
    new ProjectSettingsResource(projectPath),
    new AsmdefListResource(projectPath),
    new FileStatsResource(projectPath),

    // Bridge resources (no constructor args, have setBridgeClient)
    new SceneHierarchyResource(),
    new ConsoleLogsResource(),
    new PlayStateResource(),
  ];

  const bridgeAwareResources: BridgeAware[] = [];

  for (const resource of resources) {
    resourceRegistry.register(resource);

    if (hasBridgeClient(resource)) {
      bridgeAwareResources.push(resource);
    }

    const isTemplate = resource.uri.includes('{');

    if (isTemplate) {
      const template = new ResourceTemplate(resource.uri, { list: undefined });

      server.resource(
        resource.name,
        template,
        { description: resource.metadata.description },
        async (_uri, variables) => {
          const params = variables as Record<string, string>;
          const content = await resource.read(params);
          return {
            contents: [{
              uri: content.uri,
              mimeType: content.mimeType,
              text: content.text,
            }],
          };
        },
      );
    } else {
      server.resource(
        resource.name,
        resource.uri,
        { description: resource.metadata.description },
        async () => {
          const content = await resource.read();
          return {
            contents: [{
              uri: content.uri,
              mimeType: content.mimeType,
              text: content.text,
            }],
          };
        },
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. Instantiate and register all prompts
  // -------------------------------------------------------------------------
  const prompts: IPrompt[] = [
    new CreateEcsFeaturePrompt(),
    new CreateMvcsFeaturePrompt(),
    new AnalyzeArchitecturePrompt(),
    new DebugPerformancePrompt(),
    new OptimizeBuildPrompt(),
    new SetupScenePrompt(),
  ];

  for (const prompt of prompts) {
    promptRegistry.register(prompt);

    const shape: Record<string, z.ZodString | z.ZodOptional<z.ZodString>> = {};
    for (const arg of prompt.arguments) {
      shape[arg.name] = arg.required ? z.string() : z.string().optional();
    }

    server.prompt(
      prompt.name,
      prompt.description,
      shape,
      async (args) => {
        const messages = await prompt.render((args ?? {}) as Record<string, string>);
        return {
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        };
      },
    );
  }

  return {
    tools,
    resources,
    prompts,
    bridgeAwareTools,
    bridgeAwareResources,
    toolContext,
  };
}
