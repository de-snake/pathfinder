#!/usr/bin/env ts-node

/**
 * Pathfinder over "zappers.json" (unified nodes).
 *
 * Modes:
 *   • Default: list paths (BFS, simple paths). Use --k 0 to list ALL paths up to --maxDepth.
 *   • --unique: union of ALL adapters & tokens that lie on ANY path from --in to --out (no path listing).
 *
 * Examples:
 *   npx ts-node pathfinder.ts --in USDe --out USDC                      # shortest paths (k=1)
 *   npx ts-node pathfinder.ts --in USDe --out USDC --k 10               # up to 10 paths
 *   npx ts-node pathfinder.ts --in USDe --out USDC --k 0 --maxDepth 6   # ALL simple paths up to depth 6
 *   npx ts-node pathfinder.ts --in USDe --out USDC --unique             # union (all adapters/tokens on any path)
 *   npx ts-node pathfinder.ts --list-tokens
 */

const fs = require("fs");
const nodePath = require("path");
const { keccak_256 } = require("js-sha3");

function isHexAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

// EIP-55 checksum
function toChecksumAddress(addr: string): string {
  const lower = addr.toLowerCase().replace(/^0x/, "");
  const hash = keccak_256(lower);
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const ch = lower[i];
    const nibble = parseInt(hash[i], 16);
    out += /[0-9]/.test(ch) ? ch : (nibble >= 8 ? ch.toUpperCase() : ch);
  }
  return out;
}

// Token normalizer used on BOTH: file tokens and CLI tokens
function normalizeTokenLabel(t: string): string {
  const trimmed = String(t).trim();
  if (isHexAddress(trimmed)) return toChecksumAddress(trimmed);
  // keep symbols as-is (USDC, WETH, etc.)
  return trimmed;
}

type ZapperFile = ZapperEntry[];

type ZapperEntry = {
  adapter: string;
  arguments?: Record<string, any>;
  pools: {
    parameters: Record<string, any>;
    tokens: Array<string | undefined | null>;
  }[];
};

type PoolNodeId = string;

type PoolNode = {
  id: PoolNodeId;
  adapter: string;
  arguments: Record<string, any>;
  parameters: Record<string, any>;
  tokens: string[];
};

type Edge = {
  from: string;
  to: string;
  nodeId: PoolNodeId;
};

/** ---------- CLI args ---------- */
function parseArgv(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    // --key=value
    let m = /^--([^=\s]+)=(.*)$/.exec(a);
    if (m) {
      out[m[1]] = m[2];
      continue;
    }

    // --key value  OR  --flag
    m = /^--([^=\s]+)$/.exec(a);
    if (m) {
      const key = m[1];
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next; // consume the value
        i++;
      } else {
        out[key] = "true"; // boolean flag
      }
      continue;
    }
  }
  return out;
}

const argv = parseArgv();

const FILE =
  typeof argv.file === "string" && argv.file !== "true" ? (argv.file as string) : "./pools.json";

const RAW_IN = typeof argv.in === "string" && argv.in !== "true" ? (argv.in as string) : "";
const RAW_OUT = typeof argv.out === "string" && argv.out !== "true" ? (argv.out as string) : "";

const TOKEN_IN = RAW_IN ? normalizeTokenLabel(RAW_IN) : "";
const TOKEN_OUT = RAW_OUT ? normalizeTokenLabel(RAW_OUT) : "";

const K = Math.max(0, Number(typeof argv.k === "string" ? argv.k : 1)); // 0 = unlimited paths
const MAX_DEPTH = Math.max(1, Number(typeof argv.maxDepth === "string" ? argv.maxDepth : 5));
const LIST_TOKENS = argv["list-tokens"] === "true" || argv["listTokens"] === "true";
// current flags:
const UNIQUE = argv["unique"] === "true";

// make k=0 imply union mode automatically (optional):
const AUTO_UNION_IF_K0 = true;
const EFFECTIVE_UNIQUE = UNIQUE || (AUTO_UNION_IF_K0 && K === 0);

/** ---------- Load + build graph ---------- */

function makeNodeId(adapter: string, params: Record<string, any>, tokens: string[]): PoolNodeId {
  const key =
    params.targetAddress ||
    params.pool ||
    params.vault ||
    params.lpToken ||
    params.router ||
    JSON.stringify(params);
  return `${adapter}::${key}::${tokens.join("|")}`;
}

