import { Observable, SharedObservable } from './observable.js';

let starts = 0;
const result = new SharedObservable({
	maxReplayValues: 1,
	keepAliveOnLastUnsubscribe: true,
	producer(s) {
		console.log('Producer execution:', ++starts);
		s.next(42);
		s.complete({ close: true });
	},
});
result.take(1).subscribe((value) => console.log('First observer:', value));
result.subscribe({
	next: (value) => console.log('Late observer (replay):', value),
	complete: () => console.log('Retained completion; no second execution'),
});
console.log(
	'Ordinary operator result:',
	result.map((x) => x) instanceof Observable,
);
