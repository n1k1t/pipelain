import { DataObject } from 'json2md';

export interface IJson2MdDataObjectExtension {
  plain: string;

  file: {
    content: string;

    title?: string;
    path?: string;
  };
}

export interface IJsonContent extends DataObject, Partial<IJson2MdDataObjectExtension> {}
