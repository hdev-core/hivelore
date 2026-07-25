import { env } from '../../config/env.js';
import { HafClient } from './haf-client.js';
import { HiveWaxClient } from './wax-client.js';

export function createHiveWaxClient() {
  return new HiveWaxClient({
    apiEndpoint: env.HIVE_RPC_URL,
    appName: env.HIVELORE_APP_ID,
  });
}

export function createHafClient() {
  return new HafClient({
    baseUrl: env.HAF_API_URL,
  });
}
