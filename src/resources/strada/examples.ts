import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';

const SUPPORTED_PATTERNS = ['ecs', 'mvcs', 'di', 'mediator', 'module'] as const;
type PatternName = (typeof SUPPORTED_PATTERNS)[number];

export class ExamplesResource implements IResource {
  readonly uri = 'strada://examples/{pattern}';
  readonly name = 'Strada.Core Code Examples';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Code examples by pattern (ecs, mvcs, di, mediator, module)',
  };

  async read(params?: Record<string, string>): Promise<ResourceContent> {
    const pattern = params?.pattern;

    if (!pattern) {
      return {
        uri: this.uri,
        mimeType: 'text/markdown',
        text: this.listPatterns(),
      };
    }

    if (!SUPPORTED_PATTERNS.includes(pattern as PatternName)) {
      throw new Error(
        `Unknown pattern "${pattern}". Supported: ${SUPPORTED_PATTERNS.join(', ')}`,
      );
    }

    return {
      uri: `strada://examples/${pattern}`,
      mimeType: 'text/markdown',
      text: EXAMPLES[pattern as PatternName],
    };
  }

  private listPatterns(): string {
    const lines = ['# Strada.Core Code Examples\n', 'Available patterns:\n'];
    for (const p of SUPPORTED_PATTERNS) {
      lines.push(`- **${p}** — \`strada://examples/${p}\``);
    }
    return lines.join('\n');
  }
}

