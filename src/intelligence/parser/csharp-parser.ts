import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// tree-sitter is a native module; use createRequire for ESM compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('tree-sitter');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CSharp = require('tree-sitter-c-sharp');

export interface CSharpParam {
  name: string;
  type: string;
  modifier?: string;
}

export interface CSharpNode {
  type:
    | 'class'
    | 'struct'
    | 'interface'
    | 'enum'
    | 'method'
    | 'field'
    | 'property'
    | 'namespace'
    | 'using';
  name: string;
  modifiers: string[];
  attributes: string[];
  baseTypes: string[];
  genericParams: string[];
  parameters?: CSharpParam[];
  children: CSharpNode[];
  startLine: number;
  endLine: number;
}

// Tree-sitter node types we care about
type TSNode = {
  type: string;
  text: string;
  childCount: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  child(index: number): TSNode;
  childForFieldName?(name: string): TSNode | null;
  children: TSNode[];
};

const TYPE_DECLARATION_KINDS = new Set([
  'class_declaration',
  'struct_declaration',
  'interface_declaration',
  'enum_declaration',
]);

const MEMBER_KINDS = new Set([
  'field_declaration',
  'method_declaration',
  'property_declaration',
  'constructor_declaration',
]);

const TYPE_MAP: Record<string, CSharpNode['type']> = {
  class_declaration: 'class',
  struct_declaration: 'struct',
  interface_declaration: 'interface',
  enum_declaration: 'enum',
  field_declaration: 'field',
  method_declaration: 'method',
  property_declaration: 'property',
  constructor_declaration: 'method',
};

