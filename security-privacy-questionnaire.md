# Observable API: Security and Privacy Questionnaire Answers

The following are the answers to the W3C TAG's [security and privacy self-review
questionnaire](https://w3ctag.github.io/security-questionnaire/).

**What information does this feature expose, and for what purposes?**

This API exposes the same event handling information as the web's existing
native event handling mechanism, just in a more ergonomic way.

**Do features in your specification expose the minimum amount of information necessary to implement the intended functionality?**

Yes.

**Do the features in your specification expose personal information, personally-identifiable information (PII), or information derived from either?**

No.

**How do the features in your specification deal with sensitive information?**

There isn't really sensitive information directly involved with this API. In
this area, its properties are the same as the web's native event handling mechanism.

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

No, there is no specification just yet.

**Do features in your specification enable origins to downgrade default security protections?**

No.

**What happens when a document that uses your feature is kept alive in BFCache (instead of getting destroyed) after navigation, and potentially gets reused on future navigations back to the document?**

The same exact thing that happens with the web's native event handling
mechanisms, which this API largely piggy-backs off of. Assuming events are
"paused" in those contexts (either by pausing script execution or making it
impossible for users to trigger script-observable events), then an Observable's
handlers would not be called, because the stream of events would be inactive for
a period of time. But otherwise, this API does not prescribe anything specific.

**What happens when a document that uses your feature gets disconnected?**

Nothing specific to this API. Any event sources that are stopped, because script
execution is stopped, would result in an Observable whose handlers stop getting
fired.

**What should this questionnaire have asked?**

N/A.
