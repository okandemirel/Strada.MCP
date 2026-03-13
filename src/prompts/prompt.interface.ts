export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface IPrompt {
  readonly name: string;
  readonly description: string;
  readonly arguments: PromptArgument[];
  render(args: Record<string, string>): Promise<PromptMessage[]>;
}
