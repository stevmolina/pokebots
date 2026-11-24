import subprocess, difflib
from pathlib import Path
target = '/Users/usuario/.t3/worktrees/brain-mcp/feat-pokebots-integration'
base = '0ff6d34eb7a862b0ce02c3b07ea72906d4e76e5b'
diffs = []
def edit(path, fn=None, new=None):
    old = subprocess.check_output(['git','-C',target,'show',f'{base}:{path}'],text=True) if fn else ''
    updated = fn(old) if fn else new
    assert updated != old
    file = Path('.brain-patch-stage') / path
    file.parent.mkdir(parents=True,exist_ok=True)
    file.write_text(updated)
    diffs.append(f'diff --git a/{path} b/{path}\n' + ('' if fn else 'new file mode 100644\n') + ''.join(difflib.unified_diff(old.splitlines(True),updated.splitlines(True),f'a/{path}' if fn else '/dev/null',f'b/{path}')))
edit('src/auth/pokebots.ts', new=r"""import { OAuthError } from '@modelcontextprotocol/server';
import { decodeJwt, importSPKI, jwtVerify } from 'jose';

const issuer = 'urn:pokebots:integrations';
export const pokebotsScope = 'integration:use';

export function isPokebotsPrincipal(id: string): boolean {
  return id.startsWith('pokebots:');
}

export function claimsPokebotsIssuer(token: string): boolean {
  try {
    return decodeJwt(token).iss === issuer;
  } catch {
    return false;
  }
}

export function createPokebotsVerifier(publicKeyPem: string | undefined) {
  let key: Awaited<ReturnType<typeof importSPKI>> | undefined;

  return async (token: string): Promise<{ principal: string; expiresAt: number }> => {
    try {
      if (!publicKeyPem) throw new Error();
      key ??= await importSPKI(publicKeyPem.replace(/\\n/g, '\n').trim(), 'RS256');
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['RS256'],
        issuer,
        audience: 'brain',
        requiredClaims: ['sub', 'iat', 'exp', 'scope'],
      });

      const { aud, sub, iat, exp, scope, linked_workos_sub: linked } = payload;
      const now = Math.floor(Date.now() / 1000);
      if (
        aud !== 'brain' || scope !== pokebotsScope ||
        typeof sub !== 'string' || !/^pokebots:[A-Za-z0-9_-]{1,128}$(?![\s\S])/.test(sub) ||
        typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat > now ||
        typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= now || exp - iat > 300 ||
        (linked !== undefined && (typeof linked !== 'string' || !/^user_[a-zA-Z0-9]+$(?![\s\S])/.test(linked)))
      ) {
        throw new Error();
      }

      return { principal: linked ?? sub, expiresAt: exp };
    } catch {
      throw new OAuthError('invalid_token', 'Invalid Pokebots integration token');
    }
  };
}
""")
edit('src/auth/workos.ts',lambda s:s.replace("import { loadConfig } from '../config.js';","import { loadConfig } from '../config.js';\nimport { claimsPokebotsIssuer, createPokebotsVerifier, isPokebotsPrincipal, pokebotsScope } from './pokebots.js';").replace("if (!claims.sub) throw new OAuthError('invalid_token', 'Token has no subject');", "if (!claims.sub || isPokebotsPrincipal(claims.sub)) {\n        throw new OAuthError('invalid_token', 'Token has no valid WorkOS subject');\n      }").replace('createTokenVerifier():','createTokenVerifier({ allowPokebots = false } = {}):').replace('  return {\n    async verifyAccessToken(token: string): Promise<AuthInfo> {','''  const verifyPokebots = createPokebotsVerifier(allowPokebots ? process.env.POKEBOTS_INTEGRATION_PUBLIC_KEY : undefined);

  return {
    async verifyAccessToken(token: string): Promise<BrainAuthInfo> {
      if (claimsPokebotsIssuer(token)) {
        const { principal, expiresAt } = await verifyPokebots(token);
        return {
          token,
          clientId: 'pokebots',
          scopes: [pokebotsScope],
          expiresAt,
          resource: new URL(config.mcpResourceUrl),
          extra: { workosUserId: principal },
        };
      }
'''))
edit('src/index.ts',lambda s:s.replace('const tokenVerifier = createTokenVerifier();','const tokenVerifier = createTokenVerifier({ allowPokebots: true });').replace('mountWeb(app, web, tokenVerifier, landingRoot())','mountWeb(app, web, createTokenVerifier(), landingRoot())'))
for file, sig, arg in [('access','export async function githubLoginForWorkosUser(workosUserId: string): Promise<string | null> {','workosUserId'),('identity','export async function workosProfile(userId: string): Promise<WorkosProfile | null> {','userId')]:
    edit(f'src/auth/{file}.ts',lambda s:s.replace("import { loadConfig } from '../config.js';","import { loadConfig } from '../config.js';\nimport { isPokebotsPrincipal } from './pokebots.js';").replace(sig,sig+f'\n  if (isPokebotsPrincipal({arg})) return null;'))
