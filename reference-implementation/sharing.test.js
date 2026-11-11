import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Observable, SharedObservable } from './observable.js';

test('ordinary observations execute independently; share establishes one lazy boundary', () => {
	let starts = 0;
	let cleanups = 0;
	const source = new Observable((s) => {
		starts++;
		s.addTeardown(() => cleanups++);
	});
	const shared = source.share();
	assert.equal(starts, 0);
	const a = new AbortController();
	const b = new AbortController();
	shared.subscribe({}, { signal: a.signal });
	shared.subscribe({}, { signal: b.signal });
	assert.equal(starts, 1);
	assert.equal(shared.activeSubscribers, 2);
	a.abort();
	assert.equal(cleanups, 0);
	b.abort();
	assert.equal(cleanups, 1);
	shared.subscribe();
	assert.equal(starts, 2);
	source.subscribe();
	source.subscribe();
	assert.equal(starts, 4);
});

test('joining during next receives the retained value exactly once', () => {
	const log = [];
	const source = new SharedObservable({
		maxReplayValues: 1,
		producer(s) {
			s.next(7);
			s.complete({ close: true });
		},
	});
	source.subscribe((value) => {
		log.push(`A:${value}`);
		source.subscribe((value) => log.push(`B:${value}`));
	});
	assert.deepEqual(log, ['A:7', 'B:7']);
	assert.deepEqual(source.replayValues, [7]);
	assert.equal(source.activeSubscribers, 0);
});

test('take detaches and runs upstream teardown before its final next', () => {
	const log = [];
	new Observable((s) => {
		s.addTeardown(() => log.push('teardown'));
		s.next(1);
		s.next(2);
	})
		.take(1)
		.subscribe({
			next: (value) => log.push(value),
			complete: () => log.push('complete'),
		});
	assert.deepEqual(log, ['teardown', 1, 'complete']);
});

test('shared input has per-observation operator state and declared ancestry', () => {
	let sink;
	const source = new SharedObservable((s) => {
		sink = s;
	});
	const view = source.take(2);
	const a = [],
		b = [];
	view.subscribe((value) => a.push(value));
	sink.next(1);
	view.subscribe((value) => b.push(value));
	sink.next(2);
	sink.next(3);
	assert.deepEqual(a, [1, 2]);
	assert.deepEqual(b, [2, 3]);
	assert.deepEqual(view.sharedSources, [source]);
	assert.equal(view instanceof SharedObservable, false);
	assert.equal(source instanceof Observable, true);
	assert.equal(SharedObservable.from, undefined);
});

test('sharedSources stops at the nearest shared boundary across repeated sharing', () => {
	const source = new Observable(() => {});
	const fn = (value) => value;
	const a = source.share();
	const b = a.map(fn);
	const c = b.share();
	const d = c.filter(fn);

	assert.equal(d.sharedSources[0], c);
	assert.equal(d.sharedSources.length, 1);
	assert.equal(c.sharedSources.length, 1);
	assert.equal(c.sharedSources[0], a);
	assert.equal(b.sharedSources.length, 1);
	assert.equal(b.sharedSources[0], a);
});
