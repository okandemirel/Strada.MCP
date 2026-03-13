/** Known Unity class IDs -> human-readable type names */
const UNITY_CLASS_MAP: Record<number, string> = {
  1: 'GameObject',
  2: 'Component',
  4: 'Transform',
  8: 'Behaviour',
  20: 'Camera',
  21: 'Material',
  23: 'MeshRenderer',
  25: 'Renderer',
  28: 'Texture2D',
  29: 'OcclusionCullingSettings',
  33: 'MeshFilter',
  43: 'Mesh',
  48: 'Shader',
  54: 'Rigidbody',
  64: 'MeshCollider',
  65: 'BoxCollider',
  68: 'SphereCollider',
  70: 'CapsuleCollider',
  82: 'AudioSource',
  83: 'AudioListener',
  87: 'ParticleSystem',
  91: 'MonoScript',
  95: 'Animator',
  102: 'TextAsset',
  104: 'RenderSettings',
  108: 'Light',
  111: 'LightmapSettings',
  114: 'MonoBehaviour',
  115: 'ScriptableObject',
  120: 'LineRenderer',
  128: 'NavMeshSettings',
  136: 'Terrain',
  157: 'LightProbes',
  196: 'NavMeshAgent',
  198: 'NavMeshObstacle',
  205: 'LODGroup',
  212: 'SpriteRenderer',
  218: 'Tilemap',
  220: 'TilemapRenderer',
  222: 'Canvas',
  223: 'CanvasRenderer',
  224: 'RectTransform',
  225: 'CanvasGroup',
  226: 'Image',
  228: 'Text',
  258: 'EventSystem',
  290: 'ReflectionProbe',
  1001: 'Prefab',
  1101: 'PrefabInstance',
};

export interface UnityObject {
  classId: number;
  fileId: number;
  typeName: string;
  properties: Record<string, unknown>;
  rawYaml: string;
}

export type UnityDocument = UnityObject;

/**
 * Parses Unity YAML content (scene, prefab, material, etc.) into structured objects.
 * Unity uses a custom YAML format with `--- !u!{classId} &{fileId}` document separators.
 */
export function parseUnityYaml(content: string): UnityDocument[] {
  if (!content.trim()) return [];

  const documents: UnityDocument[] = [];
  const docRegex = /^--- !u!(\d+) &(\d+)/gm;
  const matches: { classId: number; fileId: number; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = docRegex.exec(content)) !== null) {
    matches.push({
      classId: parseInt(match[1], 10),
      fileId: parseInt(match[2], 10),
      index: match.index,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const rawYaml = content.slice(start, end).trim();

    const lines = rawYaml.split('\n');
    // First line is `--- !u!XX &YY`, second line is `TypeName:`
    const typeLine = lines[1]?.trim() ?? '';
    const parsedTypeName = typeLine.endsWith(':') ? typeLine.slice(0, -1) : typeLine;
    const typeName =
      UNITY_CLASS_MAP[matches[i].classId] ?? (parsedTypeName || `Unknown_${matches[i].classId}`);

    const properties = parseProperties(lines.slice(2));

    documents.push({
      classId: matches[i].classId,
      fileId: matches[i].fileId,
      typeName,
      properties,
      rawYaml,
    });
  }

  return documents;
}

/** Extracts top-level key-value properties from Unity YAML indented block */
function parseProperties(lines: string[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Array item (can be at indent 2 or deeper in Unity YAML)
    if (trimmed.startsWith('- ') && currentKey) {
      if (!currentArray) currentArray = [];
      currentArray.push(parseValue(trimmed.slice(2).trim()));
    }
    // Top-level property (2-space indent in Unity YAML)
    else if (indent === 2 || indent === 0) {
      // Flush any pending array
      if (currentKey && currentArray) {
        props[currentKey] = currentArray;
        currentArray = null;
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value === '' || value === '[]') {
        currentKey = key;
        if (value === '[]') {
          props[key] = [];
          currentKey = null;
        }
      } else {
        props[key] = parseValue(value);
        currentKey = key;
        currentArray = null;
      }
    }
  }

  // Flush final array
  if (currentKey && currentArray) {
    props[currentKey] = currentArray;
  }

  return props;
}

/** Parse a Unity YAML value (handles inline objects, numbers, strings) */
function parseValue(value: string): unknown {
  // Inline object: {x: 0, y: 1, z: -10}
  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1);
    const obj: Record<string, unknown> = {};
    const pairs = inner.split(',');
    for (const pair of pairs) {
      const [k, ...rest] = pair.split(':');
      if (k && rest.length > 0) {
        obj[k.trim()] = parseScalar(rest.join(':').trim());
      }
    }
    return obj;
  }
  return parseScalar(value);
}

/** Parse scalar value (number, boolean, string) */
function parseScalar(value: string): string | number | boolean {
  if (value === '1' || value === '0') return parseInt(value, 10);
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  return value;
}
