import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Observable, SharedObservable, when, install } from './observable.js';

function collect(source) {
	return new Promise((resolve, reject) => {
		const values = [];
		source.subscribe({
			next: (value) => values.push(value),
			error: reject,
			complete: () => resolve(values),
		});
	});
}

test('from preserves native identity and adapts iterable, async iterable, and Promise inputs', async () => {
	const source = new Observable(() => {}),
		shared = source.share();
	assert.equal(Observable.from(source), source);
	assert.equal(Observable.from(shared), shared);
	assert.deepEqual(await collect(Observable.from([1, 2, 3])), [1, 2, 3]);
	assert.deepEqual(await collect(Observable.from(Promise.resolve(4))), [4]);
	assert.deepEqual(
		await collect(
			Observable.from(
				(async function* () {
					yield 5;
					yield 6;
				})(),
			),
		),
		[5, 6],
	);
	for (const invalid of [
		'abc',
		1,
		null,
		{ then() {} },
		{ subscribe() {} },
		{ [Symbol.iterator]: 1 },
	]) {
		assert.throws(() => Observable.from(invalid), TypeError);
	}
});

test('conversion selects async iteration first, reacquires iterators, and does not start a source', async () => {
	let gets = 0,
		starts = 0;
	const source = Observable.from({
		get [Symbol.asyncIterator]() {
			gets++;
			return async function* () {
				starts++;
				yield 1;
			};
		},
		get [Symbol.iterator]() {
			throw new Error('wrong protocol');
		},
	});
	assert.equal(gets, 1);
	assert.equal(starts, 0);
	await collect(source);
	await collect(source);
	assert.equal(gets, 3);
	assert.equal(starts, 2);
});

test('conversion of an existing Promise does not restart its operation', async () => {
	let starts = 0;
	const source = Observable.from(
		new Promise((resolve) => {
			starts++;
			resolve(1);
		}),
	);
	await collect(source);
	await collect(source);
	assert.equal(starts, 1);
});

test('iterator cleanup precedes take final delivery and does not run on natural completion', async () => {
	const log = [];
	const source = Observable.from({
		[Symbol.iterator]() {
			let value = 0;
			return {
				next: () => ({ value: ++value, done: value > 2 }),
				return() {
					log.push('return');
					return {};
				},
			};
		},
	});
	source.take(1).subscribe((value) => log.push(value));
	assert.deepEqual(log, ['return', 1]);
	assert.deepEqual(await collect(source), [1, 2]);
	assert.deepEqual(log, ['return', 1]);
});

test('async iteration stops requesting values on cancellation and closes the iterator', async () => {
	let nexts = 0,
		returns = 0;
	const source = Observable.from({
		[Symbol.asyncIterator]() {
			return {
				next() {
					nexts++;
					return Promise.resolve({ value: nexts, done: false });
				},
				return() {
					returns++;
					return Promise.resolve({ done: true });
				},
			};
		},
	});
	assert.deepEqual(await collect(source.take(1)), [1]);
	assert.equal(nexts, 1);
	assert.equal(returns, 1);
});

test('iteration and conversion failures reach the observer', async () => {
	await assert.rejects(
		collect(
			Observable.from({
				[Symbol.iterator]() {
					throw new Error('iterator');
				},
			}),
		),
		/iterator/,
	);
	await assert.rejects(
		collect(
			Observable.from({
				[Symbol.iterator]() {
					return { next: () => 1 };
				},
			}),
		),
		TypeError,
	);
	await assert.rejects(
		collect(
			Observable.from({
				[Symbol.asyncIterator]() {
					return { next: () => Promise.reject(new Error('async')) };
				},
			}),
		),
		/async/,
	);
});

test('all composition stays lazy, ordinary, and propagates nearest shared boundaries', () => {
	let starts = 0;
	const source = new SharedObservable(() => {
		starts++;
	});
	const other = new SharedObservable(() => {
		starts++;
	});
	const operators = [
		(s) => s.map((x) => x),
		(s) => s.filter(() => true),
		(s) => s.take(1),
		(s) => s.drop(1),
		(s) => s.flatMap((x) => [x]),
		(s) => s.switchMap((x) => [x]),
		(s) => s.inspect(),
		(s) => s.catch(() => []),
		(s) => s.finally(() => {}),
	];
	for (const operator of operators) {
		const result = operator(source);
		assert.ok(result instanceof Observable);
		assert.equal(result instanceof SharedObservable, false);
		assert.deepEqual(result.sharedSources, [source]);
	}
	assert.deepEqual(source.map((x) => x).takeUntil(other).sharedSources, [
		source,
		other,
	]);
	assert.deepEqual(source.takeUntil(source).sharedSources, [source]);
	assert.equal(starts, 0);
});

