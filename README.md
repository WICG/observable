# Observable and SharedObservable

This repository contains the specification, explainer, and JavaScript reference
implementation of [issue #221](https://github.com/WICG/observable/issues/221).
`Observable` runs its producer independently for each subscription.
`SharedObservable` shares one current execution. The source owner chooses which
to expose; consumers use the same subscription interface for both.

- [Specification source](spec.bs)
- [Reference implementation and usage](reference-implementation/README.md)
- [Proposal decisions and optional additions](docs/sharing.md)
- Run `npm test` for the reference tests or `npm run demo` for a short example.

The published specification may lag this working draft. This is a proposed API,
and an existing browser's `Observable` implementation may have different behavior.

## EventTarget integration

`EventTarget.when()` returns an ordinary observable. Each subscription installs
its own event listener; aborting that subscription removes its listener.
Construction and composition do not add listeners.

```js
const clicks = button.when('click')
  .filter(event => event.target.matches('.action'))
  .map(event => ({ x: event.clientX, y: event.clientY }));

const lifetime = new AbortController();
clicks.subscribe(point => console.log(point), { signal: lifetime.signal });
// Later:
lifetime.abort();
```

Delivery is synchronous, including replay. Live event handlers can cancel DOM
defaults during dispatch:

```js
form.when('submit', { passive: false })
  .subscribe(event => event.preventDefault());
```

Replay of an old event repeats consumer callbacks; it cannot undo an event's
already-performed default action. Use replay for data when that is the intended
contract, rather than replaying commands or navigation accidentally.

## Creating observables

Both constructors accept a producer callback, or a configuration object with a
`producer` callback. Construction is lazy. `subscribe()` is the only public
consuming method and returns `undefined`. Callbacks can run before it returns.

```js
const ticks = new Observable(subscriber => {
  let tick = 0;
  const timer = setInterval(() => subscriber.next(++tick), 1000);
  subscriber.addTeardown(() => clearInterval(timer));
});

ticks.take(3).subscribe(console.log); // Its own timer and counter.
ticks.take(3).subscribe(console.log); // Another timer and counter.
```

The producer receives a `Subscriber` with `next(value)`, `error(reason, config?)`,
`complete(config?)`, `addTeardown(callback)`, `active`, and `signal`. There is no
public Subscriber constructor. Cleanup runs when production ends or its
observation is canceled, with registered teardown callbacks in reverse order.
Teardown registered after termination runs immediately. Exceptions thrown by
observers are reported globally without breaking delivery to other observers.

An already-aborted subscription is inert. For synchronous sources, create the
AbortController before subscribing:

```js
const stop = new AbortController();
Observable.from([1, 2, 3]).subscribe(value => {
  console.log(value); // 1, 2
  if (value === 2) stop.abort();
}, { signal: stop.signal });
```

### Conversion

`Observable.from(input)` accepts objects in this order:

1. Native `Observable` or `SharedObservable`: returns the same instance.
2. Async iterable: obtains an iterator for each subscription.
3. Iterable: obtains an iterator for each subscription.
4. Promise: observes that existing Promise.

Other inputs, including arbitrary thenables, objects with only `subscribe`, and
primitive strings, throw `TypeError`. Conversion of a Promise does not recreate
the operation that produced it. Reobserving an iterator object does not rewind it.
A fresh operation requires a source-owned factory.

There is no `SharedObservable.from()`. Use `Observable.from(input).share(config)`.

## Explicit sharing

`share()` establishes a lazy shared boundary. By default, overlapping observers
share an execution. The last unsubscribe stops it and clears replay; a later
subscription starts a new execution. Completion and error reset the instance too.
Reset permits a later attempt; it does not automatically retry.

```js
const sharedTicks = ticks.share();
sharedTicks.subscribe(updateClock);
sharedTicks.filter(tick => tick % 2 === 0).subscribe(updateChart);
// One timer while these observations overlap.
```

Producers can expose that policy directly:

```js
function socketMessages(url) {
  return new SharedObservable(subscriber => {
    const socket = new WebSocket(url);
    subscriber.addTeardown(() => socket.close());
    socket.onmessage = event => subscriber.next(event.data);
    socket.onerror = event => subscriber.error(event);
    socket.onclose = () => subscriber.complete();
  });
}
```

Each call creates a distinct shared instance. Canceling one observer only detaches
that observer. Shared work owns its upstream observation and continues for the others.

### Sharing configuration

These options work with `new SharedObservable({ producer, ...options })` and
`observable.share(options)`:

| Option | Default | Meaning when enabled |
| --- | --- | --- |
| `maxReplayValues` | `0` | Retain up to this many values for synchronous replay, oldest first. |
| `closeOnComplete` | `false` | Retain replay and completion permanently. |
| `closeOnError` | `false` | Retain replay and error permanently. |
| `closeOnLastUnsubscribe` | `false` | Stop on last cancellation and retain replay followed by completion. |
| `keepAliveOnLastUnsubscribe` | `false` | Continue the current execution with no observers. |

Replay capacity must convert to a finite, nonnegative safe integer; invalid
capacities throw `RangeError`. Boolean settings use ordinary boolean conversion.
Enabling both last-unsubscribe flags throws `TypeError`. They apply only when a
running execution loses its final observation through cancellation, and never
override producer completion or error.

To cache a successful request while permitting retry after failure:

```js
const profile = new SharedObservable({
  maxReplayValues: 1,
  closeOnComplete: true,
  keepAliveOnLastUnsubscribe: true,
  producer(subscriber) {
    fetch('/profile', { signal: subscriber.signal })
      .then(response => response.json())
      .then(profile => {
        subscriber.next(profile);
        subscriber.complete();
      }, error => subscriber.error(error));
  },
});

profile.subscribe({ next: renderHeader, error: showError });
profile.subscribe({ next: renderSidebar, error: showError });
// Share an in-flight request or replay its successful parsed result.
```

Keep one instance per operation when observers should share it. This only shares
work within that instance; server-enforced operation IDs are needed to deduplicate
submissions across retries, reloads, tabs, or separate instances.

Calling `share()` on a shared instance inherits omitted or undefined settings.
If all five normalized settings match, it returns the same instance, even when
closed. Different settings create a wrapper with its own replay and lifetime.
The wrapper cannot reopen its source, recover discarded history, or override the
source's lifetime. Explicitly disable an inherited last-unsubscribe flag before
enabling its opposite.

### Producer-selected permanent closure

```js
const result = new SharedObservable({
  maxReplayValues: 1,
  keepAliveOnLastUnsubscribe: true,
  producer(subscriber) {
    subscriber.next(42);
    subscriber.complete({ close: true });
  },
});

result.take(1).subscribe(console.log); // 42
result.subscribe(console.log);         // Replayed 42, then completion; no rerun.
```

`error(reason, { close: true })` permanently retains an error instead. The close
option is local to the producing owner and is not passed to Observer callbacks.
On an ordinary observable it ends only that execution, leaving siblings and
future subscriptions unaffected. Consumers have no public `close()` method.

Keep-alive matters in this example: `take(1)` detaches upstream **before** forwarding
its final value. Without keep-alive, last-observer reset would stop the execution
before the producer reached `complete({ close: true })`.

## Operators

Every composition operator returns an ordinary observable, including on shared
input. Each observation gets its own counters and callback state. Put `share()`
after the work or state that should happen once:

```js
const trackedClicks = button.when('click')
  .inspect(() => sendAnalytics('click'))
  .share();

trackedClicks.subscribe(updateCounter);
trackedClicks.subscribe(updateChart);
// One analytics call per click while observed.
```

Moving `share()` before `inspect()` runs analytics per observation. Storing an
ordinary operator result in a variable does not share its state:

```js
const liveTicks = ticks.share();
const perObserver = liveTicks.take(3);
const oneSession = liveTicks.take(3).share({ closeOnComplete: true });
// A starts before tick 1; B joins after tick 1:
// perObserver: A gets [1, 2, 3], B gets [2, 3, 4].
// oneSession:  A gets [1, 2, 3], B gets [2, 3].
```

| Method | Behavior |
| --- | --- |
| `map(mapper)` | Transform values with a per-observation zero-based index. |
| `filter(predicate)` | Forward matching values with a per-observation index. |
| `take(amount)` | Forward at most `amount`; detach before the final value. Zero skips upstream entirely. |
| `drop(amount)` | Skip the first `amount` values. |
| `takeUntil(notifier)` | Observe notifier first; complete on its next or error. Notifier completion alone does not stop the source. |
| `flatMap(mapper)` | Map and consume inner inputs sequentially, queueing outer values until the current inner completes. |
| `switchMap(mapper)` | Detach the previous inner before mapping and observing its replacement. |
| `inspect(inspector?)` | Observe next, error, complete, subscribe, and consumer abort. A function inspects next values. |
| `catch(callback)` | Replace a failed observation with the returned Observable input. |
| `finally(callback)` | Run cleanup on completion, error, or cancellation. |

`take` and `drop` retain the existing unsigned-long-long argument conversion.
Inputs to `takeUntil`, inner mapping, and recovery use the same conversion as
`Observable.from()`. Callback exceptions error the result; observer exceptions
are reported globally. Cleanup runs before terminal callbacks and replacement work.

Promise-returning `toArray`, `forEach`, `every`, `some`, `first`, `last`, `find`,
and `reduce` are omitted. `scan` and `takeLast` remain
[documented options for later](docs/sharing.md#optional-composition-additions),
not methods in this draft. There are no native `retry`, `repeat`, or `restart` methods.

## Introspection and custom composition

`sharedSources` is a frozen array of nearest declared upstream shared boundaries,
deduplicated in input order, or `null` when none are declared. A shared input is
itself a boundary; an ordinary input passes its declared boundaries through.
`takeUntil` considers the receiver first, then the notifier.

```js
const messages = socketMessages(url);
const stop = button.when('click').share();
const view = messages.map(parseMessage).takeUntil(stop);

console.log(view.sharedSources); // [messages, stop]
console.log(messages.activeSubscribers); // Current observations, including operators.
console.log(messages.replayValues);       // Frozen snapshot, oldest first.
console.log(messages.maxReplayValues);    // Configured capacity.
```

Inspection never starts work. Counts are snapshots, not locks or reliable counts
of other UI consumers. References intentionally allow upstream observation;
values are not deep-frozen. `null` does not prove absence of sharing, hidden
resources, or side effects. Dynamic inner sources are not automatically recorded.

A custom operator can preserve known ancestry with the object constructor:

```js
function withTimestamp(source) {
  return new Observable({
    sharedSources: source instanceof SharedObservable
      ? [source]
      : source.sharedSources,
    producer(subscriber) {
      source.subscribe({
        next: value => subscriber.next({ value, time: Date.now() }),
        error: error => subscriber.error(error),
        complete: () => subscriber.complete(),
      }, { signal: subscriber.signal });
    },
  });
}
```

Shared instances inherit `Observable.prototype`, so they pass `instanceof Observable`.
Custom metadata propagation remains a tradeoff of including introspection.
See [the design notes](docs/sharing.md) for open questions and lifecycle details.

## Background & landscape

To illustrate how Observables fit into the current landscape of other reactive
primitives, see the below table which is an attempt at combining
[two](https://github.com/kriskowal/gtor#a-general-theory-of-reactivity)
other [tables](https://rxjs.dev/guide/observable) that classify reactive
primitives by their interaction with producers & consumers:

<table>
  <thead>
    <tr>
      <th></th>
      <th colspan="2">Singular</th>
      <th colspan="2">Plural</th>
    </tr>
    <tr>
      <th></td>
      <th>Spatial</th>
      <th>Temporal</th>
      <th>Spatial</th>
      <th>Temporal</th>
    </tr>
  </thead>
 <tbody>
    <tr>
      <th>Push</th>
      <td>Value</td>
      <td>Promise</td>
      <td colspan="2">Observable</td>
    </tr>
    <tr>
      <th>Pull</th>
      <td>Function</td>
      <td>Async iterator</td>
      <td>Iterable</td>
      <td>Async iterator</td>
    </tr>
  </tbody>
</table>

### History

Observables were first proposed to the platform in [TC39](https://github.com/tc39/proposal-observable)
in May of 2015. The proposal failed to gain traction, in part due to some opposition that
the API was suitable to be a language-level primitive. In an attempt to renew the proposal
at a higher level of abstraction, a WHATWG [DOM issue](https://github.com/whatwg/dom/issues/544) was
filed in December of 2017. Despite ample [developer demand](https://foolip.github.io/spec-reactions/),
_lots_ of discussion, and no strong objectors, the DOM Observables proposal sat mostly still for several
years (with some flux in the API design) due to a lack of implementer prioritization.

Later in 2019, [an attempt](https://github.com/tc39/proposal-observable/issues/201) at reviving the
proposal was made back at the original TC39 repository, which involved some API simplifications and
added support for the synchronous "firehose" problem.

This repository is an attempt to again breathe life into the Observable proposal with the hope
of shipping a version of it to the Web Platform.

### Userland libraries

In [prior discussion](https://github.com/whatwg/dom/issues/544#issuecomment-1433955626),
[Ben Lesh](https://github.com/benlesh) has listed several custom userland implementations of
observable primitives, of which RxJS is the most popular with "47,000,000+ downloads _per week_."

- [RxJS](https://github.com/ReactiveX/rxjs/blob/9ddc27dd60ac23e95b2503716ae8013e64275915/src/internal/Observable.ts#L10): Started as a reference implementation of the TC39 proposal, is nearly identical to this proposal's observable.
- [Relay](https://github.com/facebook/relay/blob/af8a619d7f61ea6e2e26dd4ac4ab1973d68e6ff9/packages/relay-runtime/network/RelayObservable.js): A mostly identical contract with the addition of `start` and `unsubscribe` events for observation and acquiring the `Subscription` prior to the return.
- [tRPC](https://github.com/trpc/trpc/blob/21bcb5e6723023d3acb0b836b63627922407c682/packages/server/src/observable/observable.ts): A nearly identical implemention of observable to this proposal.
- [XState](https://github.com/statelyai/xstate/blob/754afa022047518ef4813f7aa85398218b39f960/packages/core/src/types.ts#L1711C19-L1737): uses an observable interface in several places in their library, in particular for their `Actor` type, to allow [subscriptions to changes in state, as shown in their `useActor` hook](https://github.com/statelyai/xstate/blob/754afa022047518ef4813f7aa85398218b39f960/packages/xstate-solid/src/useActor.ts#L47-L51). Using an identical observable is also a [documented part](https://github.com/statelyai/xstate/blob/754afa022047518ef4813f7aa85398218b39f960/packages/xstate-solid/README.md?plain=1#L355-L368) of access state machine changes when using XState with SolidJS.
- [SolidJS](https://github.com/solidjs/solid/blob/46e5e78710cdd9f170a7afd0ddc5311676d3532a/packages/solid/src/reactive/observable.ts#L46): An identical interface to this proposal is exposed for users to use.
- [Apollo GraphQL](https://github.com/apollographql/apollo-client/blob/a1dac639839ffc5c2de332db2ee4b29bb0723815/src/utilities/observables/Observable.ts): Actually re-exporting from [zen-observable](https://github.com/zenparsing/es-observable) as [their own thing](https://github.com/apollographql/apollo-client/blob/a1dac639839ffc5c2de332db2ee4b29bb0723815/src/core/index.ts#L76), giving some freedom to reimplement on their own or pivot to something like RxJS observable at some point.
- [zen-observable](https://github.com/zenparsing/zen-observable/tree/8406a7e3a3a3faa080ec228b9a743f48021fba8b): A reference implementation of the TC39 observable proposal. Nearly identical to this proposal.
- [React Router](https://github.com/remix-run/react-router/tree/610ce6edf0993384300ff3172fc6db00ead50d33): Uses a `{ subscribe(callback: (value: T) => void): () => void }` pattern in their [Router](https://github.com/remix-run/react-router/blob/610ce6edf0993384300ff3172fc6db00ead50d33/packages/router/router.ts#L931) and [DeferredData](https://github.com/remix-run/react-router/blob/610ce6edf0993384300ff3172fc6db00ead50d33/packages/router/utils.ts#L1338) code. This was pointed out by maintainers as being inspired by Observable.
- [Preact](https://github.com/preactjs/preact/blob/ac1f145877a74e49f4c341e6acbf888a96e60afe/src/jsx.d.ts#LL69C1-L73C3) Uses a `{ subscribe(callback: (value: T) => void): () => void }` interface for their signals.
- [TanStack](https://github.com/TanStack/query/blob/878d85e44c984822e2e868af94003ec260ddf80f/packages/query-core/src/subscribable.ts): Uses a subscribable interface that matches `{ subscribe(callback: (value: T) => void): () => void }` in [several places](https://github.com/search?q=repo%3ATanStack/query%20Subscribable&type=code)
- [Redux](https://github.com/reduxjs/redux/blob/c2b9785fa78ad234c4116cf189877dbab38e7bac/src/createStore.ts#LL344C12-L344C22): Implements an observable that is nearly identical to this proposal's observable as a means of subscribing to changes to a store.
- [Svelte](https://github.com/sveltejs/svelte): Supports [subscribing](https://github.com/sveltejs/svelte/blob/3bc791bcba97f0810165c7a2e215563993a0989b/src/runtime/internal/utils.ts#L69) to observables that fit this exact contract, and also exports and uses a [subscribable contract for stores](https://github.com/sveltejs/svelte/blob/3bc791bcba97f0810165c7a2e215563993a0989b/src/runtime/store/index.ts) like `{ subscribe(callback: (value: T) => void): () => void }`.
- [Dexie.js](https://github.com/dexie/Dexie.js): Has an [observable implementation](https://github.com/solidjs/solid/blob/46e5e78710cdd9f170a7afd0ddc5311676d3532a/packages/solid/src/reactive/observable.ts#L46) that is used for creating [live queries](https://github.com/dexie/Dexie.js/blob/bf9004b26228e43de74f7c1fa7dd60bc9d785e8d/src/live-query/live-query.ts#L36) to IndexedDB.
- [MobX](https://github.com/mobxjs/mobx): Uses [similar interface](https://github.com/mobxjs/mobx/blob/7cdc7ecd6947a6da10f10d2e4a1305297b816007/packages/mobx/src/types/observableobject.ts#L583) to Observable internally for observation: `{ observe_(callback: (value: T)): () => void }`.

### UI Frameworks Supporting Observables

- [Svelte](https://github.com/sveltejs/svelte): Directly supports implicit subscription and unsubscription to observables simply by binding to them in templates.
- [Angular](https://github.com/angular/angular): Directly supports implicit subscription and unsubscription to observables using their `| async` "async pipe" functionality in templates.
- [Vue](https://github.com/vuejs/vuejs): maintains a [dedicated library](https://github.com/vuejs/vue-rx) specifically for using Vue with RxJS observables.
- [Cycle.js](https://github.com/cyclejs/cyclejs): A UI framework built entirely around observables

Given the extensive prior art in this area, there exists a public
"[Observable Contract](https://reactivex.io/documentation/contract.html)".

Additionally many JavaScript APIs been trying to adhere to the contract defined by the [TC39 proposal from 2015](https://github.com/tc39/proposal-observable).
To that end, there is a library, [symbol-observable](https://www.npmjs.com/package/symbol-observable?activeTab=dependents),
that ponyfills (polyfills) `Symbol.observable` to help with interoperability between observable types that adheres to exactly
the interface defined here. `symbol-observable` has 479 dependent packages on npm, and is downloaded more than 13,000,000 times
per week. This means that there are a minimum of 479 packages on npm that are using the observable contract in some way.

This is similar to how [Promises/A+](https://promisesaplus.com/) specification that was developed before `Promise`s were
adopted into ES2015 as a first-class language primitive.

## Standards venue

There's been much discussion about which standards venue should ultimately host an Observables
proposal. The venue is not inconsequential, as it effectively decides whether Observables becomes a
language-level primitive like `Promise`s, that ship in all JavaScript browser engines, or a web platform
primitive with likely (but technically _optional_) consideration in other environments like Node.js
(see [`AbortController`](https://nodejs.org/api/globals.html#class-abortcontroller) for example).

Observables purposefully integrate frictionlessly with the main event-emitting interface
(`EventTarget`) and cancellation primitive (`AbortController`) that live in the Web platform. As
proposed here, observables join this existing strongly-connected component from the [DOM
Standard](https://github.com/whatwg/dom): Observables depend on AbortController/AbortSignal, which
depend on EventTarget, and EventTarget depends on both Observables and AbortController/AbortSignal.
Because we feel that Observables fits in best where its supporting primitives live, the WHATWG
standards venue is probably the best place to advance this proposal. Additionally, non-Web
ECMAScript embedders like Node.js and Deno would still be able to adopt Observables, and are even
likely to, given their commitment to Web platform [aborting and
events](https://github.com/whatwg/dom/blob/bf5f6c2a8f2d770da884cb52f5625c59b5a880e7/PULL_REQUEST_TEMPLATE.md).

This does not preclude future standardization of event-emitting and cancellation primitives in TC39
in the future, something Observables could theoretically be layered on top of later. But for now, we
are motivated to make progress in WHATWG.

In attempt to avoid relitigating this discussion, we'd urge the reader to see the following
discussion comments:

- https://github.com/whatwg/dom/issues/544#issuecomment-351520728
- https://github.com/whatwg/dom/issues/544#issuecomment-351561091
- https://github.com/whatwg/dom/issues/544#issuecomment-351582862
- https://github.com/whatwg/dom/issues/544#issuecomment-351607779
- https://github.com/whatwg/dom/issues/544#issuecomment-351718686

## Standards issues

This section bares a collection of web standards and standards positions issues
used to track the Observable proposal's life outside of this repository.

 - [Mozilla standards
   position](https://github.com/mozilla/standards-positions/issues/945)
 - [WebKit standards
   position](https://github.com/WebKit/standards-positions/issues/292)
 - [Chrome Status](https://chromestatus.com/feature/5154593776599040)
 - [WinterCG](https://github.com/wintercg/proposal-common-minimum-api/issues/72)
 - [Node.js](https://github.com/nodejs/standards-positions/issues/1)
 - [W3C TAG review](https://github.com/w3ctag/design-reviews/issues/902)

## User needs

Observables are designed to make event handling more ergonomic and composable.
As such, their impact on end users is indirect, largely coming in the form of
users having to download less JavaScript to implement patterns that developers
currently use third-party libraries for. As stated [above in the
explainer](https://github.com/domfarolino/observable#userland-libraries), there
is a thriving userland Observables ecosystem which results in loads of excessive
bytes being downloaded every day.

In an attempt to codify the strong userland precedent of the Observable API,
this proposal would save dozens of custom implementations from being downloaded
every day.

Additionally, as an API like `EventTarget`, `AbortController`, and one related
to `Promise`s, it enables developers to build less-complicated event handling
flows by constructing them declaratively, which may enable them to build more
sound user experiences on the Web.

## Authors:

- [Dominic Farolino](https://github.com/domfarolino)
- [Ben Lesh](https://github.com/benlesh)
