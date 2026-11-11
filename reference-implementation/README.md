# Reference implementation

This dependency-free JavaScript module models the
[Observable and SharedObservable draft](../spec.bs) based on
[issue #221](https://github.com/WICG/observable/issues/221). It includes all core
operators, `Observable.from`, explicit sharing and replay, introspection, and an
opt-in `EventTarget.when` installation. It does not implement the deferred
`scan` or `takeLast` options, or the removed Promise consumers.

## Run it

Node.js 20 or later:

```sh
npm test
npm run demo
```

No dependency installation is needed. Import constructors directly:

```js
import { Observable, SharedObservable } from './reference-implementation/observable.js';

const values = Observable.from([1, 2, 3]).map(value => value * 2);
values.subscribe(console.log); // 2, 4, 6

const cached = values.share({ maxReplayValues: 1, closeOnComplete: true });
cached.subscribe(console.log); // 2, 4, 6
cached.subscribe(console.log); // 6, then completion
```

The module exports `Subscriber` for interface inspection; attempting to construct
it throws. TypeScript declarations are alongside the module.

## Try it in a browser

From the repository root, serve the files with a static server, for example:

```sh
python3 -m http.server 8000
```

Open [the interactive example](http://localhost:8000/reference-implementation/).
Attach A, emit a value, then attach B to inspect replay. Cancel each observer to
see cleanup after the last cancellation; attach again to see a new execution.
Complete with permanent closure to see retained replay without another execution.

Importing the module does not change globals. For testing applications against
this draft, installation is explicit:

```js
import { install } from './reference-implementation/observable.js';
install();

document.when('click').take(1).subscribe(console.log);
```

`install()` replaces `Observable`, `SharedObservable`, `Subscriber`, and
`EventTarget.prototype.when` in the chosen target. Use this deliberately when a
browser already has a different version of the proposal. The exported `when`
function can also be called directly with an EventTarget receiver without global
installation.

## Scope and native-host limitations

The implementation models the proposal's execution, sharing, cancellation, and
notification ordering. It is not a complete browser Web IDL binding or a claim of
passing the existing WPT suite, which targets a different API. In particular:

- Native interface brands and the platform's `IsPromise` operation work across
  realms. This module uses private WeakMap brands for its own instances and
  `instanceof` for Promises, AbortSignals, and EventTargets. Foreign-realm objects
  and instances from separately loaded copies need native support or adaptation.
- Web IDL property descriptors, callback realms, all conversion-order details,
  document liveness checks, and browser garbage-collection integration are not
  reproduced by JavaScript classes. The spec's fully-active-Document guards are
  normative for a browser implementation.
- Native AbortSignal abort algorithms cannot be intercepted by ordinary event
  listeners. This module uses public abort listeners, so hostile interference
  with those listeners or patched platform methods can affect it.
- Browser `reportError` is used when available. Otherwise unhandled observer,
  producer, iterator-cleanup, or teardown errors are thrown in a later task.
- Event listener passive defaults are delegated to `addEventListener`. The module
  cannot recreate native microtask checkpoints around browser callback invocations.

Replay capacity limits the number of retained values, not object sizes or
recursion depth. Snapshots preserve object identity and are shallow. Keep-alive
can intentionally retain resources with no observers. These are the proposal's
behaviors, rather than extra policies added by the implementation.

## Files and verification

- `observable.js`: constructors, subscriber lifecycle, operators, conversion, and events.
- `sharing.test.js`: the first executable sharing slice.
- `lifecycle.test.js`: lifetime policies, snapshots, identity, replay, and reentrancy.
- `operators.test.js`: conversion, composition, cancellation, and event integration.
- `demo.js` and `index.html`: command-line and browser examples.

The tests exercise public methods and observable outcomes. The implementation
retains the existing sequential `flatMap` and notifier-error completion behavior
of `takeUntil`. Producer terminal configuration is never forwarded to downstream
owners. Every composition result is ordinary, and only `share()` establishes a
shared boundary.
