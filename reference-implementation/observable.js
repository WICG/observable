// Executable model of spec.bs. No globals are installed by importing this module.
const observables = new WeakMap();
const subscribers = new WeakMap();
const token = {};
const defaults = Object.freeze({
	maxReplayValues: 0,
	closeOnComplete: false,
	closeOnError: false,
	closeOnLastUnsubscribe: false,
	keepAliveOnLastUnsubscribe: false,
});

function state(value) {
	const result = observables.get(value);
	if (!result) throw new TypeError('Expected an Observable');
	return result;
}

function execution(value) {
	const result = subscribers.get(value);
	if (!result) throw new TypeError('Expected a Subscriber');
	return result;
}

function callable(value) {
	if (typeof value !== 'function') throw new TypeError('Expected a callback');
	return value;
}

function dictionary(value) {
	if (value == null) return {};
	if (typeof value !== 'object' && typeof value !== 'function') {
		throw new TypeError('Expected a configuration object');
	}
	return value;
}

function capacity(value) {
	const number = +value;
	if (!Number.isSafeInteger(number) || number < 0) {
		throw new RangeError('maxReplayValues must be a nonnegative safe integer');
	}
	return number === 0 ? 0 : number;
}

function configuration(input, inherited = defaults) {
	const config = dictionary(input);
	const result = {};
	// Read each member once, including when share() returns its receiver.
	for (const key of Object.keys(defaults).sort()) {
		const value = config[key];
		if (value === undefined) result[key] = inherited[key];
		else if (key === 'maxReplayValues') result[key] = capacity(value);
		else result[key] = Boolean(value);
	}
	if (result.closeOnLastUnsubscribe && result.keepAliveOnLastUnsubscribe) {
		throw new TypeError(
			'Last-unsubscribe closure and keep-alive are mutually exclusive',
		);
	}
	return result;
}

function declarations(input) {
	if (input == null) return null;
	const result = [];
	for (const source of input) {
		if (!observables.get(source)?.shared)
			throw new TypeError('Expected a SharedObservable');
		if (!result.includes(source)) result.push(source);
	}
	return result.length ? Object.freeze(result) : null;
}

function initialize(object, input, shared) {
	const config =
		typeof input === 'function' ? { producer: input } : dictionary(input);
	const producer = callable(config.producer);
	const sources = declarations(config.sharedSources);
	observables.set(object, {
		producer,
		sources,
		shared,
		config: shared ? configuration(config) : null,
		current: null,
		replay: [],
		terminal: null,
		subscriptions: new Set(),
	});
}

function report(error) {
	if (typeof globalThis.reportError === 'function')
		globalThis.reportError(error);
	else
		setTimeout(() => {
			throw error;
		}, 0);
}

function invoke(callback, args) {
	try {
		Reflect.apply(callback, undefined, args);
	} catch (error) {
		report(error);
	}
}

function observerRecord(input = {}, keys = ['complete', 'error', 'next']) {
	if (typeof input === 'function') return { next: input };
	const object = dictionary(input);
	const result = {};
	for (const key of keys) {
		const callback = object[key];
		if (callback !== undefined) result[key] = callable(callback);
	}
	return result;
}

function removeAbort(subscription) {
	subscription.signal?.removeEventListener('abort', subscription.abort);
}

function cleanup(exec, reason) {
	// The owner transition and notification guards are committed before script runs.
	exec.active = false;
	exec.controller.abort(reason);
	const callbacks = exec.teardowns;
	exec.teardowns = [];
	for (let index = callbacks.length - 1; index >= 0; index--)
		invoke(callbacks[index], []);
}

function notifyTerminal(subscription, kind, reason) {
	// Keep cancellation wired through teardown and earlier terminal callbacks.
	if (!subscription.canceled) {
		const callback = subscription.callbacks[kind];
		if (callback) invoke(callback, kind === 'error' ? [reason] : []);
		else if (kind === 'error') report(reason);
	}
	removeAbort(subscription);
}

