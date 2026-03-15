import { Bot } from "@maxhub/max-bot-api";
import type { RuntimeEnv } from "openclaw/plugin-sdk";
import { handleMaxInbound } from "./inbound.js";
import { registerBot, unregisterBot } from "./registry.js";
import { recordLastUsedContext } from "./send-file-tool.js";
import type { MaxAccountConfig, InboundAttachment, PluginLogger } from "./types.js";

interface RawAttachment {
  type: string;
  payload?: { url?: string; token?: string };
  filename?: string;
  size?: number;
}

const SUPPORTED_ATTACHMENT_TYPES = new Set([
  "image", "video", "audio", "file", "sticker", "contact", "location", "share",
]);

export function extractAttachments(
  rawAttachments: RawAttachment[] | null | undefined
): InboundAttachment[] | undefined {
  if (!rawAttachments?.length) return undefined;

  const result = rawAttachments
    .filter((a) => SUPPORTED_ATTACHMENT_TYPES.has(a.type))
    .map((a): InboundAttachment => {
      const attachment: InboundAttachment = {
        type: a.type as InboundAttachment["type"],
        url: a.payload?.url,
        token: a.payload?.token,
      };

      if (a.type === "file") {
        attachment.filename = a.filename;
        attachment.size = a.size;
      }

      return attachment;
    });

  return result.length ? result : undefined;
}

const activeBots = new Map<string, { bot: Bot; token: string }>();

export async function startPolling(params: {
  accounts: Record<string, MaxAccountConfig>;
  logger: PluginLogger;
  runtime?: RuntimeEnv;
}): Promise<void> {
  const { accounts, logger, runtime } = params;

  for (const [accountId, config] of Object.entries(accounts)) {
    if (activeBots.has(accountId)) {
      logger.warn(`Polling already active for account "${accountId}"`);
      continue;
    }

    const bot = new Bot(config.token);

    bot.on("message_created", (ctx) => {
      const chatId = ctx.chatId;
      const userId = (ctx.user as Record<string, unknown> | undefined)?.user_id as number | undefined;
      const messageId = ctx.messageId;

      if (!chatId || !userId) return;

      // Ignore messages sent by the bot itself
      if (ctx.myId && userId === ctx.myId) return;

      const text = ctx.message?.body?.text ?? "";
      const attachments = extractAttachments(
        ctx.message?.body?.attachments as RawAttachment[] | null
      );

      if (!text && !attachments?.length) return;

      recordLastUsedContext(chatId, config.token);

      handleMaxInbound({
        message: {
          channel: "max",
          accountId,
          chatId: String(chatId),
          userId: String(userId),
          messageId: String(messageId),
          text,
          timestamp: Date.now(),
          username: (ctx.user as Record<string, unknown> | undefined)?.username as string | undefined,
          displayName: (ctx.user as Record<string, unknown> | undefined)?.name as string | undefined,
          isGroup: ctx.chat?.type !== "dialog",
          attachments,
          payload: { update: ctx.update },
        },
        account: config,
        accountId,
        runtime,
      }).catch((err) => {
        logger.error(`Max inbound handling error (${accountId}):`, err);
      });
    });

    bot.on("bot_started", (ctx) => {
      const userId = (ctx.user as Record<string, unknown> | undefined)?.user_id as number | undefined;
      const chatId = ctx.chatId;

      if (!userId || !chatId) return;

      handleMaxInbound({
        message: {
          channel: "max",
          accountId,
          chatId: String(chatId),
          userId: String(userId),
          messageId: `start_${Date.now()}`,
          text: "/start",
          timestamp: Date.now(),
          username: (ctx.user as Record<string, unknown> | undefined)?.username as string | undefined,
          displayName: (ctx.user as Record<string, unknown> | undefined)?.name as string | undefined,
          payload: {
            startPayload: ctx.startPayload,
            update: ctx.update,
          },
        },
        account: config,
        accountId,
        runtime,
      }).catch((err) => {
        logger.error(`Max inbound handling error (${accountId}):`, err);
      });
    });

    bot.catch((err: Error) => {
      logger.error(`Max bot error (${accountId}):`, err);
    });

    activeBots.set(accountId, { bot, token: config.token });
    registerBot(config.token, bot);

    // bot.start() runs an infinite polling loop — fire and forget
    bot.start({
      allowedUpdates: ["message_created", "bot_started"] as never,
    }).then(() => {
      logger.info(`Max poll loop ended normally (${accountId})`);
    }).catch((err) => {
      logger.error(`Max poll loop crashed (${accountId}):`, err);
    });

    logger.info(`Max polling started for account "${accountId}"`);
  }
}

export function stopPolling(): void {
  for (const [, { bot, token }] of activeBots) {
    bot.stop();
    unregisterBot(token);
  }
  activeBots.clear();
}
