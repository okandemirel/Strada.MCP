// Unity bridge tool base class
export { BridgeTool } from './bridge-tool.js';

// GameObject CRUD tools (5)
export {
  CreateGameObjectTool,
  FindGameObjectsTool,
  ModifyGameObjectTool,
  DeleteGameObjectTool,
  DuplicateGameObjectTool,
} from './gameobject-tools.js';

// Component tools (3)
export {
  AddComponentTool,
  RemoveComponentTool,
  GetComponentsTool,
} from './component-tools.js';

// Transform tools (3)
export {
  SetTransformTool,
  GetTransformTool,
  SetParentTool,
} from './transform-tools.js';

// Play mode tools (3)
export {
  PlayModeTool,
  GetPlayStateTool,
  ExecuteMenuTool,
} from './playmode-tools.js';

// Editor utility tools (4)
export {
  ConsoleLogTool,
  ConsoleClearTool,
  ConsoleReadTool,
  ConsoleAnalyzeTool,
  SelectionGetTool,
  SelectionSetTool,
} from './editor-tools.js';

// Unity runtime management tools (3)
export {
  BuildPipelineTool,
  PackageManageTool,
  EditorPreferencesTool,
} from './management-tools.js';

// Unity diagnostics and verification tools (14)
export {
  CompileStatusTool,
  CompileWaitTool,
  RecompileTool,
  AssemblyReloadStatusTool,
  TestListTool,
  TestRunTool,
  TestResultsTool,
  TestRerunFailedTool,
  ScreenshotCaptureTool,
  ScreenshotCompareTool,
  VisualSnapshotTool,
  ProjectToolListTool,
  ProjectToolInvokeTool,
  VerifyChangeTool,
} from './diagnostics-tools.js';

// Unity editor instance discovery tools (1)
export {
  EditorInstancesTool,
} from './editor-instance-tools.js';

// Unity editor routing tools (1)
export {
  UnityEditorRouteTool,
} from './editor-route-tool.js';

// Unity editor productivity tools (7)
export {
  UiQueryTool,
  UiActionTool,
  InputSimulateTool,
  CameraManageTool,
  GraphicsManageTool,
  AddressablesManageTool,
  ImportSettingsManageTool,
} from './productivity-tools.js';

// Total: 46 tools
