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


  debug: Boolean(JSON.parse(extract('PIPELAIN_DEBUG', 'false'))),

  model: extract('PIPELAIN_MODEL', 'gemini-flash-latest'),
  provider: extract('PIPELAIN_PROVIDER'),

  dirs: {
    skills: extract('PIPELAIN_SKILLS_DIR', path.join(process.env.HOME ?? '~', '.agents/skills')),
    tasks: extract('PIPELAIN_TASKS_DIR'),
  },

  langfuse: {
    url: extract('LANGFUSE_BASE_URL'),

    keys: {
      public: extract('LANGFUSE_PUBLIC_KEY'),
      secret: extract('LANGFUSE_SECRET_KEY'),
    },
  },
};