function loadNodes(filePath: string): PoolNode[] {
  const abs = nodePath.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(abs, "utf8");
  const data: ZapperFile = JSON.parse(raw);

  const nodes: PoolNode[] = [];
  for (const entry of data) {
    for (const pool of entry.pools) {
        const toks = (pool.tokens || [])
        .filter((t): t is string => typeof t === "string" && t.length > 0)
        .map((t) => normalizeTokenLabel(t));
      nodes.push({
        id: makeNodeId(entry.adapter, pool.parameters || {}, toks),
        adapter: entry.adapter,
        arguments: entry.arguments || {},
        parameters: pool.parameters || {},
        tokens: toks,
      });
    }
  }
  return nodes;
}

function buildGraph(nodes: PoolNode[]): {
  tokenSet: Set<string>;
  tokenToEdges: Map<string, Edge[]>;
  reverseTokenToEdges: Map<string, Edge[]>;
  edges: Edge[];
  nodesById: Map<PoolNodeId, PoolNode>;
} {
  const edges: Edge[] = [];
  const tokenSet = new Set<string>();
  for (const n of nodes) n.tokens.forEach((t) => tokenSet.add(t));

  for (const n of nodes) {
    const toks = n.tokens;
    for (let i = 0; i < toks.length; i++) {
      for (let j = 0; j < toks.length; j++) {
        if (i === j) continue;
        edges.push({ from: toks[i], to: toks[j], nodeId: n.id });
      }
    }
  }

  const tokenToEdges = new Map<string, Edge[]>();
  const reverseTokenToEdges = new Map<string, Edge[]>();

  for (const e of edges) {
    if (!tokenToEdges.has(e.from)) tokenToEdges.set(e.from, []);
    tokenToEdges.get(e.from)!.push(e);

    if (!reverseTokenToEdges.has(e.to)) reverseTokenToEdges.set(e.to, []);
    reverseTokenToEdges.get(e.to)!.push(e);
  }

  const nodesById = new Map<PoolNodeId, PoolNode>(nodes.map((n) => [n.id, n]));
  return { tokenSet, tokenToEdges, reverseTokenToEdges, edges, nodesById };
}

// Reverse BFS to get shortest distance (in hops) from any token to goal.
// Used for pruning during DFS enumeration of simple paths.
function shortestDistToGoal(
    reverseTokenToEdges: Map<string, Edge[]>,
    goal: string
  ): Map<string, number> {
    const dist = new Map<string, number>();
    const q: Array<{ t: string; d: number }> = [{ t: goal, d: 0 }];
    dist.set(goal, 0);
  
    while (q.length) {
      const { t, d } = q.shift()!;
      for (const e of reverseTokenToEdges.get(t) || []) {
        if (!dist.has(e.from)) {
          dist.set(e.from, d + 1);
          q.push({ t: e.from, d: d + 1 });
        }
      }
    }
    return dist;
  }
/** ---------- Paths (BFS, simple paths, k=0 => unlimited) ---------- */

type PathStep = { token: string; viaNode?: PoolNodeId };
type Path = PathStep[];

function listPathsUpToDepth(
  tokenToEdges: Map<string, Edge[]>,
  start: string,
  goal: string,
  k: number, // 0 = unlimited
  maxDepth: number
): Path[] {
  const results: Path[] = [];
  const queue: Path[] = [[{ token: start }]];

  while (queue.length && (k === 0 || results.length < k)) {
    const path = queue.shift();
    if (!path || path.length === 0) continue;

    const last = path[path.length - 1].token;
    if (path.length > maxDepth + 1) continue;

    const isGoal = last === goal;
    if (isGoal) {
      results.push(path);
      // IMPORTANT: do NOT `continue` here.
      // We still expand siblings in the queue to discover other paths of the same or greater length.
      // (We don't expand from goal further to avoid cycles, but we keep exploring queued paths.)
    }

    if (!isGoal) {
      const used = new Set(path.map((p) => p.token));
      for (const e of tokenToEdges.get(last) || []) {
        if (used.has(e.to)) continue; // simple path constraint
        queue.push([...path, { token: e.to, viaNode: e.nodeId }]);
      }
    }
  }
  return results;
}

