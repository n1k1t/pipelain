interface IImgInput {
  title: string;
  source: string;
}

interface ICodeInput {
  language?: string | undefined;
  content: string | string[];
}

interface ITableInput {
  headers: string[];
  rows: Array<{ [column: string]: string }> | string[][];
}

export interface IJson2MdDataObjectExtension {
  plain: string;

  file: {
    content: string;

    title?: string;
    path?: string;
  };
}

export interface IJsonContent extends Partial<IJson2MdDataObjectExtension> {
  blockquote?: string | string[];
  h1?: string | string[];
  h2?: string | string[];
  h3?: string | string[];
  h4?: string | string[];
  h5?: string | string[];
  h6?: string | string[];
  ul?: string[];
  ol?: string[];
  p?: string | string[];

  table?: ITableInput;
  code?: ICodeInput;
  img?: IImgInput | IImgInput[];
}
