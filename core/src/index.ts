// @unifedev/pages-core: the public API of DESIGN §B.
export const PAGES_CORE_VERSION = "0.2.1";

export { mountPages, type MountOptions, type PagesServer, type PagesSettings } from "./serving/mount.ts";
export type { ServingHost, RouteTable, Route, PagesRequest, PagesResponse, Reader, ProviderHost, SessionRecord, SessionSettings, Waiting, RespondPayload, Message, ActivityItem, AttachmentRef, ProviderChoice, SettingScope, ReplySettings, AppliedSettings, Placement, Logger, ContributorHost, ContributorCall, ContributorAnswer, ContributorWorkspace } from "./host/index.ts";
export { ProviderError } from "./host/index.ts";
export { LIMITS, type Limits } from "./domain/limits.ts";
export { BRIDGE_ERROR_CODES, type BridgeErrorCode, PageError } from "./domain/errors.ts";
export { formatSubmissionMessage, formatReplyMessage, formatPromptMessage } from "./domain/submissions/message.ts";
export { KERNEL_RUNTIME, SHELL_RUNTIME, BUILTIN_HOME_HTML } from "./generated/index.ts";
export type { CapabilityDescriptor } from "./domain/capabilities/contract.ts";
export type { KernelConfig, ShellConfig } from "./runtime/shared/protocol.ts";
export { HOME_IDENTITY, isDocumentPath, isPartPath, ENTRY_DOCUMENT } from "./domain/index.ts";

// The dispatcher, its handlers and the four durable serving stores (DESIGN §E).
export { createDispatcher, parseBridgeBody } from "./serving/bridge/dispatcher.ts";
export { requestOrigins } from "./serving/request.ts";
export { ALL_HANDLERS } from "./serving/bridge/handlers/index.ts";
export { createContributions, combinedLookup, rosterOf, instructionFragments, contributedFailure, EMPTY_CONTRIBUTIONS } from "./serving/contributions.ts";
export { createStorageStore, storageDocumentKey, storageIndexKey } from "./serving/storage-store.ts";
export { createGrantStore, GRANTS_KEY } from "./serving/grants.ts";
export { createRedeemedStore, REDEEMED_KEY } from "./serving/redeemed-store.ts";
export { decisionCooldownKey, grantCooldownKey, cooldownKeyFor } from "./serving/bridge/cooldown.ts";
export { deliverReply, deliverSubmission, replyIdempotencyId, type Delivered, type DeliveredSubmission, type ReplyToDeliver, type SubmissionToDeliver, type Sender } from "./serving/bridge/deliver.ts";
export type { BridgeContext, BridgeHandler, HandlerOutcome } from "./serving/bridge/handler.ts";

// The agent contract and the built-in home page (DESIGN §B.5, §B.6, §B.8).
export { createCommands, registerCommands, guideInputFrom, pageUrl, ineligibleReason, COMMAND_ROLES, INIT_LINES, type CommandRole, type CommandContext, type CommandResult, type CommandHandler, type CommandOptions } from "./agent/commands.ts";
export { STANDING_INSTRUCTION_TEMPLATE, standingInstruction, instructionParts, fillPlaceholders, fragmentHeading, createInjector, eligibilityOf, type CommandSpellings, type InstructionParts, type InstructionFragment, type InstructionInjector, type InjectionReport, type PlacedPart } from "./agent/instruction.ts";
export { buildGuide, type GuideInput } from "./agent/guide.ts";
export { hasSeed, renderSeed } from "./agent/seed.ts";
export { SESSIONLESS_CAPABILITIES, isHome } from "./home/identity.ts";