/** ---------- Summaries ---------- */

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function summarizePath(path: Path, nodesById: Map<PoolNodeId, PoolNode>) {
  const nodeIds = path.map((s) => s.viaNode).filter((x): x is PoolNodeId => !!x);
  const allTokens: string[] = [];
  for (const id of nodeIds) {
    const node = nodesById.get(id);
    if (node) allTokens.push(...node.tokens);
  }
  return {
    nodeIds: uniq(nodeIds),
    compatibilityTokens: uniq(allTokens),
  };
}

/** ---------- UNION mode (no path enumeration) ---------- */

// Enumerate ONLY simple paths (no repeated tokens) up to maxDepth,
// and collect union of adapters/tokens seen on any successful path.
function unionViaSimplePaths(
    tokenToEdges: Map<string, Edge[]>,
    reverseTokenToEdges: Map<string, Edge[]>,
    nodesById: Map<PoolNodeId, PoolNode>,
    start: string,
    goal: string,
    maxDepth: number
  ) {
    const distToGoal = shortestDistToGoal(reverseTokenToEdges, goal);
  
    const unionNodeIds = new Set<PoolNodeId>();
    const unionTokens = new Set<string>();
  
    function dfs(
      cur: string,
      depth: number,
      visitedTokens: Set<string>,
      pathNodeIds: PoolNodeId[]
    ) {
      // prune: no solution reachable or depth exceeded
      const rem = distToGoal.get(cur);
      if (rem === undefined) return;                    // can't reach goal from here
      if (depth > maxDepth) return;                     // depth cap
      if (depth + rem > maxDepth) return;               // even shortest to goal would exceed cap
  
      if (cur === goal) {
        // successful simple path → add all nodes & their tokens
        for (const id of pathNodeIds) {
          unionNodeIds.add(id);
          const n = nodesById.get(id);
          if (n) n.tokens.forEach((t) => unionTokens.add(t));
        }
        return;
      }
  
      for (const e of tokenToEdges.get(cur) || []) {
        if (visitedTokens.has(e.to)) continue;          // simple path (no token repeats)
        visitedTokens.add(e.to);
        pathNodeIds.push(e.nodeId);
        dfs(e.to, depth + 1, visitedTokens, pathNodeIds);
        pathNodeIds.pop();
        visitedTokens.delete(e.to);
      }
    }
  
    const visited = new Set<string>([start]);
    dfs(start, 0, visited, []);
  
    return {
      nodeIds: Array.from(unionNodeIds),
      tokens: Array.from(unionTokens),
    };
  }

/** ---------- Printing ---------- */

function prettyPrintPaths(tokenIn: string, tokenOut: string, paths: Path[], nodesById: Map<PoolNodeId, PoolNode>) {
  if (paths.length === 0) {
    console.log(`No path found from ${tokenIn} → ${tokenOut}.`);
    return;
  }

  console.log(`Found ${paths.length} path(s) from ${tokenIn} → ${tokenOut} (maxDepth=${MAX_DEPTH}, k=${K || "ALL"})`);

  paths.forEach((p, idx) => {
    const summary = summarizePath(p, nodesById);
    const hops = p.map((s) => s.token).join(" -> ");

    console.log(`\n=== PATH #${idx + 1} ===`);
    console.log(`Tokens: ${hops}`);
    console.log(`Adapters to add (ordered):`);
    summary.nodeIds.forEach((id, i) => {
      const n = nodesById.get(id)!;
      console.log(
        `  ${i + 1}. [${n.adapter}] ${id}\n     - tokens: ${n.tokens.join(", ")}\n     - parameters: ${JSON.stringify(
          n.parameters
        )}\n     - arguments: ${JSON.stringify(n.arguments)}`
      );
    });
    console.log(`Compatibility tokens to add (union of all tokens in pools used on this path):`);
    console.log(`  ${summary.compatibilityTokens.join(", ")}`);
  });
}

