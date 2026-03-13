import type { IPrompt, PromptArgument, PromptMessage } from '../prompt.interface.js';

const SCENE_TYPES = ['gameplay', 'menu', 'loading'] as const;
type SceneType = (typeof SCENE_TYPES)[number];

export class SetupScenePrompt implements IPrompt {
  readonly name = 'setup_scene';
  readonly description = 'Scene setup workflow guidance for Unity projects';
  readonly arguments: PromptArgument[] = [
    { name: 'sceneName', description: 'Name of the scene to set up', required: true },
    {
      name: 'sceneType',
      description: 'Type of scene: gameplay, menu, or loading (default: gameplay)',
      required: false,
    },
  ];

  async render(args: Record<string, string>): Promise<PromptMessage[]> {
    const sceneName = args.sceneName;
    if (!sceneName) {
      throw new Error('sceneName is required');
    }

    const sceneType = (args.sceneType ?? 'gameplay') as SceneType;
    if (!SCENE_TYPES.includes(sceneType)) {
      throw new Error(
        `Invalid sceneType "${sceneType}". Supported: ${SCENE_TYPES.join(', ')}`,
      );
    }

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I need to set up a new ${sceneType} scene called "${sceneName}" in my Strada.Core Unity project.

Please guide me through the complete setup including:
1. Scene hierarchy structure
2. Required Strada.Core components
3. Module initialization
4. Scene-specific configuration`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: buildSceneGuide(sceneName, sceneType),
        },
      },
    ];
  }
}

function buildSceneGuide(sceneName: string, sceneType: SceneType): string {
  const guides: Record<SceneType, string> = {
    gameplay: `I'll guide you through setting up the "${sceneName}" gameplay scene.

## Scene Hierarchy Structure

\`\`\`
${sceneName} (Scene)
├── --- MANAGEMENT ---
│   ├── StradaBootstrap          (Bootstrap + ModuleRegistry)
│   ├── EventBusHost             (EventBus singleton)
│   └── ServiceLocatorHost       (DI container)
├── --- ENVIRONMENT ---
│   ├── Directional Light
│   ├── Main Camera              (Camera + AudioListener)
│   └── Environment              (static geometry parent)
├── --- GAMEPLAY ---
│   ├── PlayerSpawn              (spawn point marker)
│   ├── EnemyManager             (entity pool parent)
│   └── InteractableRoot         (interactable objects parent)
├── --- UI ---
│   ├── Canvas                   (Screen Space - Overlay)
│   │   ├── HUD
│   │   └── PauseMenu
│   └── EventSystem
└── --- DEBUG ---
    └── DebugOverlay             (editor-only debug UI)
\`\`\`

## Required Strada.Core Setup

### 1. Bootstrap Configuration
\`\`\`csharp
public class ${sceneName}Bootstrap : MonoBehaviour
{
    void Awake()
    {
        var registry = new ModuleRegistry();
        registry.Register<CoreModule>();
        registry.Register<${sceneName}Module>();
        // Add gameplay-specific modules
        registry.Initialize();
    }
}
\`\`\`

### 2. Scene Module
\`\`\`csharp
public class ${sceneName}Module : ModuleConfig
{
    public override void Configure(IModuleBuilder builder)
    {
        // Register scene-specific systems and services
        builder.AddSystem<GameplaySystem>();
        builder.RegisterService<ISceneService, ${sceneName}SceneService>();
    }
}
\`\`\`

### 3. Add to Build Settings
Add \`Assets/Scenes/${sceneName}.unity\` to Build Settings (File > Build Settings > Add Open Scenes).`,

    menu: `I'll guide you through setting up the "${sceneName}" menu scene.

## Scene Hierarchy Structure

\`\`\`
${sceneName} (Scene)
├── --- MANAGEMENT ---
│   ├── StradaBootstrap          (Bootstrap, lightweight)
│   └── SceneTransitionManager   (handles scene loading)
├── --- CAMERA ---
│   ├── Main Camera              (Camera + AudioListener)
│   └── Background               (skybox or backdrop)
├── --- UI ---
│   ├── Canvas                   (Screen Space - Overlay)
│   │   ├── MainMenuPanel
│   │   │   ├── Title
│   │   │   ├── PlayButton
│   │   │   ├── SettingsButton
│   │   │   └── QuitButton
│   │   ├── SettingsPanel        (hidden by default)
│   │   └── LoadingOverlay       (hidden by default)
│   └── EventSystem
└── --- AUDIO ---
    └── MusicPlayer              (AudioSource, loop enabled)
\`\`\`

## Required Strada.Core Setup

### 1. Menu Module (Lightweight)
\`\`\`csharp
public class ${sceneName}Module : ModuleConfig
{
    public override void Configure(IModuleBuilder builder)
    {
        builder.RegisterService<IMenuNavigator, MenuNavigator>();
        builder.RegisterController<${sceneName}Controller>();
        builder.RegisterModel<${sceneName}Model, ${sceneName}Model>();
    }
}
\`\`\`

### 2. Scene Transition
\`\`\`csharp
public class SceneTransitionManager : Service
{
    public async void LoadScene(string sceneName)
    {
        // Show loading overlay
        EventBus.Publish(new SceneLoadingEvent { SceneName = sceneName });
        await SceneManager.LoadSceneAsync(sceneName);
    }
}
\`\`\`

### 3. Set as Build Index 0
Menu scene should be the first scene in Build Settings (index 0).`,

    loading: `I'll guide you through setting up the "${sceneName}" loading scene.

## Scene Hierarchy Structure

\`\`\`
${sceneName} (Scene)
├── --- MANAGEMENT ---
│   ├── LoadingManager           (async scene loader)
│   └── AssetPreloader           (preload critical assets)
├── --- CAMERA ---
│   └── Main Camera              (Camera, fixed position)
├── --- UI ---
│   ├── Canvas                   (Screen Space - Overlay)
│   │   ├── Background           (full-screen image)
│   │   ├── ProgressBar          (Slider component)
│   │   ├── LoadingText          (TextMeshPro, animated dots)
│   │   └── TipText              (random gameplay tips)
│   └── EventSystem
└── --- AUDIO ---
    └── AmbientPlayer            (subtle loading audio)
\`\`\`

## Required Strada.Core Setup

### 1. Loading Manager
\`\`\`csharp
public class ${sceneName}Manager : MonoBehaviour
{
    [SerializeField] private Slider progressBar;
    [SerializeField] private TextMeshProUGUI loadingText;

    async void Start()
    {
        var targetScene = PlayerPrefs.GetString("TargetScene", "MainMenu");
        var operation = SceneManager.LoadSceneAsync(targetScene);
        operation.allowSceneActivation = false;

        while (operation.progress < 0.9f)
        {
            progressBar.value = operation.progress;
            loadingText.text = $"Loading... {(int)(operation.progress * 100)}%";
            await Task.Yield();
        }

        progressBar.value = 1f;
        loadingText.text = "Ready!";
        await Task.Delay(500); // Brief pause for visual feedback
        operation.allowSceneActivation = true;
    }
}
\`\`\`

### 2. Asset Preloading
\`\`\`csharp
public class AssetPreloader : MonoBehaviour
{
    async void Start()
    {
        // Preload critical assets via Addressables or Resources
        // This runs in parallel with scene loading
    }
}
\`\`\`

### 3. Build Settings
Add between menu and gameplay scenes in Build Settings.`,
  };

  return guides[sceneType];
}
