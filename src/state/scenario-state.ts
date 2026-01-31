import { EventEmitter } from 'node:events';

export class ScenarioState extends EventEmitter {
  private currentScenario?: string;

  public get(): string | undefined {
    return this.currentScenario;
  }

  public set(next?: string): void {
    this.currentScenario = next || undefined;
    this.emit('change', this.currentScenario);
  }
}
