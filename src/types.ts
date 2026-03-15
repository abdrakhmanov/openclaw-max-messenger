export interface MaxAccountConfig {
  token: string;
  botId?: string;
  allowedUpdates?: string[];
  accountId?: string | null;
  dmPolicy?: string;
  allowFrom?: Array<string | number>;
}

export interface MaxChannelsConfig {
  channels?: {
    max?: {
      accounts?: Record<string, MaxAccountConfig>;
    };
  };
}

export interface MaxOutboundContext {
  text: string;
  accountId: string;
  chatId: string;
  userId?: string;
  messageId?: string;
  account: MaxAccountConfig;
}

export type MediaType = "image" | "video" | "audio" | "file";

export interface MaxMediaContext {
  accountId: string;
  chatId: string;
  account: MaxAccountConfig;
  type: MediaType;
  url?: string;
  source?: string | Buffer;
  text?: string;
}

export interface InboundAttachment {
  type: MediaType | "sticker" | "contact" | "location" | "share";
  url?: string;
  token?: string;
  filename?: string;
  size?: number;
}

export interface InboundMessage {
  channel: string;
  accountId: string;
  chatId: string;
  userId: string;
  messageId: string;
  text: string;
  timestamp: number;
  username?: string;
  displayName?: string;
  isGroup?: boolean;
  attachments?: InboundAttachment[];
  payload?: Record<string, unknown>;
}

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}
