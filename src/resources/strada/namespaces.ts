import type { IResource, ResourceContent, ResourceMetadata } from '../resource.interface.js';
import { STRADA_API } from '../../context/strada-api-reference.js';

export class NamespacesResource implements IResource {
  readonly uri = 'strada://namespaces';
  readonly name = 'Strada.Core Namespaces';
  readonly metadata: ResourceMetadata = {
    requiresBridge: false,
    description: 'Strada.Core namespace hierarchy as JSON',
  };

  async read(): Promise<ResourceContent> {
    const hierarchy = buildNamespaceHierarchy();
    return {
      uri: this.uri,
      mimeType: 'application/json',
      text: JSON.stringify(hierarchy, null, 2),
    };
  }
}

interface NamespaceNode {
  name: string;
  fullPath: string;
  children: NamespaceNode[];
}

function buildNamespaceHierarchy(): NamespaceNode {
  const root: NamespaceNode = {
    name: 'Strada.Core',
    fullPath: STRADA_API.namespaces.root,
    children: [],
  };

  const nodeMap = new Map<string, NamespaceNode>();
  nodeMap.set(STRADA_API.namespaces.root, root);

  // Sort namespaces by depth (shortest first) so parents are created first
  const entries = Object.entries(STRADA_API.namespaces)
    .filter(([key]) => key !== 'root')
    .sort(([, a], [, b]) => a.split('.').length - b.split('.').length);

  for (const [, fullPath] of entries) {
    const parts = fullPath.split('.');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('.');

    const node: NamespaceNode = { name, fullPath, children: [] };
    nodeMap.set(fullPath, node);

    const parent = nodeMap.get(parentPath);
    if (parent) {
      parent.children.push(node);
    }
  }

  return root;
}
