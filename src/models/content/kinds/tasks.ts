import json2md, { DataObject } from 'json2md';

import { Content } from './model';
import { cast } from '../../../utils';

export class TasksContent extends Content<'tasks', string[]> {
  public render(): string {
    return json2md(
      cast<DataObject>({ ol: this.payload })
    );
  }

  static build(payload: TasksContent['TSchema']): TasksContent {
    return new TasksContent('tasks', payload);
  }
}
