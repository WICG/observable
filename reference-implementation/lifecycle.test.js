import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Observable, SharedObservable, Subscriber } from './observable.js';

function record(source, signal) {
	const log = [];
	source.subscribe(
		{
			next: (value) => log.push(value),
			error: (reason) => log.push(['error', reason]),
			complete: () => log.push('complete'),
		},
		{ signal },
	);
	return log;
}

test('constructors and configuration validate eagerly without starting production', () => {
	for (const Type of [Observable, SharedObservable]) {
		for (const input of [undefined, null, {}, { producer: 1 }, 1])
			assert.throws(() => new Type(input), TypeError);
	}
	assert.throws(() => new Subscriber(), TypeError);
	for (const maxReplayValues of [-1, 0.5, Infinity, NaN, 2 ** 53]) {
		assert.throws(
			() => new SharedObservable({ producer() {}, maxReplayValues }),
			RangeError,
		);
	}
	assert.equal(
		new SharedObservable({ producer() {}, maxReplayValues: '2' })
			.maxReplayValues,
		2,
	);
	assert.throws(
		() =>
			new SharedObservable({
				producer() {},
				closeOnLastUnsubscribe: 1,
				keepAliveOnLastUnsubscribe: {},
			}),
		TypeError,
	);
});

test('share inherits settings, validates conflicts before identity return, and wraps different settings', () => {
	const source = new SharedObservable({
		producer() {},
		keepAliveOnLastUnsubscribe: true,
		maxReplayValues: 2,
	});
	assert.equal(source.share(), source);
	assert.equal(source.share({ maxReplayValues: undefined }), source);
	assert.equal(source.share({ maxReplayValues: '2' }), source);
	assert.throws(
		() => source.share({ closeOnLastUnsubscribe: true }),
		TypeError,
	);
	const wrapper = source.share({
		keepAliveOnLastUnsubscribe: false,
		closeOnLastUnsubscribe: true,
	});
	assert.notEqual(wrapper, source);
	assert.deepEqual(wrapper.sharedSources, [source]);
	assert.equal(wrapper.maxReplayValues, 2);
	const ordinary = new Observable(() => {});
	assert.notEqual(ordinary.share(), ordinary.share());
});

test('configuration getters are read once and matching settings preserve closed identity', () => {
	let reads = 0;
	const source = new SharedObservable({
		producer: (s) => s.complete({ close: true }),
	});
	source.subscribe();
	assert.equal(
		source.share({
			get closeOnComplete() {
				reads++;
				return false;
			},
		}),
		source,
	);
	assert.equal(reads, 1);
});

test('metadata is validated, copied, deduplicated, frozen, and shallow', () => {
	const a = new SharedObservable(() => {}),
		b = new SharedObservable(() => {});
	const inputs = [a, b, a];
	const source = new Observable({ producer() {}, sharedSources: inputs });
	inputs.length = 0;
	assert.deepEqual(source.sharedSources, [a, b]);
	assert.ok(Object.isFrozen(source.sharedSources));
	assert.equal(
		new Observable({ producer() {}, sharedSources: [] }).sharedSources,
		null,
	);
	assert.throws(
		() => new Observable({ producer() {}, sharedSources: [source] }),
		TypeError,
	);
	const object = {};
	const shared = new SharedObservable({
		producer: (s) => s.next(object),
		maxReplayValues: 1,
	});
	shared.subscribe();
	assert.ok(Object.isFrozen(shared.replayValues));
	assert.equal(shared.replayValues[0], object);
	assert.equal(Object.isFrozen(object), false);
});

for (const kind of ['complete', 'error']) {
	test(`${kind}: default reset permits a new execution and clears history`, () => {
		let count = 0;
		const source = new SharedObservable({
			maxReplayValues: 1,
			producer(s) {
				s.next(++count);
				if (kind === 'complete') s.complete();
				else s.error('reason');
			},
		});
		const terminal = kind === 'complete' ? 'complete' : ['error', 'reason'];
		assert.deepEqual(record(source), [1, terminal]);
		assert.deepEqual(record(source), [2, terminal]);
		assert.deepEqual(source.replayValues, []);
	});
	test(`${kind}: configured closure retains bounded replay and outcome`, () => {
		let starts = 0;
		const source = new SharedObservable({
			maxReplayValues: 2,
			[kind === 'error' ? 'closeOnError' : 'closeOnComplete']: true,
			producer(s) {
				starts++;
				s.next(1);
				s.next(2);
				s.next(3);
				if (kind === 'error') s.error('reason');
				else s.complete();
			},
		});
		record(source);
		assert.deepEqual(record(source), [
			2,
			3,
			kind === 'error' ? ['error', 'reason'] : 'complete',
		]);
		assert.equal(starts, 1);
	});
}

