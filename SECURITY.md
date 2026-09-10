# Security Policy

## Supported versions

Security fixes are currently applied to the latest release only.

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| < 1.0 | No |

## Reporting a security issue

Please avoid posting sensitive vulnerabilities, authentication data, private ChatGPT content, cookies, tokens, or account information in a public issue.

For a public GitHub repository, the preferred workflow is to enable **Private vulnerability reporting** under:

**Repository Settings → Security → Code security and analysis**

and use GitHub's private security advisory/reporting flow.

If private reporting is not enabled, open a minimal public issue that says a security-sensitive report is available, without including exploit details or secrets.

## Scope

Relevant security issues include, for example:

- Unexpected transmission of queued prompt data to a third party.
- Unsafe remote code loading.
- Leakage of local prompt data beyond the ChatGPT page/browser storage context.
- DOM injection vulnerabilities introduced by Prompt Queue rendering.
- Changes that unexpectedly expose authentication/session information.

The following are generally outside this project's scope:

- Vulnerabilities in ChatGPT, Tampermonkey, the browser, or the operating system itself.
- Account policy or service-limit enforcement by third parties.

## Sensitive data guidance

Prompt Queue stores queued prompt text locally in browser `localStorage`. Users should not place passwords, API keys, access tokens, private keys, or other credentials in the queue.
