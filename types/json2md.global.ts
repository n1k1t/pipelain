import 'json2md';

declare module 'json2md' {
  namespace DefaultConverters {
    interface Converters {
      plain: string;

      file: {
        content: string;

        title?: string;
        path?: string;
      };
    }
  }
}