edit('test/rest.test.ts',lambda s:s.replace('exportJWK, generateKeyPair','exportJWK, exportSPKI, generateKeyPair').replace('const realFetch = globalThis.fetch;',"""let pokebotsKey: Awaited<ReturnType<typeof generateKeyPair>>;
const realFetch = globalThis.fetch;
async function pokebotsToken(aud: string | string[], linked?: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: 'integration:use', linked_workos_sub: linked })
    .setProtectedHeader({ alg: 'RS256' }).setSubject('pokebots:test_account')
    .setIssuer('urn:pokebots:integrations').setAudience(aud)
    .setIssuedAt(now).setExpirationTime(now + 300).sign(pokebotsKey.privateKey);
}""").replace("  key = await generateKeyPair('RS256');","""  key = await generateKeyPair('RS256');
  pokebotsKey = await generateKeyPair('RS256');
  vi.stubEnv('POKEBOTS_INTEGRATION_PUBLIC_KEY', (await exportSPKI(pokebotsKey.publicKey)).replace(/\n/g, '\\\\n'));""".replace('/\n/g',r'/\n/g')).replace("['rest-reader', 'rest-writer'].includes","['rest-reader', 'rest-writer', 'user_TestReader'].includes").replace('vi.unstubAllGlobals();','vi.unstubAllGlobals(); vi.unstubAllEnvs();').replace("describe('REST authentication and errors', () => {","""describe('REST authentication and errors', () => {
  it('accepts native Pokebots tokens on REST and MCP and rejects other audiences', async () => {
    const mcpPath = new URL(audience).pathname;
    const headers = { authorization: `Bearer ${await pokebotsToken('brain')}` };
    const response = await realFetch(`${base}/api/v1/brains`, { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ brains: [] });
    expect((await realFetch(`${base}${mcpPath}`, { headers })).status).toBe(405);

    for (const aud of ['another-service', ['brain']]) {
      const invalid = { authorization: `Bearer ${await pokebotsToken(aud)}` };
      expect((await realFetch(`${base}/api/v1/brains`, { headers: invalid })).status).toBe(401);
      expect((await realFetch(`${base}${mcpPath}`, { headers: invalid })).status).toBe(401);
    }
  });
  it('uses a linked principal only within its existing brain permissions', async () => {
    const headers = { authorization: `Bearer ${await pokebotsToken('brain', 'user_TestReader')}` };
    const allowed = await realFetch(`${base}/api/v1/search?brain=${brain}&query=launch`, { headers });
    expect(allowed.status).toBe(200);
    const denied = await realFetch(`${base}/api/v1/search?brain=${otherBrain}&query=launch`, { headers });
    expect(denied.status).toBe(404);
    const native = { authorization: `Bearer ${await pokebotsToken('brain')}` };
    const privateSession = await realFetch(`${base}/api/v1/sessions/show?session=rest-chat-1`, { headers: native });
    expect(privateSession.status).toBe(422);
  });"""))
Path('brain-mcp-pokebots.patch').write_text(''.join(diffs))