export class CSharpParser {
  private parser: InstanceType<typeof Parser>;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(CSharp);
  }

  /**
   * Parse C# source code into an array of structured CSharpNode.
   * Top-level nodes include using directives, namespaces, and type declarations.
   */
  parse(code: string): CSharpNode[] {
    if (!code.trim()) return [];

    const tree = this.parser.parse(code);
    return this.visitChildren(tree.rootNode as TSNode);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private visitChildren(parent: TSNode): CSharpNode[] {
    const results: CSharpNode[] = [];
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      const node = this.visitNode(child);
      if (node) results.push(node);
    }
    return results;
  }

  private visitNode(node: TSNode): CSharpNode | null {
    if (node.type === 'using_directive') {
      return this.visitUsing(node);
    }
    if (node.type === 'namespace_declaration') {
      return this.visitNamespace(node);
    }
    if (TYPE_DECLARATION_KINDS.has(node.type)) {
      return this.visitTypeDeclaration(node);
    }
    if (MEMBER_KINDS.has(node.type)) {
      return this.visitMember(node);
    }
    return null;
  }

  private visitUsing(node: TSNode): CSharpNode {
    // Children: 'using', name_node, ';'
    const nameNode = this.findChild(node, [
      'identifier',
      'qualified_name',
    ]);
    return {
      type: 'using',
      name: nameNode ? this.extractQualifiedName(nameNode) : '',
      modifiers: [],
      attributes: [],
      baseTypes: [],
      genericParams: [],
      children: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private visitNamespace(node: TSNode): CSharpNode {
    const nameNode = this.findChild(node, [
      'identifier',
      'qualified_name',
    ]);
    const declList = this.findChild(node, ['declaration_list']);
    const children = declList ? this.visitChildren(declList) : [];

    return {
      type: 'namespace',
      name: nameNode ? this.extractQualifiedName(nameNode) : '',
      modifiers: [],
      attributes: [],
      baseTypes: [],
      genericParams: [],
      children,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private visitTypeDeclaration(node: TSNode): CSharpNode {
    const type = TYPE_MAP[node.type] as CSharpNode['type'];
    const modifiers = this.extractModifiers(node);
    const attributes = this.extractAttributes(node);
    const name = this.extractIdentifierName(node);
    const baseTypes = this.extractBaseTypes(node);
    const genericParams = this.extractGenericParams(node);

    const declList = this.findChild(node, ['declaration_list']);
    const children: CSharpNode[] = [];

    if (declList) {
      for (let i = 0; i < declList.childCount; i++) {
        const child = declList.child(i);
        if (TYPE_DECLARATION_KINDS.has(child.type)) {
          const nested = this.visitTypeDeclaration(child);
          children.push(nested);
        } else if (MEMBER_KINDS.has(child.type)) {
          const member = this.visitMember(child);
          if (member) children.push(member);
        }
      }
    }

    return {
      type,
      name,
      modifiers,
      attributes,
      baseTypes,
      genericParams,
      children,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private visitMember(node: TSNode): CSharpNode | null {
    const type = TYPE_MAP[node.type];
    if (!type) return null;

    const modifiers = this.extractModifiers(node);
    const attributes = this.extractAttributes(node);

    if (type === 'field') {
      return this.visitField(node, modifiers, attributes);
    }
    if (type === 'method') {
      return this.visitMethod(node, modifiers, attributes);
    }
    if (type === 'property') {
      return this.visitProperty(node, modifiers, attributes);
    }
    return null;
  }

  private visitField(
    node: TSNode,
    modifiers: string[],
    attributes: string[],
  ): CSharpNode {
    // field_declaration -> variable_declaration -> variable_declarator -> identifier
    const varDecl = this.findChild(node, ['variable_declaration']);
    let name = '';
    if (varDecl) {
      const declarator = this.findChild(varDecl, ['variable_declarator']);
      if (declarator) {
        const id = this.findChild(declarator, ['identifier']);
        name = id ? id.text : '';
      }
    }

    return {
      type: 'field',
      name,
      modifiers,
      attributes,
      baseTypes: [],
      genericParams: [],
      children: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private visitMethod(
    node: TSNode,
    modifiers: string[],
    attributes: string[],
  ): CSharpNode {
    const name = this.extractIdentifierName(node);
    const parameters = this.extractParameters(node);

    return {
      type: 'method',
      name,
      modifiers,
      attributes,
      baseTypes: [],
      genericParams: [],
      parameters,
      children: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private visitProperty(
    node: TSNode,
    modifiers: string[],
    attributes: string[],
  ): CSharpNode {
    const name = this.extractIdentifierName(node);

    return {
      type: 'property',
      name,
      modifiers,
      attributes,
      baseTypes: [],
      genericParams: [],
      children: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  // -----------------------------------------------------------------------
  // Extraction helpers
  // -----------------------------------------------------------------------

  private extractModifiers(node: TSNode): string[] {
    const mods: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'modifier') {
        // modifier has one child: 'public', 'private', etc.
        if (child.childCount > 0) {
          mods.push(child.child(0).text);
        } else {
          mods.push(child.text);
        }
      }
    }
    return mods;
  }

  private extractAttributes(node: TSNode): string[] {
    const attrs: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'attribute_list') {
        for (let j = 0; j < child.childCount; j++) {
          const attrChild = child.child(j);
          if (attrChild.type === 'attribute') {
            // attribute -> identifier (the attribute name)
            const id = this.findChild(attrChild, ['identifier']);
            if (id) attrs.push(id.text);
          }
        }
      }
    }
    return attrs;
  }

  private extractIdentifierName(node: TSNode): string {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') {
        return child.text;
      }
    }
    return '';
  }

  private extractBaseTypes(node: TSNode): string[] {
    const baseList = this.findChild(node, ['base_list']);
    if (!baseList) return [];

    const types: string[] = [];
    for (let i = 0; i < baseList.childCount; i++) {
      const child = baseList.child(i);
      if (child.type === 'identifier') {
        types.push(child.text);
      } else if (child.type === 'generic_name') {
        // generic_name -> identifier + type_argument_list
        const id = this.findChild(child, ['identifier']);
        if (id) types.push(id.text);
      } else if (child.type === 'qualified_name') {
        types.push(this.extractQualifiedName(child));
      }
    }
    return types;
  }

  private extractGenericParams(node: TSNode): string[] {
    const typeParamList = this.findChild(node, ['type_parameter_list']);
    if (!typeParamList) return [];

    const params: string[] = [];
    for (let i = 0; i < typeParamList.childCount; i++) {
      const child = typeParamList.child(i);
      if (child.type === 'type_parameter') {
        const id = this.findChild(child, ['identifier']);
        if (id) params.push(id.text);
      }
    }
    return params;
  }

  private extractParameters(node: TSNode): CSharpParam[] {
    const paramList = this.findChild(node, ['parameter_list']);
    if (!paramList) return [];

    const params: CSharpParam[] = [];
    for (let i = 0; i < paramList.childCount; i++) {
      const child = paramList.child(i);
      if (child.type === 'parameter') {
        const param = this.extractSingleParam(child);
        if (param) params.push(param);
      }
    }
    return params;
  }

  private extractSingleParam(node: TSNode): CSharpParam | null {
    let modifier: string | undefined;
    let typeName = '';
    let paramName = '';

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'modifier') {
        modifier = child.text;
      } else if (child.type === 'identifier') {
        // Last identifier is the param name; previous identifiers would be user-defined types
        paramName = child.text;
      } else if (
        child.type === 'predefined_type' ||
        child.type === 'generic_name' ||
        child.type === 'array_type' ||
        child.type === 'nullable_type' ||
        child.type === 'qualified_name'
      ) {
        typeName = child.text;
      }
    }

    // Handle case where type is an identifier (user-defined type like MyClass)
    // In this case we have: [modifier] identifier(type) identifier(name)
    // We need to distinguish type identifier from name identifier
    if (!typeName) {
      const identifiers: TSNode[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'identifier') identifiers.push(child);
      }
      if (identifiers.length >= 2) {
        typeName = identifiers[0].text;
        paramName = identifiers[1].text;
      }
    }

    if (!paramName) return null;

    const result: CSharpParam = { name: paramName, type: typeName };
    if (modifier) result.modifier = modifier;
    return result;
  }

  private extractQualifiedName(node: TSNode): string {
    if (node.type === 'identifier') return node.text;
    if (node.type === 'qualified_name') {
      // qualified_name -> qualified_name/identifier '.' identifier
      const parts: string[] = [];
      this.collectQualifiedParts(node, parts);
      return parts.join('.');
    }
    return node.text;
  }

  private collectQualifiedParts(node: TSNode, parts: string[]): void {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') {
        parts.push(child.text);
      } else if (child.type === 'qualified_name') {
        this.collectQualifiedParts(child, parts);
      }
      // Skip '.' nodes
    }
  }

  private findChild(
    node: TSNode,
    types: string[],
  ): TSNode | null {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (types.includes(child.type)) return child;
    }
    return null;
  }
}
