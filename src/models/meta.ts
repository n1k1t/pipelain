import { buildTimeSpendMarker } from '../utils';

export class Meta {
  public TPlain!: Pick<Meta, 'timestamp' | 'spent' | 'state'>;

  public timestamp: number = Date.now();
  public spent: number = 0;

  public state: 'INIT' | 'PENDING' | 'DONE' | 'ERROR' = 'INIT';

  private marker = buildTimeSpendMarker(this.timestamp);

  public is(predicate: Meta['state'] | Meta['state'][]): boolean {
    return [predicate].flat().includes(this.state);
  }

  public actualize(state: Meta['state']): this {
    this.state = state;
    this.spent = this.marker();

    return this;
  }

  public toPlain(): Meta['TPlain'] {
    return {
      timestamp: this.timestamp,
      spent: this.spent,

      state: this.state,
    };
  }

  static build(): Meta {
    return new Meta();
  }
}