function terminate(exec, kind, reason, close) {
	const owner = exec.owner;
	if (!exec.active || (owner.shared && owner.current !== exec)) {
		if (kind === 'error') report(reason);
		return;
	}
	const recipients = [...exec.subscriptions];
	if (owner.shared) {
		owner.current = null;
		if (
			close ||
			owner.config[kind === 'error' ? 'closeOnError' : 'closeOnComplete']
		) {
			owner.terminal = { kind, reason };
		} else owner.replay = [];
	}
	exec.subscriptions.clear();
	cleanup(exec);
	for (const subscription of recipients)
		notifyTerminal(subscription, kind, reason);
}

export class Subscriber {
	constructor(key, exec) {
		if (key !== token) throw new TypeError('Illegal constructor');
		subscribers.set(this, exec);
	}
	get active() {
		return execution(this).active;
	}
	get signal() {
		return execution(this).controller.signal;
	}
	next(value) {
		const exec = execution(this);
		if (!arguments.length) throw new TypeError('next requires a value');
		if (!exec.active) return;
		const owner = exec.owner;
		if (owner.shared && owner.config.maxReplayValues) {
			owner.replay.push(value);
			if (owner.replay.length > owner.config.maxReplayValues)
				owner.replay.shift();
		}
		for (const subscription of [...exec.subscriptions]) {
			if (!exec.active) break;
			if (exec.subscriptions.has(subscription) && subscription.callbacks.next)
				invoke(subscription.callbacks.next, [value]);
		}
	}
	error(reason, config) {
		const exec = execution(this);
		if (!arguments.length) throw new TypeError('error requires a reason');
		const close = Boolean(dictionary(config).close);
		terminate(exec, 'error', reason, close);
	}
	complete(config) {
		const exec = execution(this);
		const close = Boolean(dictionary(config).close);
		terminate(exec, 'complete', undefined, close);
	}
	addTeardown(callback) {
		const exec = execution(this);
		callable(callback);
		if (exec.active) exec.teardowns.push(callback);
		else invoke(callback, []);
	}
}

function subscribe(source, callbacks, options) {
	const owner = state(source);
	const signal = dictionary(options).signal;
	if (signal !== undefined && !(signal instanceof AbortSignal))
		throw new TypeError('Expected an AbortSignal');
	if (signal?.aborted) return;
	const terminal = owner.terminal;
	let exec = owner.shared ? owner.current : null;
	const start = !terminal && !exec;
	if (start) {
		exec = {
			owner,
			active: true,
			controller: new AbortController(),
			teardowns: [],
			subscriptions: new Set(),
		};
		if (owner.shared) {
			owner.current = exec;
			// One set serves delivery and activeSubscribers. A new execution gets
			// a fresh set so old cancellation callbacks cannot affect it.
			owner.subscriptions = exec.subscriptions;
		}
	}
	const subscriptions = terminal ? owner.subscriptions : exec.subscriptions;
	// Terminal callbacks run after detachment and must still honor cancellation.
	const subscription = { callbacks, signal, canceled: false };
	subscription.abort = () => {
		if (subscription.canceled) return;
		subscription.canceled = true;
		subscriptions.delete(subscription);
		removeAbort(subscription);
		if (!exec?.active || subscriptions.size) return;
		if (owner.shared) {
			if (owner.config.keepAliveOnLastUnsubscribe) return;
			owner.current = null;
			if (owner.config.closeOnLastUnsubscribe)
				owner.terminal = { kind: 'complete' };
			else owner.replay = [];
		}
		cleanup(exec, signal?.reason);
	};
	subscriptions.add(subscription);
	signal?.addEventListener('abort', subscription.abort, { once: true });
	if (owner.shared) {
		for (const value of [...owner.replay]) {
			if (!subscriptions.has(subscription)) break;
			if (callbacks.next) invoke(callbacks.next, [value]);
		}
	}
	if (terminal) {
		subscriptions.delete(subscription);
		notifyTerminal(subscription, terminal.kind, terminal.reason);
	} else if (start && exec.active) {
		const sink = new Subscriber(token, exec);
		try {
			Reflect.apply(owner.producer, undefined, [sink]);
		} catch (error) {
			sink.error(error);
		}
	}
}

