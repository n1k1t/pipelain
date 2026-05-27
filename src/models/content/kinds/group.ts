import { Content } from './model';

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

  static build(payload: GroupContent['TSchema']): GroupContent {
    return new GroupContent('group', payload);
  }
}
