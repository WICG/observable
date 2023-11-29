export class Observable {
  static from(value) {
    if (value instanceof Observable) {
      return value;
    }
    if (isPromiseLike(value)) {
      return new Observable((subscriber) => {
        value.then(
          (value) => {
            subscriber.next(value);
            subscriber.complete();
          },
          (error) => {
            subscriber.error(error);
          }
        );
      });
    }
    if (Symbol.asyncIterator in value) {
      return new Observable(async (subscriber) => {
        try {
          for await (const v of value) {
            subscriber.next(v);
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      });
    }
    if (Symbol.iterator in value) {
      return new Observable((subscriber) => {
        try {
          for (const v of value) {
            if (subscriber.isActive) subscriber.next(v);
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      });
    }
    throw new TypeError("Value is not observable");
  }
  constructor(start) {
    this.start = start;
  }
  subscribe(fnOrObserver, options) {
    const partialObserver =
      typeof fnOrObserver === "function"
        ? { next: fnOrObserver }
        : fnOrObserver;
    const observer = {
      next: noop,
      error: reportError,
      complete: noop,
      ...partialObserver,
    };
    const subscriber = new Subscriber(options?.signal, observer);
    this.start(subscriber);
  }
  forEach(callback, options) {
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      const signal = options?.signal
        ? useSignalAll([ac.signal, options.signal])
        : ac.signal;
      this.subscribe(
        {
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
        },
        {
          signal,
        }
      );
    });
  }
  map(project) {
    return new Observable((destination) => {
      let index = 0;
      this.subscribe(
        {
          next(value) {
            let result;
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
        },
        {
          signal: destination.signal,
        }
      );
    });
  }
  filter(predicate) {
    return new Observable((destination) => {
      let index = 0;
      this.subscribe(
        {
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
        },
        {
          signal: destination.signal,
        }
      );
    });
  }
  take(count) {
    return new Observable((destination) => {
      let remaining = count;
      this.subscribe(
        {
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
        },
        {
          signal: destination.signal,
        }
      );
    });
  }
  drop(count) {
    return new Observable((destination) => {
      let seen = 0;
      this.subscribe(
        {
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
        },
        {
          signal: destination.signal,
        }
      );
    });
  }
  flatMap(project) {
    return new Observable((destination) => {
      let queue = [];
      let index = 0;
      let innerAC;
      let outerComplete = false;
      const startInner = (value) => {
        innerAC = new AbortController();
        const signal = useSignalAll([innerAC.signal, destination.signal]);
        let innerObservable;
        try {
          innerObservable = Observable.from(project(value, index++));
        } catch (error) {
          destination.error(error);
          return;
        }
        innerObservable.subscribe(
          {
            next(innerValue) {
              destination.next(innerValue);
            },
            error(error) {
              destination.error(error);
            },
            complete() {
              innerAC = undefined;
              if (queue.length > 0) {
                startInner(queue.shift());
              } else if (outerComplete) {
                destination.complete();
              }
            },
          },
          {
            signal,
          }
        );
      };
      this.subscribe(
        {
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
        },
        {
          signal: destination.signal,
        }
      );
    });
  }
  takeUntil(notifier) {
    return new Observable((destination) => {
      Observable.from(notifier).subscribe(
        {
          next() {
            destination.complete();
          },
          error(error) {
            destination.error(error);
          },
        },
        {
          signal: destination.signal,
        }
      );
      this.subscribe(destination, { signal: destination.signal });
    });
  }
  every(predicate, options) {
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      const signal = options?.signal
        ? useSignalAll([ac.signal, options.signal])
        : ac.signal;
      let index = 0;
      this.subscribe(
        {
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
        },
        {
          signal,
        }
      );
    });
  }
  some(predicate, options) {
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      const signal = options?.signal
        ? useSignalAll([ac.signal, options.signal])
        : ac.signal;
      let index = 0;
      this.subscribe(
        {
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
        },
        {
          signal,
        }
      );
    });
  }
  find(predicate, options) {
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      const signal = options?.signal
        ? useSignalAll([ac.signal, options.signal])
        : ac.signal;
      let index = 0;
      this.subscribe(
        {
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
            reject(new Error("Value not found"));
          },
        },
        {
          signal,
        }
      );
    });
  }
  reduce(reducer, initialValue, options) {
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      const signal = options?.signal
        ? useSignalAll([ac.signal, options.signal])
        : ac.signal;
      let hasState = arguments.length >= 2;
      let state = initialValue;
      let index = 0;
      this.subscribe(
        {
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
              state = value;
            }
            hasState = true;
          },
          error: reject,
          complete() {
            resolve(state);
          },
        },
        {
          signal,
        }
      );
    });
  }
  toArray(options) {
    return this.reduce(
      (arr, value) => {
        arr.push(value);
        return arr;
      },
      [],
      options
    );
  }
  catch(handleError) {
    return new Observable((destination) => {
      this.subscribe(
        {
          next(value) {
            destination.next(value);
          },
          error(error) {
            Observable.from(handleError(error)).subscribe(destination, {
              signal: destination.signal,
            });
          },
          complete() {
            destination.complete();
          },
        },
        {
          signal: destination.signal,
        }
      );
    });
  }
  finally(onFinalize) {
    return new Observable((destination) => {
      destination.addTeardown(onFinalize);
      this.subscribe(destination, {
        signal: destination.signal,
      });
    });
  }
  switchMap(project) {
    return new Observable((destination) => {
      let index = 0;
      let outerComplete = false;
      let innerAC;
      this.subscribe(
        {
          next: (value) => {
            innerAC?.abort();
            innerAC = new AbortController();
            const signal = useSignalAll([innerAC.signal, destination.signal]);
            let innerObservable;
            try {
              innerObservable = Observable.from(project(value, index++));
            } catch (error) {
              destination.error(error);
              return;
            }
            innerObservable.subscribe(
              {
                next(innerValue) {
                  destination.next(innerValue);
                },
                error(error) {
                  destination.error(error);
                },
                complete() {
                  innerAC = undefined;
                  if (outerComplete) {
                    destination.complete();
                  }
                },
              },
              {
                signal,
              }
            );
          },
          error(error) {
            destination.error(error);
          },
          complete() {
            outerComplete = true;
            if (!innerAC) {
              destination.complete();
            }
          },
        },
        {
          signal: destination.signal,
        }
      );
    });
  }
  do(fnOrObserver) {
    return new Observable((destination) => {
      const doObserver =
        typeof fnOrObserver === "function"
          ? { next: fnOrObserver }
          : fnOrObserver;
      this.subscribe(
        {
          next(value) {
            doObserver.next?.(value);
            destination.next(value);
          },
          error(error) {
            doObserver.error?.(error);
            destination.error(error);
          },
          complete() {
            doObserver.complete?.();
            destination.complete();
          },
        },
        {
          signal: destination.signal,
        }
      );
    });
  }
  [Symbol.asyncIterator]() {
    let ac;
    let deferred = [];
    let buffer = [];
    let hasError = false;
    let error = undefined;
    let isComplete = false;
    return {
      next: () => {
        return new Promise((resolve, reject) => {
          if (buffer.length > 0) {
            resolve({ value: buffer.shift(), done: false });
            return;
          }
          if (hasError) {
            reject(error);
            return;
          }
          if (isComplete) {
            resolve({ value: undefined, done: true });
            return;
          }
          if (!ac) {
            ac = new AbortController();
            this.subscribe(
              {
                next(value) {
                  if (deferred.length > 0) {
                    const [resolve] = deferred.shift();
                    resolve({ value, done: false });
                  } else {
                    buffer.push(value);
                  }
                },
                error(err) {
                  if (buffer.length > 0) {
                    hasError = true;
                    error = err;
                  } else {
                    while (deferred.length > 0) {
                      const [, reject] = deferred.shift();
                      reject(err);
                    }
                  }
                },
                complete() {},
              },
              {
                signal: ac.signal,
              }
            );
          }
          deferred.push([resolve, reject]);
        });
      },
      throw: (err) => {
        return new Promise((_resolve, reject) => {
          ac?.abort();
          hasError = true;
          error = err;
          for (const [, deferredReject] of deferred) {
            deferredReject(error);
          }
          reject(error);
        });
      },
      return: () => {
        return new Promise((resolve) => {
          ac?.abort();
          isComplete = true;
          for (const [deferredResolve] of deferred) {
            deferredResolve({ value: undefined, done: true });
          }
          resolve({ value: undefined, done: true });
        });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}
class Subscriber {
  #active = true;
  #abortController = new AbortController();
  #signal;
  get signal() {
    return this.#signal;
  }
  get isActive() {
    return this.#active && !this.signal.aborted;
  }
  constructor(signal, _observer) {
    this._observer = _observer;
    const ownSignal = this.#abortController.signal;
    this.#signal = signal ? useSignalAll([signal, ownSignal]) : ownSignal;
  }
  next(value) {
    if (this.isActive) {
      this._observer.next(value);
    }
  }
  error(error) {
    if (this.isActive) {
      this.#active = false;
      this._observer.error(error);
      this.#abortController.abort();
    }
  }
  complete() {
    if (this.isActive) {
      this.#active = false;
      this._observer.complete();
      this.#abortController.abort();
    }
  }
  addTeardown(teardown) {
    if (this.isActive) {
      this.#abortController.signal.addEventListener("abort", teardown, {
        once: true,
      });
    } else {
      teardown();
    }
  }
  removeTeardown(teardown) {
    this.#abortController.signal.removeEventListener("abort", teardown);
  }
}
function noop() {}

function useSignalAll(signals) {
  if (typeof AbortSignal.all === "function") {
    return AbortSignal.all(signals);
  } else {
    const ac = new AbortController();
    const handleAbort = () => {
      ac.abort();
      for (const signal of signals) {
        signal.removeEventListener("abort", handleAbort);
      }
    };
    for (const signal of signals) {
      signal.addEventListener("abort", handleAbort);
    }
    return ac.signal;
  }
}
function isPromiseLike(value) {
  return (
    value instanceof Promise ||
    (typeof value === "object" &&
      value !== null &&
      typeof value.then === "function")
  );
}