function sourcesOf(...inputs) {
	return declarations(
		inputs.flatMap((input) => {
			const data = state(input);
			return data.shared ? [input] : (data.sources ?? []);
		}),
	);
}

function derived(source, producer, ...others) {
	return new Observable({
		producer,
		sharedSources: sourcesOf(source, ...others),
	});
}

function forward(sink) {
	return {
		next: (value) => sink.next(value),
		error: (error) => sink.error(error),
		complete: () => sink.complete(),
	};
}

function follow(source, sink, callbacks = forward(sink), signal = sink.signal) {
	subscribe(source, callbacks, { signal });
}

function controllerFor(sink) {
	const controller = new AbortController();
	const abort = () => controller.abort(sink.signal.reason);
	if (sink.signal.aborted) abort();
	else sink.signal.addEventListener('abort', abort, { once: true });
	controller.signal.addEventListener(
		'abort',
		() => sink.signal.removeEventListener('abort', abort),
		{ once: true },
	);
	return controller;
}

// Preserve the existing Web IDL unsigned long long conversion for take/drop.
function unsignedLongLong(value) {
	const number = +value;
	if (!Number.isFinite(number) || number === 0) return 0;
	return Number(BigInt.asUintN(64, BigInt(Math.trunc(number))));
}

export class Observable {
	constructor(input) {
		initialize(this, input, false);
	}
	static from(input) {
		return from(input);
	}
	get sharedSources() {
		return state(this).sources;
	}
	subscribe(observer = {}, options = {}) {
		state(this);
		subscribe(this, observerRecord(observer), options);
	}
	share(config) {
		const owner = state(this);
		const normalized = configuration(config, owner.config ?? defaults);
		if (
			owner.shared &&
			Object.keys(defaults).every(
				(key) => normalized[key] === owner.config[key],
			)
		)
			return this;
		const source = this;
		return new SharedObservable({
			...normalized,
			sharedSources: sourcesOf(source),
			producer: (sink) => follow(source, sink),
		});
	}
	map(mapper) {
		callable(mapper);
		const source = this;
		return derived(source, (sink) => {
			let index = 0;
			follow(source, sink, {
				...forward(sink),
				next(value) {
					let mapped;
					try {
						mapped = mapper(value, index++);
					} catch (error) {
						sink.error(error);
						return;
					}
					sink.next(mapped);
				},
			});
		});
	}
	filter(predicate) {
		callable(predicate);
		const source = this;
		return derived(source, (sink) => {
			let index = 0;
			follow(source, sink, {
				...forward(sink),
				next(value) {
					let matches;
					try {
						matches = predicate(value, index++);
					} catch (error) {
						sink.error(error);
						return;
					}
					if (matches) sink.next(value);
				},
			});
		});
	}
	take(amount) {
		if (!arguments.length) throw new TypeError('take requires an amount');
		amount = unsignedLongLong(amount);
		const source = this;
		return derived(source, (sink) => {
			let remaining = amount;
			if (!remaining) {
				sink.complete();
				return;
			}
			const upstream = controllerFor(sink);
			follow(
				source,
				sink,
				{
					...forward(sink),
					next(value) {
						if (!sink.active || !remaining) return;
						const last = --remaining === 0;
						if (last) upstream.abort();
						sink.next(value);
						if (last) sink.complete();
					},
				},
				upstream.signal,
			);
		});
	}
	drop(amount) {
		if (!arguments.length) throw new TypeError('drop requires an amount');
		amount = unsignedLongLong(amount);
		const source = this;
		return derived(source, (sink) => {
			let remaining = amount;
			follow(source, sink, {
				...forward(sink),
				next(value) {
					if (remaining) remaining--;
					else sink.next(value);
				},
			});
		});
	}
	takeUntil(input) {
		const source = this;
		const notifier = from(input);
		return derived(
			source,
			(sink) => {
				follow(notifier, sink, {
					next: () => sink.complete(),
					error: () => sink.complete(),
				});
				if (sink.active) follow(source, sink);
			},
			notifier,
		);
	}
	flatMap(mapper) {
		callable(mapper);
		const source = this;
		return derived(source, (sink) => {
			let index = 0,
				active = false,
				outerDone = false;
			const queue = [];
			sink.addTeardown(() => {
				queue.length = 0;
			});
			function drain() {
				if (!sink.active || active) return;
				if (!queue.length) {
					if (outerDone) sink.complete();
					return;
				}
				active = true;
				let inner;
				try {
					const input = mapper(queue.shift(), index++);
					if (!sink.active) return;
					inner = from(input);
				} catch (error) {
					sink.error(error);
					return;
				}
				if (!sink.active) return;
				follow(inner, sink, {
					...forward(sink),
					complete() {
						active = false;
						drain();
					},
				});
			}
			follow(source, sink, {
				...forward(sink),
				next(value) {
					queue.push(value);
					drain();
				},
				complete() {
					outerDone = true;
					drain();
				},
			});
		});
	}
	switchMap(mapper) {
		callable(mapper);
		const source = this;
		return derived(source, (sink) => {
			let index = 0,
				current = null,
				outerDone = false;
			follow(source, sink, {
				...forward(sink),
				next(value) {
					const previous = current;
					const next = controllerFor(sink);
					// Publish replacement identity before old cleanup can reenter.
					current = next;
					previous?.abort();
					if (!sink.active || current !== next) return;
					let inner;
					try {
						const input = mapper(value, index++);
						if (!sink.active || current !== next) return;
						inner = from(input);
					} catch (error) {
						sink.error(error);
						return;
					}
					if (!sink.active || current !== next) return;
					follow(
						inner,
						sink,
						{
							...forward(sink),
							complete() {
								if (current !== next) return;
								current = null;
								next.abort();
								if (outerDone) sink.complete();
							},
						},
						next.signal,
					);
				},
				complete() {
					outerDone = true;
					if (!current) sink.complete();
				},
			});
		});
	}
	inspect(input = {}) {
		const callbacks = observerRecord(input, [
			'complete',
			'error',
			'next',
			'abort',
			'subscribe',
		]);
		const source = this;
		return derived(source, (sink) => {
			let terminal = false;
			try {
				if (callbacks.subscribe)
					Reflect.apply(callbacks.subscribe, undefined, []);
			} catch (error) {
				sink.error(error);
				return;
			}
			if (!sink.active) return;
			sink.signal.addEventListener(
				'abort',
				() => {
					if (!terminal && callbacks.abort)
						invoke(callbacks.abort, [sink.signal.reason]);
				},
				{ once: true },
			);
			function notify(kind, args) {
				if (kind !== 'next') terminal = true;
				try {
					if (callbacks[kind]) Reflect.apply(callbacks[kind], undefined, args);
				} catch (error) {
					terminal = true;
					sink.error(error);
					return;
				}
				sink[kind](...args);
			}
			follow(source, sink, {
				next: (value) => notify('next', [value]),
				error: (reason) => notify('error', [reason]),
				complete: () => notify('complete', []),
			});
		});
	}
	catch(callback) {
		callable(callback);
		const source = this;
		return derived(source, (sink) => {
			follow(source, sink, {
				...forward(sink),
				error(reason) {
					let replacement;
					try {
						const input = callback(reason);
						if (!sink.active) return;
						replacement = from(input);
					} catch (error) {
						sink.error(error);
						return;
					}
					if (sink.active) follow(replacement, sink);
				},
			});
		});
	}
	finally(callback) {
		callable(callback);
		const source = this;
		return derived(source, (sink) => {
			sink.addTeardown(callback);
			follow(source, sink);
		});
	}
}

