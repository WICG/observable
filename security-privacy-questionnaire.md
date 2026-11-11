# Observable API: Security and Privacy Questionnaire Answers

The following are the answers to the W3C TAG's [security and privacy self-review
questionnaire](https://w3ctag.github.io/security-questionnaire/).

**What information does this feature expose, and for what purposes?**

Event observation exposes the same events as existing event listeners.
`sharedSources` also exposes explicitly declared upstream SharedObservable
references, `activeSubscribers` exposes their current observation counts, and
`replayValues` exposes retained values. These are passive inspections of objects
already shared by script; declared references intentionally permit upstream
observation. They do not grant access across origin boundaries.

**Do features in your specification expose the minimum amount of information necessary to implement the intended functionality?**

Yes.

**Do the features in your specification expose personal information, personally-identifiable information (PII), or information derived from either?**

No.

**How do the features in your specification deal with sensitive information?**

Values can contain application-sensitive information, as can existing event
payloads. Replay retains those values by reference and exposes them to later
observers of the same shared instance. Producers choose the replay capacity and
lifetime policy before exposing it. Reset clears retained values; permanent
closure retains them. Capacity limits value count, not retained object sizes.

**Do the features in your specification introduce state that persists across browsing sessions?**

No.

**Do the features in your specification expose information about the underlying platform to origins?**

No.

**Does this specification allow an origin to send data to the underlying platform?**

No.

**Do features in this specification enable access to device sensors?**

No.

**Do features in this specification enable new script execution/loading mechanisms?**

No.

**Do features in this specification allow an origin to access other devices?**

No.

**Do features in this specification allow an origin some measure of control over a user agent's native UI?**

No.

**What temporary identifiers do the features in this specification create or expose to the web?**

No identifiers.

**How does this specification distinguish between behavior in first-party and third-party contexts?**

It doesn't. Specifically, event handling bubbles/captures in the same way as it
does before: *not* crossing the frame boundary.

**How do the features in this specification work in the context of a browser’s Private Browsing or Incognito mode?**

This proposal prescribes *no* difference. Any difference that there might be
would be a result of the browser's intervening on behalf of certain trusted,
script-exposed events, but we are not aware of any examples of this, and these
are already relevant to today's existing event handling mechanisms and exist
outside of this API's purview.

**Does this specification have both "Security Considerations" and "Privacy Considerations" sections?**

Yes. The specification includes a combined Security & Privacy Considerations
section covering retained data, shared references, counts, and resource lifetime.

**Do features in your specification enable origins to downgrade default security protections?**

No.

**What happens when a document that uses your feature is kept alive in BFCache (instead of getting destroyed) after navigation, and potentially gets reused on future navigations back to the document?**

The specification guards subscription and Subscriber delivery when the associated
Document is not fully active. Event production still follows the underlying
platform source's lifecycle. Keep-alive does not bypass these guards. The
JavaScript reference implementation cannot reproduce the browser's native
document-liveness integration.

**What happens when a document that uses your feature gets disconnected?**

Subscription and Subscriber operations are guarded by the associated Document's
fully-active state. Cleanup and underlying platform resources also follow their
existing document lifecycle rules.

**What should this questionnaire have asked?**

N/A.
