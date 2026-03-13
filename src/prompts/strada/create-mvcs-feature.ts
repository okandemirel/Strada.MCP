import type { IPrompt, PromptArgument, PromptMessage } from '../prompt.interface.js';

export class CreateMvcsFeaturePrompt implements IPrompt {
  readonly name = 'create_mvcs_feature';
  readonly description = 'MVCS pattern scaffold guidance for Strada.Core';
  readonly arguments: PromptArgument[] = [
    { name: 'featureName', description: 'Name of the MVCS feature', required: true },
    { name: 'hasUI', description: 'Whether the feature has a UI component (true/false)', required: false },
  ];

  async render(args: Record<string, string>): Promise<PromptMessage[]> {
    const featureName = args.featureName;
    if (!featureName) {
      throw new Error('featureName is required');
    }

    const hasUI = args.hasUI !== 'false';

    const messages: PromptMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I want to create a new MVCS feature called "${featureName}"${hasUI ? ' with UI' : ' without UI'}.

Please guide me through creating this using Strada.Core's MVCS (Model-View-Controller-Service) pattern. I need:
1. Model (data layer)
2. ${hasUI ? 'View (Unity MonoBehaviour UI)' : 'No view needed'}
3. Controller (logic layer)
4. Service (business logic)
5. Module registration with DI bindings`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: buildMvcsResponse(featureName, hasUI),
        },
      },
    ];

    return messages;
  }
}

function buildMvcsResponse(name: string, hasUI: boolean): string {
  const lines: string[] = [
    `I'll help you scaffold the "${name}" MVCS feature. Here's the complete structure:`,
    '',
    '## Step 1: Model (Data Layer)',
    '',
    '```csharp',
    'using Strada.Core.Patterns;',
    '',
    `public class ${name}Data`,
    '{',
    '    // Define your data properties here',
    '    public string Id { get; set; }',
    '}',
    '',
    `public class ${name}Model : Model<${name}Data>`,
    '{',
    `    public string Id => Data.Id;`,
    '}',
    '```',
    '',
  ];

  if (hasUI) {
    lines.push(
      '## Step 2: View (UI Layer)',
      '',
      '```csharp',
      'using Strada.Core.Patterns;',
      'using UnityEngine;',
      '',
      `public class ${name}View : View`,
      '{',
      '    // Bind your UI elements here',
      '    // [SerializeField] private TMPro.TextMeshProUGUI label;',
      '',
      '    public void Refresh()',
      '    {',
      '        // Update UI from data',
      '    }',
      '}',
      '```',
      '',
    );
  }

  lines.push(
    `## Step ${hasUI ? '3' : '2'}: Controller (Logic Layer)`,
    '',
    '```csharp',
    'using Strada.Core.Patterns;',
    'using Strada.Core.DI.Attributes;',
    '',
    `public class ${name}Controller : Controller<${name}Model>`,
    '{',
  );

  if (hasUI) {
    lines.push(`    [Inject] private readonly ${name}View _view;`);
  }

  lines.push(
    `    [Inject] private readonly ${name}Service _service;`,
    '',
    '    protected override void OnInitialize()',
    '    {',
    '        // Setup logic and subscriptions',
  );

  if (hasUI) {
    lines.push('        _view.Refresh();');
  }

  lines.push(
    '    }',
    '}',
    '```',
    '',
    `## Step ${hasUI ? '4' : '3'}: Service (Business Logic)`,
    '',
    '```csharp',
    'using Strada.Core.Patterns;',
    '',
    `public class ${name}Service : Service`,
    '{',
    '    // Business logic methods',
    '}',
    '```',
    '',
    `## Step ${hasUI ? '5' : '4'}: Module Registration`,
    '',
    '```csharp',
    'using Strada.Core.Modules;',
    '',
    `public class ${name}Module : ModuleConfig`,
    '{',
    '    public override void Configure(IModuleBuilder builder)',
    '    {',
    `        builder.RegisterModel<${name}Model, ${name}Model>();`,
    `        builder.RegisterController<${name}Controller>();`,
    `        builder.RegisterService<${name}Service, ${name}Service>();`,
    '    }',
    '}',
    '```',
    '',
    'Would you like me to create these files? I can customize the model data, add event handling, or include additional services.',
  );

  return lines.join('\n');
}
