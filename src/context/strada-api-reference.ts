/**
 * Authoritative Strada.Core API Reference
 *
 * Single source of truth for Strada.Core API surface, verified against
 * real source at /Users/okanunico/Documents/Strada/Strada.Core/.
 *
 * Consumed by all strada tools in src/tools/strada/.
 * Any Strada.Core API changes require manual updates here.
 */

export const STRADA_API = {
  namespaces: {
    root: 'Strada.Core',
    ecs: 'Strada.Core.ECS',
    ecsCore: 'Strada.Core.ECS.Core',
    systems: 'Strada.Core.ECS.Systems',
    query: 'Strada.Core.ECS.Query',
    storage: 'Strada.Core.ECS.Storage',
    jobs: 'Strada.Core.ECS.Jobs',
    di: 'Strada.Core.DI',
    diAttributes: 'Strada.Core.DI.Attributes',
    modules: 'Strada.Core.Modules',
    sync: 'Strada.Core.Sync',
    communication: 'Strada.Core.Communication',
    patterns: 'Strada.Core.Patterns',
    pooling: 'Strada.Core.Pooling',
    stateMachine: 'Strada.Core.StateMachine',
    commands: 'Strada.Core.Commands',
    bootstrap: 'Strada.Core.Bootstrap',
    logging: 'Strada.Core.Logging',
  },

  baseClasses: {
    systems: ['SystemBase', 'JobSystemBase', 'BurstSystemBase'] as const,
    patterns: {
      view: 'View',
      controller: 'Controller',
      controllerGeneric: 'Controller<TModel>',
      model: 'Model',
      modelGeneric: 'Model<TData>',
      reactiveModel: 'ReactiveModel',
      service: 'Service',
      tickableService: 'TickableService',
      fixedTickableService: 'FixedTickableService',
      orderedService: 'OrderedService',
    },
    mediator: 'EntityMediator<TView>',
    moduleConfig: 'ModuleConfig',
  },

  systemAttributes: {
    stradaSystem: '[StradaSystem]',
    updatePhase: (phase: string) => `[UpdatePhase(UpdatePhase.${phase})]`,
    executionOrder: (order: number) => `[ExecutionOrder(${order})]`,
    runBefore: (type: string) => `[RunBefore(typeof(${type}))]`,
    runAfter: (type: string) => `[RunAfter(typeof(${type}))]`,
    requiresSystem: (type: string) => `[RequiresSystem(typeof(${type}))]`,
  },

  updatePhases: ['Initialization', 'Update', 'LateUpdate', 'FixedUpdate'] as const,

  systemApi: {
    abstractMethod: 'OnUpdate(float deltaTime)',
    lifecycleMethods: ['OnInitialize()', 'OnDispose()'],
    queryPattern: 'ForEach<T1, T2>((int entity, ref T1 c1, ref T2 c2) => { })',
    genericVariants: 8,
    builtInProperties: ['EntityManager', 'EventBus', 'HandleRegistry'],
  },

  diApi: {
    fieldInjection: '[Inject] private readonly T _field;',
    registration: {
      service: 'builder.RegisterService<TInterface, TImpl>()',
      controller: 'builder.RegisterController<T>()',
      model: 'builder.RegisterModel<TInterface, TImpl>()',
      factory: 'builder.RegisterFactory<TInterface, TImpl>()',
      instance: 'builder.RegisterInstance<T>(instance)',
    },
    lifetimes: ['Singleton', 'Transient', 'Scoped'] as const,
  },

  componentApi: {
    interface: 'IComponent',
    structLayout: '[StructLayout(LayoutKind.Sequential)]',
    constraint: 'unmanaged',
    maxQueryComponents: 8,
  },

  moduleApi: {
    configureMethods: ['Configure(IModuleBuilder builder)'],
    lifecycleMethods: ['Initialize(IServiceLocator services)', 'Shutdown()'],
    systemEntry: 'SystemEntry',
    serviceEntry: 'ServiceEntry',
  },

  syncApi: {
    reactiveProperty: 'ReactiveProperty<T>',
    reactiveCollection: 'ReactiveCollection<T>',
    computedProperty: 'ComputedProperty<T>',
    syncEvents: [
      'ComponentChanged<T>',
      'ComponentAdded<T>',
      'ComponentRemoved<T>',
      'EntityCreated',
      'EntityDestroyed',
    ],
  },

  communicationApi: {
    publish: 'Publish<TEvent>(TEvent)',
    subscribe: 'Subscribe<TEvent>(Action<TEvent>)',
    send: 'Send<TSignal>(TSignal)',
    query: 'Query<TQuery, TResult>(TQuery)',
  },

  assemblyReferences: {
    core: 'Strada.Core',
  },
} as const;
