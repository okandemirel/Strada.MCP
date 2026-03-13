export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface ResourceMetadata {
  requiresBridge: boolean;
  description: string;
}

export interface IResource {
  readonly uri: string;
  readonly name: string;
  readonly metadata: ResourceMetadata;
  read(params?: Record<string, string>): Promise<ResourceContent>;
}
