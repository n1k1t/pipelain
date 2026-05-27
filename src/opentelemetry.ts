import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';

import env from './env';

const sdk = new NodeSDK({
  spanProcessors: [
    new LangfuseSpanProcessor({
      baseUrl: env.langfuse.url,

      publicKey: env.langfuse.keys.public,
      secretKey: env.langfuse.keys.secret,
    }),
  ],
});

sdk.start();
