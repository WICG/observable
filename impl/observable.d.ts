export interface Observer<T> {
	next(value: T): void;
	error(error: any): void;
	complete(): void;
}
export interface SubscriptionOptions {
	signal?: AbortSignal;
}
type ConvertableToObservable<T> =
	| Observable<T>
	| PromiseLike<T>
	| Iterable<T>
	| AsyncIterable<T>;
export declare class Observable<T> {
	private start;
	static from<T>(value: ConvertableToObservable<T>): Observable<T>;
	constructor(start: (subscriber: Subscriber<T>) => void);
	subscribe(onNext: (value: T) => void, options?: SubscriptionOptions): void;
	subscribe(
		observer: Partial<Observer<T>>,
		options?: SubscriptionOptions,
	): void;
	forEach(
		callback: (value: T) => void,
		options?: SubscriptionOptions,
	): Promise<void>;
	map<R>(project: (value: T, index: number) => R): Observable<R>;
	filter(predicate: (value: T, index: number) => boolean): Observable<T>;
	take(count: number): Observable<T>;
	drop(count: number): Observable<T>;
	flatMap<R>(
		project: (value: T, index: number) => ConvertableToObservable<R>,
	): Observable<R>;
	takeUntil(notifier: ConvertableToObservable<unknown>): Observable<T>;
	every(
		predicate: (value: T, index: number) => boolean,
		options?: SubscriptionOptions,
	): Promise<boolean>;
	some(
		predicate: (value: T, index: number) => boolean,
		options?: SubscriptionOptions,
	): Promise<boolean>;
	find(
		predicate: (value: T, index: number) => boolean,
		options?: SubscriptionOptions,
	): Promise<T>;
	reduce<S>(
		reducer: (accumulated: S, value: T, index: number) => S,
		initialValue?: S,
		options?: SubscriptionOptions,
	): Promise<S>;
	toArray(options?: SubscriptionOptions): Promise<T[]>;
	catch<R>(
		handleError: (error: unknown) => ConvertableToObservable<R>,
	): Observable<T | R>;
	finally(onFinalize: () => void): Observable<T>;
	[Symbol.asyncIterator](): AsyncGenerator<T>;
}

declare class Subscriber<T> implements Observer<T> {
	#private;
	private _observer;
	get signal(): AbortSignal;
	get isActive(): boolean;
	constructor(signal: AbortSignal | undefined, _observer: Observer<T>);
	next(value: T): void;
	error(error: any): void;
	complete(): void;
	addTeardown(teardown: () => void): void;
}

export {};