const EXAMPLES: Record<PatternName, string> = {
  ecs: `# ECS Pattern Example

## Component
\`\`\`csharp
using System.Runtime.InteropServices;
using Strada.Core.ECS;

[StructLayout(LayoutKind.Sequential)]
public struct Health : IComponent
{
    public float Current;
    public float Max;
}
\`\`\`

## System
\`\`\`csharp
using Strada.Core.ECS.Systems;

[StradaSystem]
[UpdatePhase(UpdatePhase.Update)]
public class HealthSystem : SystemBase
{
    protected override void OnUpdate(float deltaTime)
    {
        ForEach<Health>((int entity, ref Health health) =>
        {
            if (health.Current <= 0)
            {
                EntityManager.DestroyEntity(entity);
            }
        });
    }
}
\`\`\`

## Module Registration
\`\`\`csharp
using Strada.Core.Modules;

public class CombatModule : ModuleConfig
{
    public override void Configure(IModuleBuilder builder)
    {
        builder.AddSystem<HealthSystem>();
        builder.AddSystem<DamageSystem>();
    }
}
\`\`\``,

  mvcs: `# MVCS Pattern Example

## Model
\`\`\`csharp
using Strada.Core.Patterns;

public class PlayerModel : Model<PlayerData>
{
    public string Name => Data.Name;
    public int Level => Data.Level;
}

public class PlayerData
{
    public string Name { get; set; }
    public int Level { get; set; }
}
\`\`\`

## View
\`\`\`csharp
using Strada.Core.Patterns;
using UnityEngine;

public class PlayerView : View
{
    [SerializeField] private TMPro.TextMeshProUGUI nameLabel;
    [SerializeField] private TMPro.TextMeshProUGUI levelLabel;

    public void UpdateName(string name) => nameLabel.text = name;
    public void UpdateLevel(int level) => levelLabel.text = $"Lv.{level}";
}
\`\`\`

## Controller
\`\`\`csharp
using Strada.Core.Patterns;
using Strada.Core.DI.Attributes;

public class PlayerController : Controller<PlayerModel>
{
    [Inject] private readonly PlayerView _view;

    protected override void OnInitialize()
    {
        _view.UpdateName(Model.Name);
        _view.UpdateLevel(Model.Level);
    }
}
\`\`\`

## Service
\`\`\`csharp
using Strada.Core.Patterns;
using Strada.Core.DI.Attributes;

public class ScoreService : Service
{
    [Inject] private readonly PlayerModel _player;

    public int CalculateScore() => _player.Level * 100;
}
\`\`\``,

  di: `# Dependency Injection Example

## Field Injection
\`\`\`csharp
using Strada.Core.DI.Attributes;

public class GameManager
{
    [Inject] private readonly IPlayerService _playerService;
    [Inject] private readonly IScoreService _scoreService;
}
\`\`\`

## Registration
\`\`\`csharp
using Strada.Core.Modules;

public class GameModule : ModuleConfig
{
    public override void Configure(IModuleBuilder builder)
    {
        // Service (interface -> implementation)
        builder.RegisterService<IPlayerService, PlayerService>();

        // Controller
        builder.RegisterController<GameController>();

        // Model (interface -> implementation)
        builder.RegisterModel<IPlayerModel, PlayerModel>();

        // Factory
        builder.RegisterFactory<IEnemyFactory, EnemyFactory>();

        // Instance
        builder.RegisterInstance<GameConfig>(new GameConfig { MaxPlayers = 4 });
    }
}
\`\`\`

## Lifetimes
\`\`\`csharp
// Singleton (default) - one instance shared across all consumers
builder.RegisterService<IPlayerService, PlayerService>();

// Transient - new instance per injection
builder.RegisterService<IEnemyFactory, EnemyFactory>(Lifetime.Transient);

// Scoped - one instance per scope
builder.RegisterService<ISessionService, SessionService>(Lifetime.Scoped);
\`\`\``,

  mediator: `# Mediator Pattern Example

## Entity Mediator
\`\`\`csharp
using Strada.Core.Patterns;
using Strada.Core.DI.Attributes;

public class EnemyMediator : EntityMediator<EnemyView>
{
    [Inject] private readonly EnemyModel _model;
    [Inject] private readonly ICombatService _combat;

    protected override void OnInitialize()
    {
        View.OnDamageReceived += HandleDamage;
    }

    private void HandleDamage(float amount)
    {
        _model.Health -= amount;
        View.UpdateHealthBar(_model.Health / _model.MaxHealth);

        if (_model.Health <= 0)
        {
            _combat.HandleDeath(View.EntityId);
        }
    }

    protected override void OnDispose()
    {
        View.OnDamageReceived -= HandleDamage;
    }
}
\`\`\`

## Communication
\`\`\`csharp
using Strada.Core.Communication;

// Publish event
EventBus.Publish(new EnemyDefeatedEvent { EnemyId = id, Score = 50 });

// Subscribe to event
EventBus.Subscribe<EnemyDefeatedEvent>(e =>
{
    _scoreService.AddScore(e.Score);
});

// Send signal (fire-and-forget)
EventBus.Send(new PlaySoundSignal { Clip = "explosion" });

// Query (request-response)
var result = EventBus.Query<GetNearestEnemyQuery, EnemyResult>(
    new GetNearestEnemyQuery { Position = transform.position }
);
\`\`\``,

  module: `# Module Pattern Example

## Module Config
\`\`\`csharp
using Strada.Core.Modules;

public class InventoryModule : ModuleConfig
{
    public override void Configure(IModuleBuilder builder)
    {
        // Systems
        builder.AddSystem<InventorySystem>();
        builder.AddSystem<ItemPickupSystem>();

        // Services
        builder.RegisterService<IInventoryService, InventoryService>();
        builder.RegisterService<IItemDatabase, ItemDatabase>();

        // Models
        builder.RegisterModel<IInventoryModel, InventoryModel>();

        // Controllers
        builder.RegisterController<InventoryUIController>();
    }

    public override void Initialize(IServiceLocator services)
    {
        var db = services.Get<IItemDatabase>();
        db.LoadItems("items.json");
    }

    public override void Shutdown()
    {
        // Cleanup resources
    }
}
\`\`\`

## Module Dependencies
\`\`\`csharp
// Modules are registered in bootstrap order
public class GameBootstrap
{
    public void Configure(IModuleRegistry registry)
    {
        registry.Register<CoreModule>();       // First: core services
        registry.Register<NetworkModule>();     // Second: networking
        registry.Register<InventoryModule>();   // Third: depends on core
        registry.Register<CombatModule>();      // Fourth: depends on inventory
    }
}
\`\`\``,
};
