/// <reference types="@remix-run/node" />
/// <reference types="vite/client" />

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SHOPIFY_API_KEY: string;
      SHOPIFY_API_SECRET: string;
      SHOPIFY_APP_URL: string;
      SCOPES: string;
      DATABASE_URL: string;
      REDIS_URL: string;
      APP_ENCRYPTION_KEY: string;
      SESSION_SECRET: string;
      PORT?: string;
    }
  }
}

export {};