test('map, filter, and drop use per-observation state', async () => {
	const source = Observable.from([1, 2, 3, 4])
		.drop(1)
		.filter((_, index) => index !== 1)
		.map((value, index) => [value * 2, index]);
	assert.deepEqual(await collect(source), [
		[4, 0],
		[8, 1],
	]);
	assert.deepEqual(await collect(source), [
		[4, 0],
		[8, 1],
	]);
});

test('map reserves callback indices before reentrant values', () => {
	let sink;
	const indices = [];
	const source = new SharedObservable((s) => {
		sink = s;
	});
	source
		.map((value, index) => {
			indices.push(index);
			if (value === 1) sink.next(2);
			return value;
		})
		.subscribe();
	sink.next(1);
	assert.deepEqual(indices, [0, 1]);
});

test('take zero skips upstream and final teardown can cancel downstream delivery', () => {
	let starts = 0;
	new Observable(() => starts++).take(0).subscribe();
	assert.equal(starts, 0);
	const stop = new AbortController(),
		log = [];
	new Observable((s) => {
		s.addTeardown(() => stop.abort());
		s.next(1);
	})
		.take(1)
		.subscribe(
			{
				next: (value) => log.push(value),
				complete: () => log.push('complete'),
			},
			{ signal: stop.signal },
		);
	assert.deepEqual(log, []);
});

test('take prevents reentrant extra values without stopping shared siblings', () => {
	let sink;
	const source = new SharedObservable((s) => {
		sink = s;
	});
	const sibling = [],
		values = [];
	source.subscribe((value) => sibling.push(value));
	source.take(1).subscribe((value) => {
		values.push(value);
		sink.next(2);
	});
	sink.next(1);
	assert.deepEqual(values, [1]);
	assert.deepEqual(sibling, [1, 2]);
	assert.equal(source.activeSubscribers, 1);
});

test('takeUntil observes notifier first and notifier error completes the result', async () => {
	let starts = 0;
	const source = new Observable((s) => {
		starts++;
		s.next(1);
		s.complete();
	});
	assert.deepEqual(await collect(source.takeUntil([0])), []);
	assert.equal(starts, 0);
	assert.deepEqual(
		await collect(source.takeUntil(new Observable((s) => s.error('stop')))),
		[],
	);
	assert.equal(starts, 0);
	assert.deepEqual(await collect(source.takeUntil([])), [1]);
});

test('flatMap queues outer values and maps them sequentially after inner cleanup', () => {
	let outer, first;
	const log = [];
	const source = new Observable((s) => {
		outer = s;
	});
	source
		.flatMap((value, index) => {
			log.push(['map', value, index]);
			return new Observable((s) => {
				if (value === 1) {
					first = s;
					s.addTeardown(() => log.push('cleanup'));
				} else {
					s.next(value);
					s.complete();
				}
			});
		})
		.subscribe({
			next: (value) => log.push(value),
			complete: () => log.push('complete'),
		});
	outer.next(1);
	outer.next(2);
	outer.complete();
	assert.deepEqual(log, [['map', 1, 0]]);
	first.next(1);
	first.complete();
	assert.deepEqual(log, [
		['map', 1, 0],
		1,
		'cleanup',
		['map', 2, 1],
		2,
		'complete',
	]);
});

test('flatMap discards pending work on cancellation', () => {
	let outer, inner;
	const calls = [],
		stop = new AbortController();
	new Observable((s) => {
		outer = s;
	})
		.flatMap((value) => {
			calls.push(value);
			return new Observable((s) => {
				inner = s;
			});
		})
		.subscribe({}, { signal: stop.signal });
	outer.next(1);
	outer.next(2);
	stop.abort();
	inner.complete();
	assert.deepEqual(calls, [1]);
	assert.equal(outer.active, false);
	assert.equal(inner.active, false);
});

