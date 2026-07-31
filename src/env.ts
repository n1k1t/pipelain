import dotenv from 'dotenv';
import path from 'path';

interface IExtractOverload {
  <T extends string>(name: string, fallback: NoInfer<T>): T;
  <T extends string>(name: string): T | undefined;
}

const config = dotenv.config();

const extract = <IExtractOverload>((name: string, fallback: unknown) => {
  if (config.parsed?.[name]?.length) {
    return config.parsed[name];
  }
  if (process.env[name]?.length) {
    return process.env[name];
  }

  return fallback;
});

export default {
  key: extract('PIPELAIN_API_KEY'),
  url: extract('PIPELAIN_API_URL'),

  model: extract('PIPELAIN_MODEL', 'gemini-flash-latest'),
  provider: extract('PIPELAIN_PROVIDER'),

  flags: {
    report: Boolean(JSON.parse(extract('PIPELAIN_FLAGS_REPORT', 'false'))),
    debug: Boolean(JSON.parse(extract('PIPELAIN_FLAGS_DEBUG', 'false'))),
  },

  dirs: {
    skills: extract(
      'PIPELAIN_SKILLS_PATHS',
      ['./.agents/skills', path.join(process.env.HOME ?? '~', '.agents/skills')].join(';')
    ).split(';'),

    assets: path.resolve(
      path.resolve(__dirname, path.parse(__filename).ext === '.ts' ? '' : '../', '../'),
      'assets'
    ),
  },

  exa: {
    key: extract('EXA_API_KEY'),
  },

  langfuse: {
    url: extract('LANGFUSE_BASE_URL'),

    keys: {
      public: extract('LANGFUSE_PUBLIC_KEY'),
      secret: extract('LANGFUSE_SECRET_KEY'),
    },
  },
};