test('last unsubscribe resets before teardown can start a replacement', () => {
	const sinks = [],
		log = [];
	const stop = new AbortController();
	const source = new SharedObservable({
		maxReplayValues: 1,
		producer(s) {
			sinks.push(s);
			if (sinks.length === 1)
				s.addTeardown(() => source.subscribe((value) => log.push(value)));
		},
	});
	source.subscribe({}, { signal: stop.signal });
	sinks[0].next(1);
	stop.abort();
	assert.equal(sinks.length, 2);
	assert.deepEqual(source.replayValues, []);
	sinks[0].next('stale');
	sinks[0].complete({ close: true });
	sinks[1].next('new');
	assert.deepEqual(log, ['new']);
	assert.equal(source.activeSubscribers, 1);
});

test('last-unsubscribe closure retains completion; keep-alive continues with no observers', () => {
	for (const keepAlive of [false, true]) {
		let sink,
			cleanup = 0;
		const source = new SharedObservable({
			maxReplayValues: 1,
			closeOnLastUnsubscribe: !keepAlive,
			keepAliveOnLastUnsubscribe: keepAlive,
			producer(s) {
				sink = s;
				s.addTeardown(() => cleanup++);
			},
		});
		const stop = new AbortController();
		source.subscribe({}, { signal: stop.signal });
		sink.next(1);
		stop.abort();
		assert.equal(sink.active, keepAlive);
		if (keepAlive) {
			sink.next(2);
			sink.complete({ close: true });
		}
		assert.equal(cleanup, 1);
		assert.deepEqual(record(source), [keepAlive ? 2 : 1, 'complete']);
	}
});

test('keep-alive still resets on producer completion and error with no observers', () => {
	for (const kind of ['complete', 'error']) {
		let sink,
			starts = 0,
			cleanups = 0;
		const source = new SharedObservable({
			keepAliveOnLastUnsubscribe: true,
			maxReplayValues: 1,
			producer(s) {
				sink = s;
				starts++;
				s.addTeardown(() => cleanups++);
			},
		});
		const stop = new AbortController();
		source.subscribe({}, { signal: stop.signal });
		stop.abort();
		sink.next(1);
		if (kind === 'error') sink.error('failure');
		else sink.complete();
		assert.equal(cleanups, 1);
		assert.deepEqual(source.replayValues, []);
		source.subscribe();
		assert.equal(starts, 2);
	}
});

test('terminal policy wins over last-unsubscribe closure', () => {
	let starts = 0;
	const source = new SharedObservable({
		closeOnLastUnsubscribe: true,
		producer(s) {
			starts++;
			s.complete();
		},
	});
	source.subscribe();
	source.subscribe();
	assert.equal(starts, 2);
});

test('producer close is local: ordinary siblings survive and wrappers choose their own policy', () => {
	const sinks = [];
	const ordinary = new Observable((s) => sinks.push(s));
	ordinary.subscribe();
	ordinary.subscribe();
	sinks[0].complete({ close: true });
	assert.equal(sinks[1].active, true);
	ordinary.subscribe();
	assert.equal(sinks.length, 3);
	const closed = new SharedObservable({
		maxReplayValues: 1,
		producer(s) {
			s.next(42);
			s.complete({ close: true });
		},
	});
	const wrapper = closed.share({ maxReplayValues: 2 });
	assert.deepEqual(record(wrapper), [42, 'complete']);
	assert.deepEqual(wrapper.replayValues, []);
	assert.deepEqual(record(wrapper), [42, 'complete']);
});

test('already-aborted observations are inert, including closed replay', () => {
	let starts = 0;
	const stop = AbortSignal.abort();
	const shared = new SharedObservable({
		maxReplayValues: 1,
		producer(s) {
			starts++;
			s.next(1);
			s.complete({ close: true });
		},
	});
	assert.deepEqual(record(shared, stop), []);
	assert.equal(starts, 0);
	record(shared);
	assert.deepEqual(record(shared, stop), []);
	assert.equal(shared.activeSubscribers, 0);
});

test('cancellation interrupts closed and live replay', () => {
	for (const close of [false, true]) {
		const shared = new SharedObservable({
			maxReplayValues: 3,
			producer(s) {
				s.next(1);
				s.next(2);
				s.next(3);
				if (close) s.complete({ close });
			},
		});
		shared.subscribe();
		const stop = new AbortController(),
			log = [];
		shared.subscribe(
			{
				next(value) {
					log.push(value);
					stop.abort();
				},
				complete() {
					log.push('complete');
				},
			},
			{ signal: stop.signal },
		);
		assert.deepEqual(log, [1]);
	}
});

test('nested live notifications interleave with a fixed replay snapshot exactly as proposed', () => {
	for (const trigger of [1, 2]) {
		let sink;
		const shared = new SharedObservable({
			maxReplayValues: 2,
			producer(s) {
				sink = s;
			},
		});
		shared.subscribe((value) => {
			if (value === 3) sink.next(4);
		});
		sink.next(1);
		sink.next(2);
		const log = [];
		shared.subscribe((value) => {
			log.push(value);
			if (value === trigger) sink.next(3);
		});
		assert.deepEqual(log, trigger === 1 ? [1, 4, 3, 2] : [1, 2, 4, 3]);
	}
});