test('switchMap cancels old work before mapping a replacement and awaits the final inner', () => {
	let outer;
	const inners = [],
		log = [];
	new Observable((s) => {
		outer = s;
	})
		.switchMap((value) => {
			log.push(['map', value]);
			return new Observable((s) => {
				inners.push(s);
				s.addTeardown(() => log.push(['cleanup', value]));
			});
		})
		.subscribe({
			next: (value) => log.push(value),
			complete: () => log.push('complete'),
		});
	outer.next(1);
	outer.next(2);
	outer.complete();
	inners[0].next('stale');
	inners[1].next(2);
	inners[1].complete();
	assert.deepEqual(log, [
		['map', 1],
		['cleanup', 1],
		['map', 2],
		2,
		['cleanup', 2],
		'complete',
	]);
});

test('reentrant switchMap teardown cannot overwrite a newer inner', () => {
	let outer, latest;
	const mapped = [],
		log = [];
	new Observable((s) => {
		outer = s;
	})
		.switchMap((value) => {
			mapped.push(value);
			return new Observable((s) => {
				latest = s;
				if (value === 1) s.addTeardown(() => outer.next(3));
			});
		})
		.subscribe((value) => log.push(value));
	outer.next(1);
	outer.next(2);
	latest.next('newest');
	assert.deepEqual(mapped, [1, 3]);
	assert.deepEqual(log, ['newest']);
});

test('catch replaces after cleanup and does not retry its own replacement', async () => {
	const log = [];
	const source = new Observable((s) => {
		s.addTeardown(() => log.push('cleanup'));
		s.error('reason');
	});
	assert.deepEqual(
		await collect(
			source.catch((reason) => {
				log.push(reason);
				return [1, 2];
			}),
		),
		[1, 2],
	);
	assert.deepEqual(log, ['cleanup', 'reason']);
	await assert.rejects(
		collect(
			source.catch(
				() => new Observable((s) => s.error(new Error('replacement'))),
			),
		),
		/replacement/,
	);
});

test('inspect hooks and finally distinguish terminal outcomes from consumer abort', async () => {
	const log = [];
	assert.deepEqual(
		await collect(
			Observable.from([1])
				.inspect({
					subscribe() {
						assert.equal(this, undefined);
						log.push('subscribe');
					},
					next: (value) => log.push(value),
					complete: () => log.push('complete'),
					abort: () => log.push('abort'),
				})
				.finally(() => log.push('finally')),
		),
		[1],
	);
	assert.deepEqual(log, ['subscribe', 1, 'complete', 'finally']);
	const stop = new AbortController();
	new Observable(() => {})
		.inspect({ abort: (reason) => log.push(reason) })
		.finally(() => log.push('canceled'))
		.subscribe({}, { signal: stop.signal });
	stop.abort('stop');
	assert.deepEqual(log.slice(-2), ['stop', 'canceled']);
});

test('operator callback failures error downstream and release upstream before notification', () => {
	for (const operator of [
		(s) =>
			s.map(() => {
				throw 'failure';
			}),
		(s) =>
			s.filter(() => {
				throw 'failure';
			}),
		(s) =>
			s.inspect(() => {
				throw 'failure';
			}),
		(s) => s.flatMap(() => 1),
		(s) => s.switchMap(() => 1),
	]) {
		const log = [];
		operator(
			new Observable((s) => {
				s.addTeardown(() => log.push('cleanup'));
				s.next(1);
			}),
		).subscribe({
			error() {
				log.push('error');
			},
		});
		assert.deepEqual(log, ['cleanup', 'error']);
	}
});

test('inspect reads each callback once in the existing conversion order', () => {
	const reads = [];
	const inspector = new Proxy(
		{},
		{
			get(_target, key) {
				reads.push(key);
				return undefined;
			},
		},
	);
	new Observable(() => {}).inspect(inspector).subscribe();
	assert.deepEqual(reads, ['complete', 'error', 'next', 'abort', 'subscribe']);
});

test('inspect hook failures preserve arguments and cleanup order without calling the abort hook', () => {
	for (const kind of ['subscribe', 'next', 'error', 'complete']) {
		const log = [];
		const failure = new Error(kind);
		const args = kind === 'next' || kind === 'error' ? ['value'] : [];
		let sink;
		new Observable((s) => {
			sink = s;
			s.addTeardown(() => log.push('cleanup'));
		})
			.inspect({
				[kind](...received) {
					assert.equal(this, undefined);
					assert.deepEqual(received, args);
					log.push('hook');
					throw failure;
				},
				abort() {
					log.push('abort');
				},
			})
			.subscribe({
				error(reason) {
					log.push(reason);
				},
			});
		if (kind !== 'subscribe') sink[kind](...args);
		const expected =
			kind === 'subscribe'
				? ['hook', failure]
				: kind === 'next'
					? ['hook', 'cleanup', failure]
					: ['cleanup', 'hook', failure];
		assert.deepEqual(log, expected, kind);
	}
});

