import json2md from 'json2md';

import { Content, TContentLocation } from './model';
import { IJsonContent } from '../types';
import { cast } from '../../../utils';

export class TasksContent extends Content<'tasks', string[]> {
  public location: TContentLocation = 'user';

  public render(): string {
    return json2md(
      cast<IJsonContent>({ ol: this.payload })
    );
  }

  public clone(): TasksContent {
    return TasksContent.build(this.payload);
  }

  static build(payload: TasksContent['TSchema']): TasksContent {
    return new TasksContent('tasks', payload);
  }
}
