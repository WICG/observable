# Observable

This is the explainer for the Observable API proposal for more ergonomic and
composable event handling.

## Introduction

### `EventTarget` integration

This proposal adds an `.on()` method to `EventTarget` that becomes a better
`addEventListener()`; specifically it returns a [new
`Observable`](#the-observable-api) that adds a new event listener to the target
when its `subscribe()` method is called. The Observable calls the subscriber's
`next()` handler with each event.

Observables turn event handling, filtering, and termination, into an explicit, declarative flow
that's easier to understand and
[compose](https://stackoverflow.com/questions/44112364/what-does-this-mean-in-the-observable-tc-39-proposal)
than today's imperative version, which often requires nested calls to `addEventListener()` and
hard-to-follow callback chains.

#### Example 1

```js
// Filtering and mapping:
element
	.on('click')
	.filter((e) => e.target.matches('.foo'))
	.map((e) => ({ x: e.clientX, y: e.clientY }))
	.subscribe({ next: handleClickAtPoint });
```

#### Example 2

```js
// Automatic, declarative unsubscription via the takeUntil method:
element.on('mousemove')
  .takeUntil(document.on('mouseup'))
  .subscribe({next: e => … });

// Since reduce and some other terminators return promises, they also play
// well with async functions:
await element.on('mousemove')
  .takeUntil(element.on('mouseup'))
  .reduce((soFar, e) => …);
```

<details>
<summary>Imperative version</summary>

```js
// Imperative
const controller = new AbortController();
element.addEventListener(
	'mousemove',
	(e) => {
		element.addEventListener('mouseup', (e) => controller.abort());
		console.log(e);
	},
	{ signal: controller.signal },
);
```

</details>

#### Example 3

Tracking all link clicks within a container
([example](https://github.com/whatwg/dom/issues/544#issuecomment-351705380)):

```js
container
	.on('click')
	.filter((e) => e.target.closest('a'))
	.subscribe({
		next: (e) => {
			// …
		},
	});
```

#### Example 4

Find the maximum Y coordinate while the mouse is held down
([example](https://github.com/whatwg/dom/issues/544#issuecomment-351762493)):

```js
const maxY = await element
	.on('mousemove')
	.takeUntil(element.on('mouseup'))
	.map((e) => e.clientY)
	.reduce((soFar, y) => Math.max(soFar, y), 0);
```

#### Example 5

Multiplexing a `WebSocket`, such that a subscription message is send on connection,
and an unsubscription message is send to the server when the user unsubscribes.

```js
const socket = new WebSocket('wss://example.com');

function multiplex({ startMsg, stopMsg, match }) {
  if (socket.readyState !== WebSocket.OPEN) {
    return socket
      .on('open')
      .flatMap(() => multiplex({ startMsg, stopMsg, match }));
  } else {
    socket.send(JSON.stringify(startMsg));
    return socket
      .on('message')
      .filter(match)
      .takeUntil(socket.on('close'))
      .takeUntil(socket.on('error'))
      .map((e) => JSON.parse(e.data))
      .finally(() => {
        socket.send(JSON.stringify(stopMsg));
      });
  }
}

function streamStock(ticker) {
  return multiplex({
    startMsg: { ticker, type: 'sub' },
    stopMsg: { ticker, type: 'unsub' },
    match: (data) => data.ticker === ticker,
  });
}

const googTrades = streamStock('GOOG');
const nflxTrades = streamStock('NFLX');

const googController = new AbortController();
const googSubscription = googTrades.subscribe({next: updateView}, {signal: googController.signal});
const nflxSubscription = nflxTrades.subscribe({next: updateView, ...});

// And the stream can disconnect later, which
// automatically sends the unsubscription message
// to the server.
googController.abort();
```

<details>
<summary>Imperative version</summary>

```js
// Imperative
function multiplex({ startMsg, stopMsg, match }) {
	const start = (callback) => {
		const teardowns = [];

		if (socket.readyState !== WebSocket.OPEN) {
			const openHandler = () => start({ startMsg, stopMsg, match })(callback);
			socket.addEventListener('open', openHandler);
			teardowns.push(() => {
				socket.removeEventListener('open', openHandler);
			});
		} else {
			socket.send(JSON.stringify(startMsg));
			const messageHandler = (e) => {
				const data = JSON.parse(e.data);
				if (match(data)) {
					callback(data);
				}
			};
			socket.addEventListener('message', messageHandler);
			teardowns.push(() => {
				socket.send(JSON.stringify(stopMsg));
				socket.removeEventListener('message', messageHandler);
			});
		}

		const finalize = () => {
			teardowns.forEach((t) => t());
		};

		socket.addEventListener('close', finalize);
		teardowns.push(() => socket.removeEventListener('close', finalize));
		socket.addEventListener('error', finalize);
		teardowns.push(() => socket.removeEventListener('error', finalize));

		return finalize;
	};

	return start;
}

function streamStock(ticker) {
	return multiplex({
		startMsg: { ticker, type: 'sub' },
		stopMsg: { ticker, type: 'unsub' },
		match: (data) => data.ticker === ticker,
	});
}

const googTrades = streamStock('GOOG');
const nflxTrades = streamStock('NFLX');

const unsubGoogTrades = googTrades(updateView);
const unsubNflxTrades = nflxTrades(updateView);

// And the stream can disconnect later, which
// automatically sends the unsubscription message
// to the server.
unsubGoogTrades();
```

</details>

#### Example 6

Here we're leveraging observables to match a secret code, which is a pattern of
keys the user might hit while using an app:

```js
const pattern = [
	'ArrowUp',
	'ArrowUp',
	'ArrowDown',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'ArrowLeft',
	'ArrowRight',
	'b',
	'a',
	'b',
	'a',
	'Enter',
];

const keys = document.on('keydown').map((e) => e.key);
keys
	.flatMap((firstKey) => {
		if (firstKey === pattern[0]) {
			return keys
				.take(pattern.length - 1)
				.every((k, i) => k === pattern[i + 1]);
		}
	})
	.filter((matched) => matched)
	.subscribe({
		next: (_) => {
			console.log('Secret code matched!');
		},
	});
```

<details>
<summary>Imperative version</summary>

```js
const pattern = [...];

// Imperative
document.addEventListener('keydown', e => {
  const key = e.key;
  if (key === pattern[0]) {
    let i = 1;
    const handler = (e) => {
      const nextKey = e.key;
      if (nextKey !== pattern[i++]) {
        document.removeEventListener('keydown', handler)
      } else if (pattern.length === i) {
        console.log('Secret code matched!');
        document.removeEventListener('keydown', handler)
      }
    }
    document.addEventListener('keydown', handler)
  }
})
```

</details>

### The `Observable` API

Observables are first-class objects representing composable, repeated events.
They're like Promises but for multiple events, and specifically with
[`EventTarget` integration](#eventtarget-integration), they are to events what
Promises are to callbacks. They can be:

- Created by script or by platform APIs, and passed to anyone interested in
  consuming events via `subscribe()`
- Fed to [operators](#operators) like `Observable.map()`, to be composed &
  transformed without a web of nested callbacks

Better yet, the transition from event handlers ➡️ Observables is simpler than
that of callbacks ➡️ Promises, since Observables integrate nicely on top of
`EventTarget`, the de facto way of subscribing to events from the platform [and
custom script](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/EventTarget#examples).
As a result, developers can use Observables without migrating tons of code on
the platform, since it's an easy drop-in wherever you're handling events today.

The proposed API shape is as follows:

```js
dictionary ObservableEventListenerOptions {
  boolean capture = false;
  boolean passive;
};

partial interface EventTarget {
  Observable on(DOMString type, optional ObservableEventListenerOptions options);
};

// `SubscribeCallback` is where the Observable "creator's" code lives. It's
// called when `subscribe()` is called, to set up a new subscription.
callback SubscribeCallback = undefined (Subscriber subscriber);
callback ObserverCallback = undefined (any value);

dictionary Observer {
  ObserverCallback next;
  VoidFunction complete;
  ObserverCallback error;
};

dictionary SubscribeOptions {
  AbortSignal signal;
};

dictionary PromiseOptions {
  AbortSignal signal;
};

[Exposed=*]
interface Subscriber {
  undefined next(any result);
  undefined complete();
  undefined error(any error);
  undefined addTeardown(VoidFunction teardown);

  // True after the Subscriber is created, up until either
  // `complete()`/`error()` are invoked, or the subscriber unsubscribes. Inside
  // `complete()`/`error()`, this attribute is true.
  readonly attribute boolean active;

  readonly attribute AbortSignal signal;
};

callback Predicate = boolean (any value);
callback Reducer = any (any accumulator, any currentValue)
callback Mapper = any (any element, unsigned long long index)
// Differs from `Mapper` only in return type, since this callback is exclusively
// used to visit each element in a sequence, not transform it.
callback Visitor = undefined (any element, unsigned long long index)

[Exposed=*]
interface Observable {
  constructor(SubscribeCallback callback);
  undefined subscribe(optional Observer observer = {}, optional SubscribeOptions = {});

  undefined finally(VoidFunction callback);

  // Constructs a native Observable from `value` if it's any of the following:
  //   - Observable
  //   - AsyncIterable
  //   - Iterable
  //   - Promise
  static Observable from(any value);

  // Observable-returning operators. See "Operators" section below.
  // `takeUntil()` can consume promises, iterables, async iterables, and other
  // observables.
  Observable takeUntil(any notifier);
  Observable map(Mapper mapper);
  Observable filter(Predicate predicate);
  Observable take(unsigned long long);
  Observable drop(unsigned long long);
  Observable flatMap(Mapper mapper);
  Promise<sequence<any>> toArray(optional PromiseOptions options);
  Promise<undefined> forEach(Visitor callback, optional PromiseOptions options);

  // Promise-returning. See "Concerns" section below.
  Promise<boolean> every(Predicate predicate, optional PromiseOptions options);
  // Maybe? Promise<any> first(optional PromiseOptions options);
  Promise<any> find(Predicate predicate, optional PromiseOptions options);
  Promise<boolean> some(Predicate predicate, optional PromiseOptions options);
  Promise<any> reduce(Reducer reducer, optional any initialValue, optional PromiseOptions options);
};
```

The creator of an Observable passes in a callback that gets invoked
synchronously whenever `subscribe()` is called. The `subscribe()` method can be
called _any number of times_, and the callback it invokes sets up a new
"subscription" by registering the caller of `subscribe()` as a Observer. With
this in place, the Observable can signal any number of events to the Observer
via the `next()` callback, optionally followed by a single call to either
`complete()` or `error()`, signaling that the stream of data is finished.

```js
const observable = new Observable((subscriber) => {
	let i = 0;
	setInterval(() => {
		if (i >= 10) subscriber.complete();
		else subscriber.next(i++);
	}, 2000);
});

observable.subscribe({
	// Print each value the Observable produces.
	next: console.log,
});
```

While custom Observables can be useful on their own, the primary use case they
unlock is with event handling. Observables returned by the new
`EventTarget#on()` method are created natively with an internal callback that
uses the same [underlying
mechanism](https://dom.spec.whatwg.org/#add-an-event-listener) as
`addEventListener()`. Therefore calling `subscribe()` essentially registers a
new event listener whose events are exposed through the Observer handler
functions and are composable with the various
[combinators](#operators) available to all Observables.

#### Constructing & converting objects to Observables

Observables can be created by their native constructor, as demonstrated above,
or by the `Observable.from()` static method. This method constructs a native
Observable from objects that are any of the following, _in this order_:

- `Observable` (in which case it just returns the given object)
- `AsyncIterable` (anything with `Symbol.asyncIterator`)
- `Iterable` (anything with `Symbol.iterator`)
- `Promise` (or any thenable)

Furthermore, any method on the platform that wishes to accept an Observable as a
Web IDL argument, or return one from a callback whose return type is
`Observable` can do so with any of the above objects as well, that get
automatically converted to an Observable. We can accomplish this in one of two
ways that we'll finalize in the Observable specification:

1.  By making the `Observable` type a special Web IDL type that performs this
    ECMAScript Object ➡️ Web IDL conversion automatically, like Web IDL does for
    other types.
2.  Require methods and callbacks that work with Observables to specify the type
    `any`, and have the corresponding spec prose immediately invoke a conversion
    algorithm that the Observable specification will supply. This is similar to
    what the Streams Standard [does with async iterables
    today](https://streams.spec.whatwg.org/#rs-from).

The conversation in https://github.com/domfarolino/observable/pull/60 leans
towards option (1).

#### Lazy, synchronous delivery

Crucially, Observables are "lazy" in that they do not start emitting data until
they are subscribed to, nor do they queue any data _before_ subscription. They
can also start emitting data synchronously during subscription, unlike Promises
which always queue microtasks when invoking `.then()` handlers. Consider this
[example](https://github.com/whatwg/dom/issues/544#issuecomment-351758385):

```js
el.on('click').subscribe({next: () => console.log('One')});
el.on('click').find(() => {…}).then(() => console.log('Three'));
el.click();
console.log('Two');
// Logs "One" "Two" "Three"
```

#### Firehose of synchronous data

By using `AbortController`, you can unsubscribe from an Observable even as it
synchronously emits data _during_ subscription:

```js
// An observable that synchronously emits unlimited data during subscription.
let observable = new Observable((subscriber) => {
	let i = 0;
	while (true) {
		subscriber.next(i++);
	}
});

let controller = new AbortController();
observable.subscribe({
	next: (data) => {
		if (data > 100) controller.abort();
	}}, {signal: controller.signal},
});
```

#### Teardown

It is critical for an Observable subscriber to be able to register an arbitrary
teardown callback to clean up any resources relevant to the subscription. The
teardown can be registered from within the subscription callback passed into the
`Observable` constructor. When run (upon subscribing), the subscription callback
can register a teardown function via `subscriber.addTeardown()`.

If the subscriber has already been aborted (i.e., `subscriber.signal.aborted` is
`true`), then the given teardown callback is invoked immediately from within
`addTeardown()`. Otherwise, it is invoked synchronously:

- From `complete()`, after the subscriber's complete handler (if any) is
  invoked
- From `error()`, after the subscriber's error handler (if any) is invoked
- The signal passed to the subscription is aborted by the user.

### Operators

We propose the following operators in addition to the `Observable` interface:

- `takeUntil(Observable)`
  - Returns an observable that mirrors the one that this method is called on,
    until the input observable emits its first value
- `finally()`
  - Like `Promise.finally()`, it takes a callback which gets fired after the
    observable completes in any way (`complete()`/`error()`)

Versions of the above are often present in userland implementations of
observables as they are useful for observable-specific reasons, but in addition
to these we offer a set of common operators that follow existing platform
precedent and can greatly increase utility and adoption. These exist on other
iterables, and are derived from TC39's [iterator helpers
proposal](https://github.com/tc39/proposal-iterator-helpers) which adds the
[following
methods](https://tc39.es/proposal-iterator-helpers/#sec-iteratorprototype) to
`Iterator.prototype`:

- `map()`
- `filter()`
- `take()`
- `drop()`
- `flatMap()` (Because the types are different, there are [some semantics to note](#flatmap-semantics).)
- `reduce()`
- `toArray()`
- `forEach()`
- `some()`
- `every()`
- `find()`

And the following method statically on the `Iterator` constructor:

- `from()`

We expect userland libraries to provide more niche operators that integrate with
the `Observable` API central to this proposal, potentially shipping natively if
they get enough momentum to graduate to the platform. But for this initial
proposal, we'd like to restrict the set of operators to those that follow the
precedent stated above, similar to how web platform APIs that are declared
[Setlike](https://webidl.spec.whatwg.org/#es-setlike) and
[Maplike](https://webidl.spec.whatwg.org/#es-maplike) have native properties
inspired by TC39's
[Map](https://tc39.es/ecma262/#sec-properties-of-the-map-prototype-object) and
[Set](https://tc39.es/ecma262/#sec-properties-of-the-set-prototype-object)
objects. Therefore we'd consider most discussion of expanding this set as
out-of-scope for the _initial_ proposal, suitable for discussion in an appendix.
Any long tail of operators could _conceivably_ follow along if there is support
for the native Observable API presented in this explainer.

Note that the operators `every()`, `find()`, `some()`, and `reduce()` return
Promises whose scheduling differs from that of Observables, which sometimes
means event handlers that call `e.preventDefault()` will run too late. See the
[Concerns](#concerns) section which goes into more detail.

### flatMap semantics

`flatMap` generally behaves like `Iterator.prototype.flatMap`, however, since it's push-based,
there can be a temporal element. Given that, it behaves much like RxJS's `concatMap`, which is
one of the most useful operators from the library.

At a high-level, it subscribes to the source, and then maps to, and emits values from "inner
observables", one at a time, ensuring they're subscribed to in sequence.

Given the following example:

```ts
const result = source.flatMap((value, index) =>
	getNextInnerObservable(value, index),
);
```

- `flatMap` is a method on `Observable` that is called with a `mapping function`, which takes a
  value from the source observable, and a zero-based counter (or "index") of that value, and
  returns a value that can be converted to an observable with `Observable.from`. `flatMap` returns
  an obeservable we'll call `result`.
- When you subscribe to `result`, it subscribes to `source` immediately.
- Let there be a `queue` of values that is empty.
- Let there be an integer `current index` that is `0`.
- Let there be an `innerSignal` that is either `undefined` or an `AbortSignal`.
- Let there be an `isSourceComplete` that is `false`.
- When the `source` emits a `value`:
  - If `innerSignal` is `undefined`
    - Begin **"mapping step"**:
      - Copy the `current index` into an `index` variable.
      - Increment the `current index`.
      - Call the `mapping function` with the the `value` and the `index`.
      - Then pass the return value of the mapping function to `Observable.from()` to convert it to
        "inner observable" if it's not already.
      - Then create an `AbortSignal` that is dependent on the subscriber's and set `innerSignal`.
      - Pass the `innerSignal` to the subscribe for the inner observable.
      - Forward all values emitted by the inner observable to the `result` observer.
      - If the inner observable completes
      - If there are values in the `queue`
        - Take the first one from the `queue` and return to the **"mapping step"**.
      - If the `queue` is empty
        - If `isSourceComplete` is `true`
        - Complete `result`.
        - If `isSourceComplete` is `false`
        - Wait
      - If the inner observable errors
        - Forward the error to `result`.
  - Otherwise, if `innerSignal` is an `AbortSignal`
    - Add the value to the `queue` and wait.
- If the `source` completes:
  - If `innerSignal` is `undefined`
    - Complete `result`.
  - If `innerSignal` is `AbortSignal`
    - Set `isSourceComplete` to `true`.
- If the `source` errors:
  - Forward the error to `result`.
- If the user aborts the signal passed to the subscription of `result`
  - Abort any `innerSignal` that exists, and terminate subscription.

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

## Concerns

One of the main [concerns](https://github.com/whatwg/dom/issues/544#issuecomment-351443624)
expressed in the original WHATWG DOM thread has to do with Promise-ifying APIs on Observable,
such as the proposed `first()`. The potential footgun here with microtask scheduling and event
integration. Specifically, the following innocent-looking code would not _always_ work:

```js
element
	.on('click')
	.first()
	.then((e) => {
		e.preventDefault();
		// Do something custom...
	});
```

If `Observable#first()` returns a Promise that resolves when the first event is fired on an
`EventTarget`, then the user-supplied Promise `.then()` handler will run:

- ✅ Synchronously after event firing, for events triggered by the user
- ❌ Asynchronously after event firing, for all events triggered by script (i.e., `element.click()`)
  - This means `e.preventDefault()` will have happened too late and effectively been ignored

<details>
To understand why this is the case, you must understand how and when the microtask queue is flushed
(and thus how microtasks, including Promise resolution handlers, are invoked).

In WebIDL after a callback is invoked, the HTML algorithm
_[clean up after running script](https://html.spec.whatwg.org/C#clean-up-after-running-script)_
[is called](https://webidl.spec.whatwg.org/#ref-for-clean-up-after-running-script%E2%91%A0), and
this algorithm calls _[perform a microtask checkpoint](https://html.spec.whatwg.org/C#perform-a-microtask-checkpoint)_
if and only if the JavaScript stack is empty.

Concretely, that means for `element.click()` in the above example, the following steps occur:

1. To run `element.click()`, a JavaScript execution context is first pushed onto the stack
1. To run the internal `click` event listener callback (the one created natively by the
   `Observable#from()` implementation), _another_ JavaScript execution context is pushed onto
   the stack, as WebIDL prepares to run the internal callback
1. The internal callback runs, which immediately resolves the Promise returned by `Observable#first()`;
   now the microtask queue contains the Promise's user-supplied `then()` handler which will cancel
   the event once it runs
1. The top-most execution context is removed from the stack, and the microtask queue **cannot be
   flushed**, because there is still JavaScript on the stack.
1. After the internal `click` event callback is executed, the rest of the event path continues since
   event was not canceled during or immediately after the callback. The event does whatever it would
   normally do (submit the form, `alert()` the user, etc.)
1. Finally, the JavaScript containing `element.click()` is finished, and the final execution context
is popped from the stack and the microtask queue is flushed. The user-supplied `.then()` handler
is run, which attempts to cancel the event too late
</details>

Two things mitigate this concern. First, there is a very simple workaround to _always_ avoid the
case where your `e.preventDefault()` might run too late:

```js
element
	.on('click')
	.map((e) => (e.preventDefault(), e))
	.first();
```

...or if Observable had a `.do()` method (see https://github.com/whatwg/dom/issues/544#issuecomment-351457179):

```js
element
	.on('click')
	.do((e) => e.preventDefault())
	.first();
```

...or by [modifying](https://github.com/whatwg/dom/issues/544#issuecomment-351779661) the semantics of
`first()` to take a callback that produces a value that the returned Promise resolves to:

```js
el.on('submit')
	.first((e) => e.preventDefault())
	.then(doMoreStuff);
```

Second, this "quirk" already exists in today's thriving Observable ecosystem, and there are no serious
concerns or reports from that community that developers are consistently running into this. This gives
some confidence that baking this behavior into the web platform will not be dangerous.

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
