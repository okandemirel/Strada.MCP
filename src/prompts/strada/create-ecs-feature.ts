import type { IPrompt, PromptArgument, PromptMessage } from '../prompt.interface.js';

export class CreateEcsFeaturePrompt implements IPrompt {
  readonly name = 'create_ecs_feature';
  readonly description =
    'Multi-message sequence guiding ECS feature creation (component, system, module registration)';
  readonly arguments: PromptArgument[] = [
    { name: 'featureName', description: 'Name of the ECS feature to create', required: true },
    { name: 'description', description: 'Description of what the feature does', required: false },
  ];

  async render(args: Record<string, string>): Promise<PromptMessage[]> {
    const featureName = args.featureName;
    if (!featureName) {
      throw new Error('featureName is required');
    }

    const description = args.description ?? `${featureName} ECS feature`;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I want to create a new ECS feature called "${featureName}".

Description: ${description}

Please guide me through creating this feature using Strada.Core's ECS system. I need:
1. Component struct(s) implementing IComponent
2. System class extending SystemBase
3. Module registration

Follow Strada.Core conventions: [StructLayout(LayoutKind.Sequential)] for components, [StradaSystem] + [UpdatePhase] attributes for systems, and ModuleConfig for module setup.`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll help you create the "${featureName}" ECS feature. Let me guide you through each step.

## Step 1: Component Definition

First, define the component struct. Components in Strada.Core must:
- Implement \`IComponent\`
- Use \`[StructLayout(LayoutKind.Sequential)]\`
- Be \`unmanaged\` (no reference types)
- Contain only data, no logic

\`\`\`csharp
using System.Runtime.InteropServices;
using Strada.Core.ECS;

[StructLayout(LayoutKind.Sequential)]
public struct ${featureName}Component : IComponent
{
    // Add your component fields here
    // Example: public float Value;
}
\`\`\`

## Step 2: System Implementation

Next, create the system that processes the component:

\`\`\`csharp
using Strada.Core.ECS.Systems;

[StradaSystem]
[UpdatePhase(UpdatePhase.Update)]
public class ${featureName}System : SystemBase
{
    protected override void OnUpdate(float deltaTime)
    {
        ForEach<${featureName}Component>((int entity, ref ${featureName}Component component) =>
        {
            // Process component logic here
        });
    }
}
\`\`\`

## Step 3: Module Registration

Finally, register everything in a module:

\`\`\`csharp
using Strada.Core.Modules;

public class ${featureName}Module : ModuleConfig
{
    public override void Configure(IModuleBuilder builder)
    {
        builder.AddSystem<${featureName}System>();
    }
}
\`\`\`

Would you like me to create these files using the Strada MCP tools? I can also add additional components, lifecycle methods, or event handling as needed.`,
        },
      },
    ];
  }
}
