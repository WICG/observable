# Sharing design notes

This draft implements [proposal #221](https://github.com/WICG/observable/issues/221).
The [specification](../spec.bs) defines the algorithms; the
[reference implementation](../reference-implementation/README.md) makes them executable.

## Decisions for this draft

- Ordinary `Observable` production and operator state are per subscription.
- `SharedObservable` and `share()` explicitly establish shared boundaries.
- Both constructors support a callback or `{ producer, sharedSources }` object.
  Shared construction also accepts the five sharing settings.
- All four introspection properties are included: `sharedSources`,
  `activeSubscribers`, `replayValues`, and `maxReplayValues`.
- Shared instances inherit from `Observable.prototype`. The shared constructor
  does not inherit static `Observable` methods, so `SharedObservable.from` is absent.
- `subscribe()` is the sole public consuming method. Promise-returning consumers
  are removed, while Promise inputs remain supported.
- `scan()` and `takeLast()` remain options for later consideration.

The issue intentionally leaves introspection and the prototype hierarchy open for
discussion. The choices above make this repository's draft concrete without
claiming standards consensus. No native `lift`, `operate`, retry, or restart API
has been added.

## Lifetime transitions

| Trigger | Settings | Result |
| --- | --- | --- |
| First eligible subscription | Any | Start the lazy producer. |
| Subscription during execution | Any | Register, replay a snapshot, then share live delivery. |
| Last observation cancels | Both last-unsubscribe flags false | Stop, clean up, clear replay, permit a later execution. |
| Last observation cancels | `closeOnLastUnsubscribe` | Stop, clean up, retain replay and completion forever. |
| Last observation cancels | `keepAliveOnLastUnsubscribe` | Keep running, including retaining configured replay. |
| Producer completes | `closeOnComplete` or `{ close: true }` | Stop, clean up, retain replay and completion. |
| Producer errors | `closeOnError` or `{ close: true }` | Stop, clean up, retain replay and error. |
| Other producer terminal call | Any observer count | Stop, clean up, reset and clear replay. |
| Subscription after closure | Any | Replay retained values and outcome; never start again. |

Both last-unsubscribe flags cannot be true. A terminal call removes observations
without invoking the last-unsubscribe policy. Completion/error always ends the
execution, even if keep-alive left it with no observers. Reset is not an automatic
retry: only a subsequent subscription starts another execution.

An observation that arrives with an already-aborted signal does nothing.
Cancellation during replay stops the remaining snapshot and terminal delivery.
Each observer cancels only its own participation in shared work.

## Delivery and reentrancy

1. Retain a live value before notifying a fixed snapshot of current recipients.
   This lets a subscriber joining during `next` receive the value through replay
   exactly once, or miss it when replay is disabled.
2. Register a new observation before replaying a fixed history snapshot. Nested
   live delivery happens immediately and may interleave with the replay.
3. Check execution and observation guards before each delivery. A reentrant
   terminal call stops pending live values and the rest of any replay snapshot.
4. Convert `config.close` before checking whether a producer can terminate. Its
   getter may cancel the old execution and start a replacement.
5. Commit reset or closure and stop delivery before abort algorithms and teardown
   run. Run registered cleanup before terminal callbacks.
6. Keep cancellation effective while delivering captured terminal notifications.
   An earlier observer can cancel a later observer's pending terminal callback.
7. Keep old execution state separate from replacement state. Old subscribers
   cannot reset, close, or route values into a replacement execution.

There is no scheduler or catch-up queue. For example, the issue's nested live
delivery during replay intentionally produces `[1, 2, 4, 3]`, or `[1, 4, 3, 2]`
when triggered during the first replayed value. These sequences are covered by
the lifecycle tests.

`take` commits its remaining allowance and aborts its own upstream observation
before delivering the final value. The downstream subscriber remains active for
that delivery unless teardown cancels it reentrantly. `switchMap` similarly
publishes its replacement identity before old cleanup runs; a newer reentrant
switch cannot be overwritten by the older one.

Observer exceptions are reported without terminating other observations.
Producer or operator callback exceptions error their current execution.
Inactive `Subscriber.error()` reports its reason; inactive `next()` and
`complete()` do nothing after argument conversion. Late teardown runs immediately.

## Metadata and wrappers

Nearest known shared inputs are copied, validated, deduplicated, and exposed as
frozen snapshots. An empty declaration normalizes to `null`. Native operators
propagate the shared receiver itself or an ordinary receiver's declarations;
`takeUntil` also includes its converted notifier, after the receiver's sources.

Custom producers must declare ancestry explicitly. Dynamic inner sources and
hidden resources are not automatically tracked. References are actual observable
objects, so metadata intentionally allows upstream observation and replay
inspection. Counts include internal operator subscriptions and are not a lock.

`share(config)` on shared input inherits omitted settings. Equal normalized
settings preserve identity, even after closure. Different settings create an
independent forwarding boundary whose metadata contains the original instance.
It does not copy the original producer or its retained history. Source lifetime
still applies, and wrapper terminal policy does not inherit producer `close`
flags through Observer callbacks.

The additional bookkeeping for custom operators remains a cost of introspection.
A library can provide a metadata-preserving composition helper. Automatically
discovering ancestry through Async Context remains outside this draft.

## Optional composition additions

These are documented for discussion and are **not implemented or included in the
normative API**:

- `takeLast(count = 1)`: a finite, nonnegative safe-integer buffer, flushed oldest
  first only on completion. Errors and cancellation discard it. Zero completes
  without subscribing upstream; an empty source emits nothing.
- `scan(reducer, seed?)`: emit each accumulated value. With a seed, invoke the
  reducer on every value, starting at source index 0, without emitting the seed
  alone. Without a seed, emit the first value as the accumulator and start calls
  at index 1. Explicit `undefined` supplies a seed; omission does not. Empty
  sources emit nothing. Reducer exceptions error the observation.

Both would return ordinary observables. `scan(...).takeLast(1)` would not recreate
seeded `reduce` on an empty source, because it would emit nothing.