export class SharedObservable {
	constructor(input) {
		initialize(this, input, true);
	}
	get activeSubscribers() {
		return sharedState(this).subscriptions.size;
	}
	get replayValues() {
		return Object.freeze([...sharedState(this).replay]);
	}
	get maxReplayValues() {
		return sharedState(this).config.maxReplayValues;
	}
}

function sharedState(value) {
	const result = state(value);
	if (!result.shared) throw new TypeError('Expected a SharedObservable');
	return result;
}

// Instance inheritance only: SharedObservable has no static from() method.
Object.setPrototypeOf(SharedObservable.prototype, Observable.prototype);

function getMethod(input, key) {
	const method = input[key];
	return method == null ? undefined : callable(method);
}

function objectResult(value) {
	if (
		value === null ||
		(typeof value !== 'object' && typeof value !== 'function')
	) {
		throw new TypeError('Iterator result must be an object');
	}
	return value;
}

function from(input) {
	objectResult(input);
	if (observables.has(input)) return input;
	const asyncMethod = getMethod(input, Symbol.asyncIterator);
	const method = asyncMethod ?? getMethod(input, Symbol.iterator);
	if (method) {
		const async = asyncMethod !== undefined;
		return new Observable((sink) => {
			// Reacquire the iterator on every subscription, including its method getter.
			const iterator = objectResult(
				Reflect.apply(
					getMethod(input, async ? Symbol.asyncIterator : Symbol.iterator),
					input,
					[],
				),
			);
			const next = callable(iterator.next);
			let done = false;
			sink.addTeardown(() => {
				if (done) return;
				done = true;
				const close = getMethod(iterator, 'return');
				if (!close) return;
				const result = Reflect.apply(close, iterator, []);
				if (async) Promise.resolve(result).then(objectResult).catch(report);
				else objectResult(result);
			});
			function accept(result) {
				objectResult(result);
				if (result.done) {
					done = true;
					sink.complete();
					return;
				}
				sink.next(result.value);
			}
			if (async) {
				function advance() {
					if (!sink.active) return;
					let result;
					try {
						result = Reflect.apply(next, iterator, []);
					} catch (error) {
						result = Promise.reject(error);
					}
					Promise.resolve(result).then(
						(value) => {
							if (!sink.active) return;
							try {
								accept(value);
							} catch (error) {
								done = true;
								sink.error(error);
								return;
							}
							advance();
						},
						(error) => {
							done = true;
							sink.error(error);
						},
					);
				}
				advance();
			} else {
				while (sink.active) {
					try {
						accept(Reflect.apply(next, iterator, []));
					} catch (error) {
						done = true;
						sink.error(error);
					}
				}
			}
		});
	}
	// Native IsPromise is not exposed to JavaScript; see the implementation notes.
	if (input instanceof Promise) {
		return new Observable((sink) => {
			Promise.prototype.then.call(
				input,
				(value) => {
					sink.next(value);
					sink.complete();
				},
				(error) => sink.error(error),
			);
		});
	}
	throw new TypeError(
		'Expected an Observable, async iterable, iterable, or Promise',
	);
}

/** Explicit installation, useful in a browser testing this draft alongside native Observable. */
export function install(target = globalThis) {
	Object.defineProperties(target, {
		Observable: { value: Observable, writable: true, configurable: true },
		SharedObservable: {
			value: SharedObservable,
			writable: true,
			configurable: true,
		},
		Subscriber: { value: Subscriber, writable: true, configurable: true },
	});
	if (target.EventTarget) {
		Object.defineProperty(target.EventTarget.prototype, 'when', {
			value: when,
			writable: true,
			configurable: true,
			enumerable: true,
		});
	}
}

export function when(type, options = {}) {
	if (!arguments.length) throw new TypeError('when requires an event type');
	const target = this;
	if (!(target instanceof EventTarget))
		throw new TypeError('Expected an EventTarget');
	type = `${type}`;
	const input = dictionary(options);
	const config = { capture: Boolean(input.capture) };
	const passive = input.passive;
	if (passive !== undefined) config.passive = Boolean(passive);
	return new Observable((sink) => {
		const listener = (event) => sink.next(event);
		target.addEventListener(type, listener, config);
		sink.addTeardown(() =>
			target.removeEventListener(type, listener, config.capture),
		);
	});
}
