export type TContentType = 'attachment' | 'article' | 'tasks' | 'rules' | 'sources' | 'group' | 'plain';

export abstract class Content<K extends TContentType = TContentType, TSchema = unknown> {
  public TSchema!: TSchema;

  constructor(public type: K, public payload: TSchema) {}

  /** Renders content to string */
  public abstract render(): string;
}
