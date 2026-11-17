// Frozen optional Brain v1 wire contract. Keep these schemas independent of current IPC types.
// Only an MCP sign-in manager may use the selected connection, including its private chats.
import { z } from "zod";
import { adminRoute, type OptionalRouteCodec } from "./admin-wire";
import { decodeTeamProtocolV2Json } from "./v2";

const scope = { mcpServerId: z.string().min(1), brain: z.string().min(1).max(300) };
const wireBrainRequest = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("brains"), mcpServerId: scope.mcpServerId }),
  z.object({ operation: z.literal("overview"), ...scope }),
  z.object({ operation: z.literal("search"), ...scope, query: z.string().min(1).max(2000) }),
  z.object({ operation: z.literal("claim"), ...scope, claim_id: z.string().min(8).max(200) }),
  z.object({ operation: z.literal("explain"), ...scope, claim_id: z.string().min(8).max(200) }),
  z.object({ operation: z.literal("page"), ...scope, path: z.string().min(1).max(1000) }),
  z.object({ operation: z.literal("files"), ...scope, cursor: z.string().max(2000).optional() }),
  z.object({ operation: z.literal("file"), ...scope, path: z.string().min(1).max(1000) }),
  z.object({
    operation: z.literal("addFile"),
    ...scope,
    path: z.string().min(1).max(1000),
    content: z.string().max(700_000),
  }),
  z.object({
    operation: z.literal("remember"),
    ...scope,
    text: z.string().min(3).max(20000),
    page: z.string().max(1000).optional(),
  }),
  z.object({
    operation: z.literal("update"),
    ...scope,
    claim_id: z.string().min(8).max(200),
    text: z.string().min(3).max(20000),
  }),
  z.object({
    operation: z.literal("forget"),
    ...scope,
    claim_id: z.string().min(8).max(200),
    reason: z.string().min(3).max(20000),
  }),
  z.object({ operation: z.literal("sessions"), ...scope, query: z.string().max(2000) }),
  z.object({
    operation: z.literal("session"),
    ...scope,
    session: z.string().min(4).max(300),
    source: z.string().max(100).optional(),
    from_turn: z.number().int().min(1).optional(),
  }),
]);

const claim = z.object({
  id: z.string(),
  text: z.string(),
  page: z.string(),
  line: z.number(),
  authority: z.string().nullable(),
  verified_at: z.string().nullable(),
  commit: z.string(),
  url: z.string(),
  heading: z.string().nullable().optional(),
});
// Pick only documented domain fields. Provider metadata and credentials cannot cross this boundary.
const wireBrainResponse = z.object({
  brains: z.array(z.object({ id: z.string(), repo: z.string() })).optional(),
  claims: z.array(claim).optional(),
  claim: claim.optional(),
  nearby: z.array(claim).optional(),
  pages: z.array(z.object({ path: z.string() })).optional(),
  text: z.string().optional(),
  path: z.string().optional(),
  url: z.string().nullable().optional(),
  commit: z.union([z.string(), z.object({ sha: z.string(), url: z.string() })]).optional(),
  mode: z.string().optional(),
  recorded: z.boolean().optional(),
  pull_request: z.object({ url: z.string(), number: z.number().optional() }).optional(),
  sources: z
    .array(z.object({ path: z.string(), origin: z.string().nullable().optional(), sha256: z.string().optional() }))
    .optional(),
  replaces: z
    .array(z.object({ old_claim_id: z.string(), text: z.string().nullable(), page_path: z.string().nullable() }))
    .optional(),
  replaced_by: z.array(claim).optional(),
  files: z
    .array(z.object({ path: z.string(), size: z.number(), last_modified: z.string().nullable().optional() }))
    .optional(),
  next_cursor: z.string().nullable().optional(),
  download_url: z.string().optional(),
  sessions: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().nullable().optional(),
        source: z.string(),
        started_at: z.string().nullable().optional(),
        updated_at: z.string().nullable().optional(),
        turn_count: z.number().optional(),
        snippet: z.string().optional(),
      }),
    )
    .optional(),
  session: z
    .object({
      id: z.string(),
      source: z.string().optional(),
      title: z.string().nullable().optional(),
      turns: z.array(z.object({ role: z.string(), text: z.string() })).optional(),
    })
    .optional(),
  next_from_turn: z.number().nullable().optional(),
});

export const BRAIN_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [
    "/v1/brain/request",
    adminRoute(
      (value) => decodeTeamProtocolV2Json(wireBrainRequest.parse(value)),
      (value) => decodeTeamProtocolV2Json(wireBrainResponse.parse(value)),
    ),
  ],
]);
