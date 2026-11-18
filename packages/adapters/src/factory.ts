import type { AppConfig } from '@realcognix/core';
import type { LLMProvider } from './llm/types.js';
import { OpenAICompatibleLLM } from './llm/openai-compatible.js';
import { DisabledLLM } from './llm/disabled.js';
import type { MessageChannel } from './messaging/types.js';
import { WhatsAppCloudChannel } from './messaging/whatsapp-cloud.js';
import { ConsoleChannel } from './messaging/console.js';
import type { EmailProvider } from './email/types.js';
import { SmtpEmailProvider } from './email/smtp.js';
import { ConsoleEmailProvider } from './email/console.js';
import { MetaLeadAdsSource } from './lead-sources/meta-lead-ads.js';
import { WebsiteFormSource } from './lead-sources/website-form.js';
import { PortalEmailSource } from './lead-sources/portal-email.js';
import type { AdPlatform } from './ads/types.js';
import { MetaMarketingAds } from './ads/meta-marketing.js';
import { GoogleAdsPlatform } from './ads/google-ads.js';
import type { StorageProvider } from './storage/types.js';
import { LocalStorage } from './storage/local.js';

export interface Adapters {
  llm: LLMProvider;
  whatsapp: MessageChannel;
  email: EmailProvider;
  leadSources: {
    metaLeadAds: MetaLeadAdsSource;
    websiteForm: WebsiteFormSource;
    portalEmail: PortalEmailSource;
  };
  ads: Partial<Record<'meta' | 'google', AdPlatform>>;
  storage: StorageProvider;
}

/**
 * Provider registries. To add a vendor: implement the interface, add one entry here,
 * and select it with the matching env var (e.g. WHATSAPP_PROVIDER=gupshup). No business logic changes.
 */
const llmProviders: Record<AppConfig['LLM_PROVIDER'], (c: AppConfig) => LLMProvider> = {
  openai_compatible: (c) =>
    new OpenAICompatibleLLM({ baseURL: c.LLM_BASE_URL, apiKey: c.LLM_API_KEY, model: c.LLM_MODEL, embedModel: c.LLM_EMBED_MODEL }),
  none: () => new DisabledLLM(),
};

const whatsappProviders: Record<AppConfig['WHATSAPP_PROVIDER'], (c: AppConfig) => MessageChannel> = {
  whatsapp_cloud: (c) =>
    new WhatsAppCloudChannel({
      phoneNumberId: c.WHATSAPP_PHONE_NUMBER_ID ?? '',
      accessToken: c.WHATSAPP_ACCESS_TOKEN ?? '',
      appSecret: c.WHATSAPP_APP_SECRET,
      verifyToken: c.WHATSAPP_VERIFY_TOKEN,
      graphVersion: c.WHATSAPP_GRAPH_VERSION,
      defaultLanguage: c.WHATSAPP_TEMPLATE_LANG,
    }),
  console: (c) => new ConsoleChannel(c.WHATSAPP_VERIFY_TOKEN),
};

const emailProviders: Record<AppConfig['EMAIL_PROVIDER'], (c: AppConfig) => EmailProvider> = {
  smtp: (c) =>
    new SmtpEmailProvider({ host: c.SMTP_HOST, port: c.SMTP_PORT, secure: c.SMTP_SECURE, user: c.SMTP_USER, pass: c.SMTP_PASS, from: c.EMAIL_FROM }),
  console: () => new ConsoleEmailProvider(),
};

const storageProviders: Record<AppConfig['STORAGE_PROVIDER'], (c: AppConfig) => StorageProvider> = {
  local: (c) => new LocalStorage(c.STORAGE_LOCAL_DIR, c.PUBLIC_API_URL),
};

export function createAdapters(config: AppConfig): Adapters {
  const ads: Adapters['ads'] = {};
  if (config.ADS_META_ENABLED) {
    ads.meta = new MetaMarketingAds({
      accessToken: config.META_ADS_ACCESS_TOKEN ?? '',
      adAccountId: config.META_AD_ACCOUNT_ID ?? '',
      graphVersion: config.META_GRAPH_VERSION,
    });
  }
  if (config.ADS_GOOGLE_ENABLED) {
    ads.google = new GoogleAdsPlatform({
      developerToken: config.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
      customerId: config.GOOGLE_ADS_CUSTOMER_ID ?? '',
      loginCustomerId: config.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      accessToken: config.GOOGLE_ADS_OAUTH_ACCESS_TOKEN ?? '',
    });
  }

  return {
    llm: llmProviders[config.LLM_PROVIDER](config),
    whatsapp: whatsappProviders[config.WHATSAPP_PROVIDER](config),
    email: emailProviders[config.EMAIL_PROVIDER](config),
    leadSources: {
      metaLeadAds: new MetaLeadAdsSource({
        appSecret: config.META_APP_SECRET,
        verifyToken: config.META_VERIFY_TOKEN,
        pageAccessToken: config.META_PAGE_ACCESS_TOKEN,
        graphVersion: config.META_GRAPH_VERSION,
      }),
      websiteForm: new WebsiteFormSource(),
      portalEmail: new PortalEmailSource(),
    },
    ads,
    storage: storageProviders[config.STORAGE_PROVIDER](config),
  };
}
