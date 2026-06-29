import 'json2md';
import type { IJson2MdDataObjectExtension } from '../src/models/content/types';

declare module 'json2md' {
  namespace DefaultConverters {
    interface Converters extends IJson2MdDataObjectExtension {}
  }
}
