import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

let client = null;

export function getAnthropic() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}
