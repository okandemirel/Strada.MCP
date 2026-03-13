import type { IPrompt, PromptArgument, PromptMessage } from '../prompt.interface.js';

export class AnalyzeArchitecturePrompt implements IPrompt {
  readonly name = 'analyze_architecture';
  readonly description = 'Architecture review prompt for Strada.Core projects';
  readonly arguments: PromptArgument[] = [
    {
      name: 'focus',
      description: 'Focus area: ecs, di, modules, or all (default: all)',
      required: false,
    },
  ];

  async render(args: Record<string, string>): Promise<PromptMessage[]> {
    const focus = (args.focus ?? 'all') as 'ecs' | 'di' | 'modules' | 'all';

    const validFocuses = ['ecs', 'di', 'modules', 'all'];
    if (!validFocuses.includes(focus)) {
      throw new Error(
        `Invalid focus "${focus}". Supported: ${validFocuses.join(', ')}`,
      );
    }

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: buildPrompt(focus),
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: buildGuide(focus),
        },
      },
    ];
  }
}

function buildPrompt(focus: string): string {
  if (focus === 'all') {
    return `Please analyze the architecture of my Strada.Core Unity project. Review the overall structure including ECS components and systems, dependency injection patterns, and module organization. Identify any anti-patterns, circular dependencies, or areas for improvement.`;
  }

  const prompts: Record<string, string> = {
    ecs: `Please analyze the ECS architecture of my Strada.Core Unity project. Review component definitions, system implementations, update phases, and query patterns. Look for common issues like oversized components, missing update phases, and inefficient queries.`,
    di: `Please analyze the dependency injection setup of my Strada.Core Unity project. Review service registrations, injection patterns, lifetime scopes, and potential circular dependencies. Check for proper use of interfaces and constructor patterns.`,
    modules: `Please analyze the module organization of my Strada.Core Unity project. Review module boundaries, dependency chains, initialization order, and configuration patterns. Look for modules that are too large, circular module dependencies, or improper layering.`,
  };

  return prompts[focus] ?? prompts['ecs'];
}

function buildGuide(focus: string): string {
  const sections: string[] = [
    "I'll analyze your project architecture. Here's my review framework:\n",
  ];

  if (focus === 'all' || focus === 'ecs') {
    sections.push(`## ECS Architecture Review

**Components checklist:**
- [ ] All components implement \`IComponent\`
- [ ] \`[StructLayout(LayoutKind.Sequential)]\` applied
- [ ] Components are \`unmanaged\` (no reference types)
- [ ] Components contain only data, no logic
- [ ] Component size is reasonable (< 64 bytes recommended)

**Systems checklist:**
- [ ] All systems have \`[StradaSystem]\` attribute
- [ ] \`[UpdatePhase]\` is explicitly set (not default)
- [ ] \`[ExecutionOrder]\` used where ordering matters
- [ ] \`ForEach<>\` queries use minimal component count (max 8)
- [ ] Systems are single-responsibility
- [ ] \`OnInitialize()\` and \`OnDispose()\` handle setup/teardown
`);
  }

  if (focus === 'all' || focus === 'di') {
    sections.push(`## Dependency Injection Review

**Registration checklist:**
- [ ] Services registered as interface-to-implementation
- [ ] Appropriate lifetime chosen (Singleton vs Transient vs Scoped)
- [ ] No circular dependency chains
- [ ] \`[Inject]\` fields are \`private readonly\`
- [ ] No service locator anti-pattern (direct container access)
- [ ] Factory pattern used for runtime-created objects
`);
  }

  if (focus === 'all' || focus === 'modules') {
    sections.push(`## Module Organization Review

**Module checklist:**
- [ ] Each module has a clear, bounded responsibility
- [ ] Module dependencies flow in one direction (no cycles)
- [ ] Initialization order matches dependency order
- [ ] \`Configure()\` only registers, no runtime logic
- [ ] \`Initialize()\` handles one-time setup
- [ ] \`Shutdown()\` releases resources
- [ ] Cross-module communication uses events, not direct references
`);
  }

  sections.push(
    'Let me scan your project files to perform this analysis. I\'ll use the project-analyze and architecture-validate tools to examine your codebase.',
  );

  return sections.join('\n');
}
