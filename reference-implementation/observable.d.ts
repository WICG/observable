export interface SubscribeOptions {
	signal?: AbortSignal;
}
export interface SubscriptionObserver<T> {
	next?(value: T): void;
	error?(reason: unknown): void;
	complete?(): void;
}
export type Observer<T> = ((value: T) => void) | SubscriptionObserver<T>;
export type Producer<T> = (subscriber: Subscriber<T>) => void;
export interface TerminationConfig {
	close?: boolean;
}
export interface Subscriber<T> {
	readonly active: boolean;
	readonly signal: AbortSignal;
	next(value: T): void;
	error(reason: unknown, config?: TerminationConfig): void;
	complete(config?: TerminationConfig): void;
	addTeardown(teardown: () => void): void;
}
export declare const Subscriber: { readonly prototype: Subscriber<unknown> };
export interface ShareConfig {
	maxReplayValues?: number;
	closeOnComplete?: boolean;
	closeOnError?: boolean;
	closeOnLastUnsubscribe?: boolean;
	keepAliveOnLastUnsubscribe?: boolean;
}
export interface ObservableConfig<T> {
	producer: Producer<T>;
	sharedSources?: readonly SharedObservable<unknown>[] | null;
}
export interface SharedObservableConfig<T>
	extends ObservableConfig<T>, ShareConfig {}
export type ObservableInput<T> =
	Observable<T> | AsyncIterable<T> | Iterable<T> | Promise<T>;
export interface ObservableInspector<T> extends SubscriptionObserver<T> {
	subscribe?(): void;
	abort?(reason: unknown): void;
}
export type Inspector<T> = ((value: T) => void) | ObservableInspector<T>;
export interface Observable<T> {
	readonly sharedSources: readonly SharedObservable<unknown>[] | null;
	subscribe(observer?: Observer<T>, options?: SubscribeOptions): void;
	share(config?: ShareConfig): SharedObservable<T>;
	map<R>(mapper: (value: T, index: number) => R): Observable<R>;
	filter(predicate: (value: T, index: number) => boolean): Observable<T>;
	take(amount: number): Observable<T>;
	drop(amount: number): Observable<T>;
	takeUntil(notifier: ObservableInput<unknown>): Observable<T>;
	flatMap<R>(
		mapper: (value: T, index: number) => ObservableInput<R>,
	): Observable<R>;
	switchMap<R>(
		mapper: (value: T, index: number) => ObservableInput<R>,
	): Observable<R>;
	inspect(inspector?: Inspector<T>): Observable<T>;
	catch<R>(
		callback: (reason: unknown) => ObservableInput<R>,
	): Observable<T | R>;
	finally(callback: () => void): Observable<T>;
}
export interface SharedObservable<T> extends Observable<T> {
	readonly activeSubscribers: number;
	readonly replayValues: readonly T[];
	readonly maxReplayValues: number;
}
export declare const Observable: {
	new <T>(producer: Producer<T>): Observable<T>;
	new <T>(config: ObservableConfig<T>): Observable<T>;
	from<T>(source: SharedObservable<T>): SharedObservable<T>;
	from<T>(source: Observable<T>): Observable<T>;
	from<T>(input: ObservableInput<T>): Observable<T>;
	readonly prototype: Observable<unknown>;
};
export declare const SharedObservable: {
	new <T>(producer: Producer<T>): SharedObservable<T>;
	new <T>(config: SharedObservableConfig<T>): SharedObservable<T>;
	readonly prototype: SharedObservable<unknown>;
};
export interface ObservableEventListenerOptions {
	capture?: boolean;
	passive?: boolean;
}
export declare function when(
	this: EventTarget,
	type: string,
	options?: ObservableEventListenerOptions,
): Observable<Event>;
export declare function install(target?: object): void;
