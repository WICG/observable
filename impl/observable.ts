/**
MIT License

Copyright (c) 2023 Ben Lesh <ben@benlesh.com>, Domenic Farolino <dom@chromium.org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

export interface Observer<T> {
    next(value: T): void;
    error(error: any): void;
    complete(): void;
}

export interface SubscriptionOptions<T> extends Partial<Observer<T>> {
    signal?: AbortSignal;
}

export class Observable<T> {
    constructor(private start: (subscriber: Subscriber<T>) => void) { }

    subscribe(options?: SubscriptionOptions<T>) {
        const observer: Observer<T> = options
            ? typeof options === 'function'
                ? { next: options, error: reportError, complete: noop }
                : typeof options.next === 'function' &&
                    typeof options.error === 'function' &&
                    typeof options.complete === 'function'
                    ? (options as Observer<T>)
                    : {
                        next: (value) => options.next?.(value),
                        error: (error) => {
                            if (options.error) {
                                options.error(error);
                            } else {
                                reportError(error);
                            }
                        },
                        complete: () => options.complete?.(),
                    }
            : {
                next: noop,
                error: reportError,
                complete: noop,
            };

        const subscriber = new Subscriber(options?.signal, observer);

        this.start(subscriber);
    }

    forEach(
        callback: (value: T) => void,
        options?: { signal?: AbortSignal }
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const ac = new AbortController();
            maybeFollowSignal(ac, options?.signal);

            this.subscribe({
                next: (value) => {
                    try {
                        callback(value);
                    } catch (error) {
                        reject(error);
                        ac.abort();
                    }
                },
                error: reject,
                complete: resolve,
                signal: ac.signal,
            });
        });
    }

    map<R>(project: (value: T, index: number) => R): Observable<R> {
        return new Observable((destination) => {
            let index = 0;

            this.subscribe({
                next(value) {
                    let result: R;
                    try {
                        result = project(value, index++);
                    } catch (error) {
                        destination.error(error);
                        return;
                    }
                    destination.next(result);
                },
                error(error) {
                    destination.error(error);
                },
                complete() {
                    destination.complete();
                },
                signal: destination.signal,
            });
        });
    }

    filter(predicate: (value: T, index: number) => boolean): Observable<T> {
        return new Observable((destination) => {
            let index = 0;

            this.subscribe({
                next(value) {
                    let result = false;
                    try {
                        result = predicate(value, index++);
                    } catch (error) {
                        destination.error(error);
                        return;
                    }
                    if (result) {
                        destination.next(value);
                    }
                },
                error(error) {
                    destination.error(error);
                },
                complete() {
                    destination.complete();
                },
                signal: destination.signal,
            });
        });
    }

    take(count: number): Observable<T> {
        return new Observable((destination) => {
            let remaining = count;

            this.subscribe({
                next(value) {
                    remaining--;
                    if (remaining >= 0) {
                        destination.next(value);
                    }
                    if (remaining === 0) {
                        destination.complete();
                    }
                },
                error(error) {
                    destination.error(error);
                },
                complete() {
                    destination.complete();
                },
                signal: destination.signal,
            });
        });
    }

    drop(count: number): Observable<T> {
        return new Observable((destination) => {
            let seen = 0;

            this.subscribe({
                next(value) {
                    seen++;
                    if (seen > count) {
                        destination.next(value);
                    }
                },
                error(error) {
                    destination.error(error);
                },
                complete() {
                    destination.complete();
                },
                signal: destination.signal,
            });
        });
    }

    flatMap<R>(
        project: (value: T, index: number) => Observable<R>
    ): Observable<R> {
        return new Observable((destination) => {
            let queue: T[] = [];
            let index = 0;
            let innerAC: AbortController | undefined;
            let outerComplete = false;

            const startInner = (value: T) => {
                innerAC = new AbortController();
                maybeFollowSignal(innerAC, destination.signal);

                let innerObservable: Observable<R>;
                try {
                    innerObservable = project(value, index++);
                } catch (error) {
                    destination.error(error);
                    return;
                }

                innerObservable.subscribe({
                    next(innerValue) {
                        destination.next(innerValue);
                    },
                    error(error) {
                        destination.error(error);
                    },
                    complete() {
                        innerAC = undefined;
                        if (queue.length > 0) {
                            startInner(queue.shift()!);
                        } else if (outerComplete) {
                            destination.complete();
                        }
                    },
                    signal: innerAC.signal,
                });
            };

            this.subscribe({
                next(value) {
                    if (innerAC) {
                        queue.push(value);
                    } else {
                        startInner(value);
                    }
                },
                error(error) {
                    destination.error(error);
                },
                complete() {
                    outerComplete = true;
                    if (queue.length === 0) {
                        destination.complete();
                    }
                },
                signal: destination.signal,
            });
        });
    }

    takeUntil(notifier: Observable<unknown>): Observable<T> {
        return new Observable((destination) => {
            notifier.subscribe({
                next() {
                    destination.complete();
                },
                error(error) {
                    destination.error(error);
                },
                signal: destination.signal,
            });
            this.subscribe(destination);
        });
    }

    every(
        predicate: (value: T, index: number) => boolean,
        options?: { signal?: AbortSignal }
    ): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const ac = new AbortController();
            maybeFollowSignal(ac, options.signal);
            let index = 0;
            this.subscribe({
                next(value) {
                    let result = false;
                    try {
                        result = predicate(value, index++);
                    } catch (error) {
                        reject(error);
                        ac.abort();
                        return;
                    }
                    if (!result) {
                        resolve(false);
                        ac.abort();
                    }
                },
                error: reject,
                complete() {
                    resolve(true);
                },
                signal: ac.signal,
            });
        });
    }

    some(
        predicate: (value: T, index: number) => boolean,
        options?: { signal?: AbortSignal }
    ): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const ac = new AbortController();
            maybeFollowSignal(ac, options.signal);
            let index = 0;
            this.subscribe({
                next(value) {
                    let result = false;
                    try {
                        result = predicate(value, index++);
                    } catch (error) {
                        reject(error);
                        ac.abort();
                        return;
                    }
                    if (result) {
                        resolve(true);
                        ac.abort();
                    }
                },
                error: reject,
                complete() {
                    resolve(false);
                },
                signal: ac.signal,
            });
        });
    }

    find(
        predicate: (value: T, index: number) => boolean,
        options?: { signal?: AbortSignal }
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const ac = new AbortController();
            maybeFollowSignal(ac, options.signal);
            let index = 0;
            this.subscribe({
                next(value) {
                    let result = false;
                    try {
                        result = predicate(value, index++);
                    } catch (error) {
                        reject(error);
                        ac.abort();
                        return;
                    }
                    if (result) {
                        resolve(value);
                        ac.abort();
                    }
                },
                error: reject,
                complete() {
                    // TODO: Figure out the proper semantics here.
                    reject(new Error('Value not found'));
                },
                signal: ac.signal,
            });
        });
    }

    reduce<S>(
        reducer: (accumulated: S, value: T, index: number) => S,
        initialValue?: S,
        options?: { signal?: AbortSignal }
    ): Promise<S> {
        return new Promise((resolve, reject) => {
            const ac = new AbortController();
            maybeFollowSignal(ac, options.signal);
            let hasState = arguments.length >= 2;
            let state = initialValue;
            let index = 0;
            this.subscribe({
                next(value) {
                    if (hasState) {
                        try {
                            state = reducer(state, value, index++);
                        } catch (error) {
                            reject(error);
                            ac.abort();
                            return;
                        }
                    } else {
                        state = value as any;
                    }
                },
                error: reject,
                complete() {
                    resolve(state);
                },
                signal: ac.signal,
            });
        });
    }

    toArray(options?: { signal?: AbortSignal }): Promise<T[]> {
        return this.reduce(
            (arr, value) => {
                arr.push(value);
                return arr;
            },
            [],
            options
        );
    }
}

class Subscriber<T> implements Observer<T> {
    #stopped = false;

    #abortController = new AbortController();

    get signal() {
        return this.#abortController.signal;
    }

    get closed() {
        return this.#stopped || this.#abortController.signal.aborted;
    }

    constructor(
        private _signal: AbortSignal | undefined,
        private _observer: Observer<T>
    ) {
        maybeFollowSignal(this.#abortController, this._signal);
    }

    next(value: T): void {
        if (!this.closed) {
            this._observer.next(value);
        }
    }

    error(error: any): void {
        if (!this.closed) {
            this.#stopped = true;
            this._observer.error(error);
            this.#abortController.abort();
        }
    }

    complete(): void {
        if (!this.closed) {
            this.#stopped = true;
            this._observer.complete();
            this.#abortController.abort();
        }
    }
}

function noop() { }

function maybeFollowSignal(
    abortController: AbortController,
    signal: AbortSignal | undefined
) {
    if (signal) {
        const parentAbortHandler = () => {
            abortController.abort();
        };
        signal.addEventListener('abort', parentAbortHandler, {
            once: true,
        });
        abortController.signal.addEventListener('abort', () => {
            signal.removeEventListener('abort', parentAbortHandler);
        });
    }
}

function polyfill() {
    const proto = EventTarget.prototype as any;
    if (typeof proto.on !== 'function') {
        proto.on = function (type: Parameters<EventTarget['addEventListener']>[0]) {
            return new Observable((subscriber) => {
                this.addEventListener(
                    type,
                    (event) => {
                        subscriber.next(event);
                    },
                    { signal: subscriber.signal }
                );
            });
        };
    }

    if (typeof globalThis.Observable !== 'function') {
        (globalThis as any).Observable = Observable;
    }
}

polyfill();
