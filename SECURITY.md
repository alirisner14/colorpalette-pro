# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ |

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Email **ontherisedigital@gmail.com** with "Security: Color Palette PRO" in the subject. Include:

- a description of the problem and its impact
- steps to reproduce it, or a proof of concept
- the browser, device and app version you used

You'll get a reply within 5 business days. Please allow reasonable time for a fix before you disclose the issue.

## Scope

Color Palette PRO runs entirely in the browser. It has no server, accounts or analytics, and it stores
data only in the browser's `localStorage`. Relevant reports include script injection through palette or
color names, unsafe file handling during image picking or export, and service-worker cache poisoning.
