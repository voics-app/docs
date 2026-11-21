# App Store privacy answers (iPhone app)

Draft answers for the "App Privacy" section in App Store Connect, derived from what the mobile app and the services do (client `apps/mobile`, api, messages, gateway). The public policy is the website's `privacy.html` ([website PR #11](https://github.com/voics-app/website/pull/11)); keep both in step. This is not legal advice; the owner confirms every answer before submitting, because the answers are a declaration to Apple.

Apple's wording: "collect" means data leaves the device and is kept longer than needed to serve the request in real time. The categories are Apple's: [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).

## Summary

| Question | Answer |
|---|---|
| Do you or third-party partners collect data from this app? | Yes |
| Is any data used to track you (linked with third-party data for ads, or shared with data brokers)? | **No**. No advertising, analytics or attribution SDKs; the dependency list holds only Expo runtime modules, React Native and WebRTC |
| Privacy policy URL | Website `privacy.html` (required) |
| Account deletion | In the app (Apple guideline 5.1.1(v)); deletion is scheduled for 14 days later |

## Data types

Every collected type below is **linked to the user's identity** (it is tied to the account) and **not used for tracking**.

| Apple category and type | Collected? | What it is in Voics | Purpose |
|---|---|---|---|
| Contact Info: Email Address | Yes | Account email | App Functionality |
| Contact Info: Name | Yes | Display name (optional, can equal the username) | App Functionality |
| User Content: Other User Content | Yes | Text messages in Standard chats (stored readable on the server), attachments, profile text, server and channel content, reports with a copy of the reported message | App Functionality |
| User Content: Photos or Videos | Yes | Avatars, banners and files the user picks and sends | App Functionality |
| User Content: Audio Data | No | Calls are relayed in real time and never recorded or stored | n/a |
| User Content: Customer Support | Only if the user emails support | Mail to the support address | App Functionality |
| Identifiers: User ID | Yes | Account id and username | App Functionality |
| Identifiers: Device ID | Yes | Apple push token and call (PushKit) token, per-device encryption key ids | App Functionality |
| Location: Coarse Location | Yes | Country from the Cloudflare edge header, kept on the login session; no IP address is stored | App Functionality, security |
| Usage Data: Product Interaction | Confirm | Server-side aggregate event counts (messages sent, calls started) for capacity; not used to profile users | Other (service operation). Declare only if the owner counts these as linked to the user |
| Diagnostics: Performance Data | Yes, not linked | Aggregated voice quality numbers (jitter, packet loss) without content | Other (service operation) |
| Contacts | No | Friends are in-app relationships; the address book is never read | n/a |
| Health, Financial Info, Sensitive Info, Browsing History, Search History, Purchases | No | Search runs on messages already in the service and is not stored as history; no payments exist | n/a |

## Details behind the answers

- **Permissions in the app:** microphone and camera (calls, taking photos), photo library (picked items only). No location, contacts, tracking or Bluetooth permission is requested; there is no App Tracking Transparency prompt because nothing tracks.
- **End-to-end modes:** messages in Ephemeral and Peer-to-peer chats are not readable by the server, but their metadata (sender, recipient, time) is, and Standard chats are stored readable. The answers therefore declare message content as collected.
- **Third parties receiving data:** Apple (push delivery) and Cloudflare (tunnel, DNS, mail). Neither receives data for its own advertising or tracking.
- **Privacy manifest:** the build should carry the required-reason API declarations that the Expo modules ship. Before each submission, check the Xcode privacy report for any SDK that declares tracking domains; none is expected.

## Open points for the owner

- Confirm the Product Interaction answer (usage counters).
- Confirm the account-deletion flow still matches the 14 day schedule in the policy once message deletion and timers ship.
- Update this page and the policy together whenever a new SDK, permission or data field is added.

## Export compliance

Voics uses industry standard algorithms that iOS does not provide, for end-to-end encryption. Apple's [export documentation](https://developer.apple.com/help/app-store-connect/reference/export-compliance-documentation-for-encryption/) then asks only for a French encryption declaration, and only for distribution in France.

- `ITSAppUsesNonExemptEncryption` stays `false`. With `true`, Apple rejects the upload (error 90592) unless the app also carries an approved `ITSEncryptionExportComplianceCode`.
- France stays out of the app's availability until a declaration to ANSSI is filed and uploaded.
- Open for the owner: check whether a yearly self-classification report to the US Bureau of Industry and Security applies. Apple leaves this assessment and its liability with the developer.

## App Store Connect status

- Seller: the Account Holder of the individual Apple account (`M T`), which also appears as controller on the privacy page. The owner chose this on 2026-11-06. Initials may not identify the controller well enough for the GDPR, so a full name is the safer choice.
- Digital Services Act: non-trader, active. The company name, address and registration number were removed from the website and the beta licence.
- Availability: every territory except France (no ANSSI declaration yet) and China (CallKit).
- Price: free. Age rating: 16+. iPhone only for the first release.
- Reviewers can register in the app, and the owner entered a test login in App Store Connect.
- Screenshots come from the browser preview with demo data on the local stack. Replace them with real iPhone screenshots when available.
- App Privacy answers are entered on the website only; this page holds them.