test('reentrant completion stops pending live values and replay', () => {
	let sink;
	const source = new SharedObservable({
		maxReplayValues: 2,
		producer(s) {
			sink = s;
		},
	});
	source.subscribe({
		next(value) {
			if (value === 3) sink.complete();
		},
	});
	const b = record(source);
	sink.next(1);
	sink.next(2);
	sink.next(3);
	assert.deepEqual(b, [1, 2, 'complete']);
	let replaySink;
	const replay = new SharedObservable({
		maxReplayValues: 2,
		producer(s) {
			replaySink = s;
			s.next(1);
			s.next(2);
		},
	});
	replay.subscribe();
	const log = [];
	replay.subscribe({
		next(value) {
			log.push(value);
			replaySink.complete();
		},
		complete() {
			log.push('complete');
		},
	});
	assert.deepEqual(log, [1, 'complete']);
});

test('terminal transition precedes cleanup and cancellation suppresses later terminal recipients', () => {
	let sink;
	const stop = new AbortController(),
		log = [];
	const source = new SharedObservable((s) => {
		sink = s;
		s.addTeardown(() =>
			log.push(['cleanup', source.activeSubscribers, s.active]),
		);
	});
	source.subscribe({
		complete() {
			log.push('A');
			stop.abort();
		},
	});
	source.subscribe(
		{
			complete() {
				log.push('B');
			},
		},
		{ signal: stop.signal },
	);
	sink.complete();
	assert.deepEqual(log, [['cleanup', 0, false], 'A']);
});

test('a close getter cannot let an old execution close its replacement', () => {
	const sinks = [];
	const stop = new AbortController();
	const source = new SharedObservable((s) => sinks.push(s));
	source.subscribe({}, { signal: stop.signal });
	sinks[0].complete({
		get close() {
			stop.abort();
			source.subscribe();
			return true;
		},
	});
	assert.equal(sinks[1].active, true);
	assert.equal(source.activeSubscribers, 1);
});

test('observer errors are isolated, inactive errors report, and teardown is LIFO with late cleanup', () => {
	const reports = [],
		log = [];
	const previous = globalThis.reportError;
	globalThis.reportError = (error) => reports.push(error);
	try {
		let sink;
		const source = new SharedObservable((s) => {
			sink = s;
			s.addTeardown(() => log.push(1));
			s.addTeardown(() => {
				log.push(2);
				throw 'cleanup';
			});
		});
		source.subscribe(() => {
			throw 'observer';
		});
		source.subscribe((value) => log.push(value));
		sink.next(3);
		sink.complete();
		sink.addTeardown(() => log.push('late'));
		sink.error('inactive');
		assert.deepEqual(log, [3, 2, 1, 'late']);
		assert.deepEqual(reports, ['observer', 'cleanup', 'inactive']);
	} finally {
		if (previous === undefined) delete globalThis.reportError;
		else globalThis.reportError = previous;
	}
});

test('closed replay counts nested subscriptions and removes cancellations immediately', () => {
	const source = new SharedObservable({
		maxReplayValues: 2,
		producer(s) {
			s.next(1);
			s.next(2);
			s.complete({ close: true });
		},
	});
	source.subscribe();
	const stop = new AbortController();
	const log = [];
	source.subscribe(
		{
			next(value) {
				log.push(['outer', value, source.activeSubscribers]);
				source.subscribe({
					next(inner) {
						log.push(['inner', inner, source.activeSubscribers]);
					},
					complete() {
						log.push(['inner complete', source.activeSubscribers]);
					},
				});
				stop.abort();
				log.push(['canceled', source.activeSubscribers]);
			},
			complete() {
				log.push('outer complete');
			},
		},
		{ signal: stop.signal },
	);
	assert.deepEqual(log, [
		['outer', 1, 1],
		['inner', 1, 2],
		['inner', 2, 2],
		['inner complete', 1],
		['canceled', 0],
	]);
});

test('canceling an old terminal recipient leaves a reentrant replacement attached', () => {
	const sinks = [],
		log = [];
	const oldConsumer = new AbortController();
	const source = new SharedObservable((s) => sinks.push(s));
	source.subscribe({
		complete() {
			source.subscribe((value) => log.push(value));
			oldConsumer.abort();
			log.push(['active', source.activeSubscribers]);
		},
	});
	source.subscribe(
		{
			complete() {
				log.push('old complete');
			},
		},
		{ signal: oldConsumer.signal },
	);
	sinks[0].complete();
	sinks[1].next('new');
	assert.deepEqual(log, [['active', 1], 'new']);
	assert.equal(sinks[1].active, true);
});

test('cancellation skips recipients already captured by live delivery', () => {
	let sink;
	const stop = new AbortController(),
		log = [];
	const source = new SharedObservable((s) => {
		sink = s;
	});
	source.subscribe(() => stop.abort());
	source.subscribe((value) => log.push(value), { signal: stop.signal });
	sink.next(1);
	assert.deepEqual(log, []);
	assert.equal(source.activeSubscribers, 1);
});