function stableStringify(obj: any): string {
    if (obj === null || typeof obj !== "object") return String(obj);
    if (Array.isArray(obj)) return JSON.stringify(obj);
    const sorted: Record<string, any> = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
    return JSON.stringify(sorted);
  }
  
  function printKeyValueBullets(obj: Record<string, any>, indent = "     - ") {
    const keys = Object.keys(obj).sort();
    for (const k of keys) {
      console.log(`${indent}${k}: ${obj[k]}`);
    }
  }
  
  function prettyPrintUnion(
    res: { nodeIds: string[]; tokens: string[] },
    nodesById: Map<PoolNodeId, PoolNode>
  ) {
    if (res.nodeIds.length === 0) {
      console.log(`No adapters found that lie on any path between the selected tokens.`);
      return;
    }
  
    // 1) Materialize and sort nodes deterministically
    const items = res.nodeIds
      .map((id) => nodesById.get(id))
      .filter((n): n is PoolNode => !!n)
      .sort((a, b) => {
        if (a.adapter !== b.adapter) return a.adapter.localeCompare(b.adapter);
        // group by arguments (stable‑stringified)
        const ak = stableStringify(a.arguments);
        const bk = stableStringify(b.arguments);
        if (ak !== bk) return ak.localeCompare(bk);
        // then by parameters for stable pool order
        return stableStringify(a.parameters).localeCompare(stableStringify(b.parameters));
      });
  
    // 2) Group by (adapter, arguments)
    type GroupKey = string;
    const groups = new Map<GroupKey, { adapter: string; args: Record<string, any>; pools: PoolNode[] }>();
  
    for (const n of items) {
      const key = `${n.adapter}::${stableStringify(n.arguments)}`;
      if (!groups.has(key)) groups.set(key, { adapter: n.adapter, args: n.arguments, pools: [] });
      groups.get(key)!.pools.push(n);
    }
  
    console.log(`\n## Adapters to Whitelist (union over all valid routes)\n`);
  
    // 3) Print per group
    let idx = 1;
    for (const { adapter, args, pools } of groups.values()) {
      console.log(`${idx}. **${adapter}**`);
      const argKeys = Object.keys(args);
      if (argKeys.length > 0) {
        console.log(`   - Arguments:`);
        printKeyValueBullets(args);
      }
      console.log(`   - Pools:`);
      pools.forEach((n, i) => {
        console.log(`     ${i + 1}. Parameters:`);
        printKeyValueBullets(n.parameters);
      });
      console.log(""); // blank line between groups
      idx++;
    }
  
    // 4) Compatibility tokens
    const tokensSorted = Array.from(new Set(res.tokens)).sort();
    console.log(`**Tokens to add as collaterals (${tokensSorted.length}):**`);
    console.log(tokensSorted.map((t) => `- ${t}`).join("\n"));
  }
  
  // small helper for indenting pretty JSON blocks
  function indent(text: string, spaces: number): string {
    const pad = " ".repeat(spaces);
    return text
      .split("\n")
      .map((line, idx) => (idx === 0 ? pad + line : pad + line))
      .join("\n");
  }

/** ---------- Main ---------- */
(function main() {
  const nodes = loadNodes(FILE);
  const { tokenSet, tokenToEdges, reverseTokenToEdges, edges, nodesById } = buildGraph(nodes);

  if (LIST_TOKENS) {
    console.log(`Found ${tokenSet.size} tokens:`);
    console.log(Array.from(tokenSet).sort().join("\n"));
    process.exit(0);
  }

  if (!TOKEN_IN || !TOKEN_OUT) {
    console.error(`Please provide --in and --out tokens (use --list-tokens to see available).`);
    process.exit(1);
  }
  if (!tokenSet.has(TOKEN_IN)) {
    console.error(`TokenIn not found in graph: ${TOKEN_IN}. Try --list-tokens to see available.`);
    process.exit(1);
  }
  if (!tokenSet.has(TOKEN_OUT)) {
    console.error(`TokenOut not found in graph: ${TOKEN_OUT}. Try --list-tokens to see available.`);
    process.exit(1);
  }

  if (EFFECTIVE_UNIQUE) {
    const res = unionViaSimplePaths(
      tokenToEdges,
      reverseTokenToEdges,
      nodesById,
      TOKEN_IN,
      TOKEN_OUT,
      MAX_DEPTH
    );
    prettyPrintUnion(res, nodesById);
    return;
  }

  // Path listing mode
  const paths = listPathsUpToDepth(tokenToEdges, TOKEN_IN, TOKEN_OUT, K, MAX_DEPTH);
  prettyPrintPaths(TOKEN_IN, TOKEN_OUT, paths, nodesById);
})();