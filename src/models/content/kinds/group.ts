import { Content, TContentLocation } from './model';

export class GroupContent extends Content<'group', Content[]> {
  public render(): string {
    return this.payload.map((content) => content.render()).join('\n\n');
  }

  public flat(): Content[] {
    return this.payload.reduce<Content[]>((acc, content) => {
      if (content instanceof GroupContent) {
        return acc.concat(content.flat());
      }

      acc.push(content);
      return acc;
    }, []);
  }

  public relocate(location: TContentLocation): this {
    this.payload.forEach((content) => content.relocate(location));
    return this;
  }

  public clone(): GroupContent {
    return GroupContent.build(this.payload);
  }

  static build(payload: GroupContent['TSchema']): GroupContent {
    return new GroupContent('group', payload);
  }
}
