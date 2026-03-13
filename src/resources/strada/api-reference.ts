import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import { STRADA_API } from '../../context/strada-api-reference.js';

export class ApiReferenceResource implements IResource {
  readonly uri = 'strada://api-reference';
  readonly name = 'Strada.Core API Reference';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Full Strada.Core API reference as markdown',
  };

  async read(): Promise<ResourceContent> {
    const lines: string[] = [];

    lines.push('# Strada.Core API Reference\n');

    // Namespaces
    lines.push('## Namespaces\n');
    for (const [key, ns] of Object.entries(STRADA_API.namespaces)) {
      lines.push(`- **${key}**: \`${ns}\``);
    }
    lines.push('');

    // Base Classes
    lines.push('## Base Classes\n');
    lines.push('### Systems');
    for (const s of STRADA_API.baseClasses.systems) {
      lines.push(`- \`${s}\``);
    }
    lines.push('');

    lines.push('### Patterns (MVCS)');
    for (const [key, val] of Object.entries(STRADA_API.baseClasses.patterns)) {
      lines.push(`- **${key}**: \`${val}\``);
    }
    lines.push('');

    lines.push(`- **Mediator**: \`${STRADA_API.baseClasses.mediator}\``);
    lines.push(`- **ModuleConfig**: \`${STRADA_API.baseClasses.moduleConfig}\``);
    lines.push('');

    // System Attributes
    lines.push('## System Attributes\n');
    lines.push(`- \`${STRADA_API.systemAttributes.stradaSystem}\``);
    lines.push(`- \`${STRADA_API.systemAttributes.updatePhase('[Phase]')}\``);
    lines.push(`- \`${STRADA_API.systemAttributes.executionOrder(0)}\``);
    lines.push(`- \`${STRADA_API.systemAttributes.runBefore('[Type]')}\``);
    lines.push(`- \`${STRADA_API.systemAttributes.runAfter('[Type]')}\``);
    lines.push(`- \`${STRADA_API.systemAttributes.requiresSystem('[Type]')}\``);
    lines.push('');

    // Update Phases
    lines.push('## Update Phases\n');
    for (const phase of STRADA_API.updatePhases) {
      lines.push(`- \`${phase}\``);
    }
    lines.push('');

    // System API
    lines.push('## System API\n');
    lines.push(`- Abstract method: \`${STRADA_API.systemApi.abstractMethod}\``);
    lines.push('- Lifecycle methods:');
    for (const m of STRADA_API.systemApi.lifecycleMethods) {
      lines.push(`  - \`${m}\``);
    }
    lines.push(`- Query pattern: \`${STRADA_API.systemApi.queryPattern}\``);
    lines.push(`- Generic variants: ${STRADA_API.systemApi.genericVariants}`);
    lines.push('- Built-in properties:');
    for (const p of STRADA_API.systemApi.builtInProperties) {
      lines.push(`  - \`${p}\``);
    }
    lines.push('');

    // DI API
    lines.push('## Dependency Injection API\n');
    lines.push(`- Field injection: \`${STRADA_API.diApi.fieldInjection}\``);
    lines.push('- Registration:');
    for (const [key, val] of Object.entries(STRADA_API.diApi.registration)) {
      lines.push(`  - **${key}**: \`${val}\``);
    }
    lines.push('- Lifetimes:');
    for (const lt of STRADA_API.diApi.lifetimes) {
      lines.push(`  - \`${lt}\``);
    }
    lines.push('');

    // Component API
    lines.push('## Component API\n');
    lines.push(`- Interface: \`${STRADA_API.componentApi.interface}\``);
    lines.push(`- Struct layout: \`${STRADA_API.componentApi.structLayout}\``);
    lines.push(`- Constraint: \`${STRADA_API.componentApi.constraint}\``);
    lines.push(`- Max query components: ${STRADA_API.componentApi.maxQueryComponents}`);
    lines.push('');

    // Module API
    lines.push('## Module API\n');
    lines.push('- Configure methods:');
    for (const m of STRADA_API.moduleApi.configureMethods) {
      lines.push(`  - \`${m}\``);
    }
    lines.push('- Lifecycle methods:');
    for (const m of STRADA_API.moduleApi.lifecycleMethods) {
      lines.push(`  - \`${m}\``);
    }
    lines.push(`- System entry: \`${STRADA_API.moduleApi.systemEntry}\``);
    lines.push(`- Service entry: \`${STRADA_API.moduleApi.serviceEntry}\``);
    lines.push('');

    // Sync API
    lines.push('## Sync API\n');
    lines.push(`- ReactiveProperty: \`${STRADA_API.syncApi.reactiveProperty}\``);
    lines.push(`- ReactiveCollection: \`${STRADA_API.syncApi.reactiveCollection}\``);
    lines.push(`- ComputedProperty: \`${STRADA_API.syncApi.computedProperty}\``);
    lines.push('- Sync events:');
    for (const e of STRADA_API.syncApi.syncEvents) {
      lines.push(`  - \`${e}\``);
    }
    lines.push('');

    // Communication API
    lines.push('## Communication API\n');
    lines.push(`- Publish: \`${STRADA_API.communicationApi.publish}\``);
    lines.push(`- Subscribe: \`${STRADA_API.communicationApi.subscribe}\``);
    lines.push(`- Send: \`${STRADA_API.communicationApi.send}\``);
    lines.push(`- Query: \`${STRADA_API.communicationApi.query}\``);
    lines.push('');

    // Assembly References
    lines.push('## Assembly References\n');
    lines.push(`- Core: \`${STRADA_API.assemblyReferences.core}\``);

    return {
      uri: this.uri,
      mimeType: 'text/markdown',
      text: lines.join('\n'),
    };
  }
}
