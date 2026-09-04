export type TContentType = 'attachment' | 'article' | 'tasks' | 'rules' | 'sources' | 'group' | 'plain';
export type TContentLocation = 'system' | 'user';

export abstract class Content<K extends TContentType = TContentType, TSchema = unknown> {
  public TSchema!: TSchema;
  public location?: TContentLocation;

  constructor(public type: K, public payload: TSchema) {}

  /** Renders content to string */
  public abstract render(): string;
  public abstract clone(): Content<K, TSchema>;

  /** Creates clone and redefines prompt content location */
  public relocate(location: TContentLocation): this {
    const clone = this.clone();

    clone.location = location;
    return <this>clone;
  }
}
