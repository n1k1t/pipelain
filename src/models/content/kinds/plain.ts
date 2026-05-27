import { Content } from './model';

export class PlainContent extends Content<'plain', string> {
  public render(): string {
    const char = this.payload.match(/[^\s]/)?.[0] ?? '';
    const offset = this.payload.replace('\n', '').indexOf(char) ?? 0;

    return this.payload
      .split('\n')
      .map((line) => line.slice(offset)).join('\n');
  }

  static build(payload: PlainContent['TSchema']): PlainContent {
    return new PlainContent('plain', payload);
  }
}