test('event observations are independent, cancel synchronously, and preserve preventDefault', () => {
	const target = new EventTarget(),
		a = new AbortController(),
		b = new AbortController();
	const source = when.call(target, 'submit', { passive: false });
	const log = [];
	source.subscribe(
		(event) => {
			log.push('a');
			event.preventDefault();
		},
		{ signal: a.signal },
	);
	source.subscribe(() => log.push('b'), { signal: b.signal });
	assert.equal(
		target.dispatchEvent(new Event('submit', { cancelable: true })),
		false,
	);
	a.abort();
	assert.equal(
		target.dispatchEvent(new Event('submit', { cancelable: true })),
		true,
	);
	b.abort();
	target.dispatchEvent(new Event('submit'));
	assert.deepEqual(log, ['a', 'b', 'b']);
});

test('installation is explicit and omitted methods stay absent', () => {
	const target = {};
	install(target);
	assert.equal(target.Observable, Observable);
	assert.equal(target.SharedObservable, SharedObservable);
	for (const name of [
		'toArray',
		'forEach',
		'every',
		'some',
		'first',
		'last',
		'find',
		'reduce',
		'scan',
		'takeLast',
		'retry',
		'repeat',
		'restart',
	]) {
		assert.equal(Observable.prototype[name], undefined);
	}
});

test('flatMap starts queued work inside synchronous inner completion', () => {
	let outer;
	const log = [];
	new Observable((s) => {
		outer = s;
	})
		.flatMap(
			(value) =>
				new Observable((s) => {
					log.push(['start', value]);
					s.addTeardown(() => log.push(['cleanup', value]));
					if (value === 1) outer.next(2);
					s.complete();
					log.push(['after', value]);
				}),
		)
		.subscribe();
	outer.next(1);
	assert.deepEqual(log, [
		['start', 1],
		['cleanup', 1],
		['start', 2],
		['cleanup', 2],
		['after', 2],
		['after', 1],
	]);
});

test('cancellation in a mapping or recovery callback prevents conversion of its result', () => {
	for (const name of ['flatMap', 'switchMap', 'catch']) {
		const stop = new AbortController();
		let reads = 0;
		const input = {
			get [Symbol.iterator]() {
				reads++;
				return function* () {};
			},
		};
		const source = new Observable((s) => {
			if (name === 'catch') s.error('reason');
			else s.next(1);
		});
		source[name](() => {
			stop.abort();
			return input;
		}).subscribe({}, { signal: stop.signal });
		assert.equal(reads, 0);
	}
});

test('a reentrant switch makes the older mapper result ineligible for conversion', () => {
	let outer;
	const values = [];
	new Observable((s) => {
		outer = s;
	})
		.switchMap((value) => {
			if (value === 1) {
				outer.next(2);
				return {
					get [Symbol.iterator]() {
						throw new Error('stale');
					},
				};
			}
			return [value];
		})
		.subscribe((value) => values.push(value));
	outer.next(1);
	assert.deepEqual(values, [2]);
});

test('the submission example shares overlap, retries failure, and caches success', () => {
	let click, attempt;
	let starts = 0;
	const errors = [],
		receipts = [];
	const submission = new SharedObservable({
		maxReplayValues: 1,
		closeOnComplete: true,
		keepAliveOnLastUnsubscribe: true,
		producer(s) {
			starts++;
			attempt = s;
		},
	});
	new Observable((s) => {
		click = s;
	})
		.switchMap(() =>
			submission.catch((error) => {
				errors.push(error);
				return [];
			}),
		)
		.subscribe((receipt) => receipts.push(receipt));
	click.next(undefined);
	click.next(undefined);
	assert.equal(starts, 1);
	attempt.error('retry');
	click.next(undefined);
	assert.equal(starts, 2);
	attempt.next('receipt');
	attempt.complete();
	click.next(undefined);
	assert.equal(starts, 2);
	assert.deepEqual(errors, ['retry']);
	assert.deepEqual(receipts, ['receipt', 'receipt']);
});
