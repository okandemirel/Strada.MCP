# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Model

Strada.MCP implements defense-in-depth with multiple security layers.

### Input Validation

- All 49 tools validate input via Zod schemas
- C# identifiers validated against keyword list
- Numeric ranges enforced (ports, dimensions, sizes)
- Enum constraints on all categorical inputs

### Path Security

- Directory traversal prevention on every file operation (`src/security/path-guard.ts`)
- Null byte injection rejection
- Paths resolved and validated against allowed root directories
- Symlink traversal prevention
- Configurable allowed paths via `ALLOWED_PATHS` environment variable

### Credential Protection

- API keys, tokens, and secrets scrubbed from all tool output (`src/security/sanitizer.ts`)
- Patterns detected: `sk-*`, `AIza*`, `Bearer *`, `ghp_*`, `gho_*`, `xox*-*`
- Git credential URLs redacted
- Environment variables with secrets never logged

### Read-Only Mode

- Global `READ_ONLY=true` blocks all write operations
- Per-tool `readOnly` metadata enforced at registry level
- Bridge commands respect read-only flag

### Script Execution

- Roslyn script execution disabled by default
- Requires explicit `SCRIPT_EXECUTE_ENABLED=true`
- Sandboxed execution with timeout

### Network Security

- Unity bridge binds to `127.0.0.1` only (no remote access)
- Bridge accepts only registered JSON-RPC commands (allowlist)
- No outbound network calls except configured embedding API and Brain URL

### Shell Injection Prevention

- All process arguments sanitized against shell metacharacters (`src/security/validator.ts`)
- Dangerous characters rejected: `` ; & | ` $ ( ) { } [ ] < > ! \ ``
- File paths prefixed with `--` to prevent flag injection

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: security@stradacore.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Impact assessment
   - Suggested fix (optional)

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Threat Model

### In Scope

- Path traversal / directory escape
- Credential leakage in tool output
- Shell injection via tool parameters
- Unauthorized Unity Editor manipulation
- Denial of service via large inputs

### Out of Scope

- Physical access attacks
- Compromised Node.js runtime
- Malicious MCP client (trusted client model)
- Unity Editor API vulnerabilities
