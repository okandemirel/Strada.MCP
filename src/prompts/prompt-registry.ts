import type { IPrompt } from './prompt.interface.js';

export class PromptRegistry {
  private readonly prompts = new Map<string, IPrompt>();

  register(prompt: IPrompt): void {
    if (this.prompts.has(prompt.name)) {
      throw new Error(`Prompt "${prompt.name}" already registered`);
    }
    this.prompts.set(prompt.name, prompt);
  }

  get(name: string): IPrompt | undefined {
    return this.prompts.get(name);
  }

  getAll(): IPrompt[] {
    return Array.from(this.prompts.values());
  }
}
