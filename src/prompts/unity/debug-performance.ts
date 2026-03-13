import type { IPrompt, PromptArgument, PromptMessage } from '../prompt.interface.js';

export class DebugPerformancePrompt implements IPrompt {
  readonly name = 'debug_performance';
  readonly description = 'Performance debugging guidance for Unity projects';
  readonly arguments: PromptArgument[] = [
    { name: 'symptom', description: 'Performance symptom (e.g., low fps, memory leak, long load times)', required: true },
  ];

  async render(args: Record<string, string>): Promise<PromptMessage[]> {
    const symptom = args.symptom;
    if (!symptom) {
      throw new Error('symptom is required');
    }

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I'm experiencing a performance issue in my Unity project using Strada.Core: "${symptom}".

Please help me debug this. I need guidance on:
1. What to measure and where to look
2. Common causes in Strada.Core ECS projects
3. Step-by-step debugging approach
4. Potential fixes`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll help you debug the performance issue: "${symptom}". Let's follow a systematic approach.

## Step 1: Measure First

Before making changes, let's establish baseline metrics:

- **Unity Profiler**: Window > Analysis > Profiler
  - CPU Usage: Check main thread vs render thread
  - Memory: Track allocation patterns
  - GPU: Review draw calls and batch counts
- **Frame Debugger**: Window > Analysis > Frame Debugger
- **Strada ECS Stats**: Check system execution times via the bridge

\`\`\`
Useful console commands:
- Check system timing: use unity://console-logs resource
- Check play state: use unity://play-state resource
\`\`\`

## Step 2: Common Strada.Core ECS Performance Issues

### CPU-bound issues:
1. **System execution order**: Systems in wrong \`UpdatePhase\` causing unnecessary work
2. **Query overhead**: \`ForEach<>\` with too many components (max 8, aim for 2-3)
3. **Allocation in hot paths**: Creating objects inside \`OnUpdate()\`
4. **Missing [ExecutionOrder]**: Systems running in suboptimal order
5. **Sync overhead**: Too many \`ReactiveProperty<T>\` subscriptions firing per frame

### Memory issues:
1. **Component bloat**: Components larger than needed (aim for < 64 bytes)
2. **Entity leaks**: Entities created but never destroyed
3. **Event subscriber leaks**: \`Subscribe<T>\` without matching unsubscribe
4. **Service references**: Holding references to destroyed entities

### Rendering issues:
1. **Draw call batching**: Too many unique materials
2. **Overdraw**: Overlapping transparent objects
3. **Shadow casting**: Too many shadow-casting lights

## Step 3: Debugging Approach

1. **Profile in a build** (not editor) for accurate timing
2. **Isolate the problem**: Disable systems one by one
3. **Check hot paths**: Focus on \`OnUpdate()\` methods first
4. **Review allocations**: Use Profiler's allocation tracker
5. **Check event bus**: Look for cascading event storms

## Step 4: Common Fixes

- Move expensive logic from \`Update\` to \`FixedUpdate\` or \`LateUpdate\`
- Use \`[ExecutionOrder]\` to batch related systems
- Cache query results when entity set is stable
- Use \`BurstSystemBase\` for compute-heavy systems
- Pool frequently created/destroyed entities

Would you like me to analyze your project's systems and identify specific bottlenecks? I can use the architecture-validate and project-analyze tools to scan for common issues.`,
        },
      },
    ];
  }
}
