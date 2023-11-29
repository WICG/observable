import { Observable } from './observable.js';

function polyfill() {
	const proto = EventTarget.prototype;
	if (typeof proto.on !== 'function') {
		proto.on = function (type) {
			return new Observable((subscriber) => {
				this.addEventListener(
					type,
					(event) => {
						subscriber.next(event);
					},
					{ signal: subscriber.signal },
				);
			});
		};
	}
	if (typeof globalThis.Observable !== 'function') {
		globalThis.Observable = Observable;
	}
}

polyfill();
