import { Observable } from './observable';

declare global {
	interface EventTarget {
		on(eventType: string): Observable<Event>;
	}
	interface AbortSignal {
		on<K extends keyof AbortSignalEventMap>(
			eventType: K,
		): Observable<AbortSignalEventMap[K]>;
	}
	interface AbstractWorker {
		on<K extends keyof AbstractWorkerEventMap>(
			eventType: K,
		): Observable<AbstractWorkerEventMap[K]>;
	}
	interface Animation {
		on<K extends keyof AnimationEventMap>(
			eventType: K,
		): Observable<AnimationEventMap[K]>;
	}
	interface AudioScheduledSourceNode {
		on<K extends keyof AudioScheduledSourceNodeEventMap>(
			eventType: K,
		): Observable<AudioScheduledSourceNodeEventMap[K]>;
	}
	interface AudioWorkletNode {
		on<K extends keyof AudioWorkletNodeEventMap>(
			eventType: K,
		): Observable<AudioWorkletNodeEventMap[K]>;
	}
	interface BaseAudioContext {
		on<K extends keyof BaseAudioContextEventMap>(
			eventType: K,
		): Observable<BaseAudioContextEventMap[K]>;
	}
	interface BroadcastChannel {
		on<K extends keyof BroadcastChannelEventMap>(
			eventType: K,
		): Observable<BroadcastChannelEventMap[K]>;
	}
	interface Document {
		on<K extends keyof DocumentEventMap>(
			eventType: K,
		): Observable<DocumentEventMap[K]>;
	}
	interface Element {
		on<K extends keyof ElementEventMap>(
			eventType: K,
		): Observable<ElementEventMap[K]>;
	}
	interface EventSource {
		on<K extends keyof EventSourceEventMap>(
			eventType: K,
		): Observable<EventSourceEventMap[K]>;
	}
	interface FileReader {
		on<K extends keyof FileReaderEventMap>(
			eventType: K,
		): Observable<FileReaderEventMap[K]>;
	}
	interface FontFaceSet {
		on<K extends keyof FontFaceSetEventMap>(
			eventType: K,
		): Observable<FontFaceSetEventMap[K]>;
	}
	interface GlobalEventHandlers {
		on<K extends keyof GlobalEventHandlersEventMap>(
			eventType: K,
		): Observable<GlobalEventHandlersEventMap[K]>;
	}
	interface HTMLBodyElement {
		on<K extends keyof HTMLBodyElementEventMap>(
			eventType: K,
		): Observable<HTMLBodyElementEventMap[K]>;
	}
	interface HTMLElement {
		on<K extends keyof HTMLElementEventMap>(
			eventType: K,
		): Observable<HTMLElementEventMap[K]>;
	}
	interface HTMLFrameSetElement {
		on<K extends keyof HTMLFrameSetElementEventMap>(
			eventType: K,
		): Observable<HTMLFrameSetElementEventMap[K]>;
	}
	interface HTMLMediaElement {
		on<K extends keyof HTMLMediaElementEventMap>(
			eventType: K,
		): Observable<HTMLMediaElementEventMap[K]>;
	}
	interface HTMLVideoElement {
		on<K extends keyof HTMLVideoElementEventMap>(
			eventType: K,
		): Observable<HTMLVideoElementEventMap[K]>;
	}
	interface IDBDatabase {
		on<K extends keyof IDBDatabaseEventMap>(
			eventType: K,
		): Observable<IDBDatabaseEventMap[K]>;
	}
	interface IDBOpenDBRequest {
		on<K extends keyof IDBOpenDBRequestEventMap>(
			eventType: K,
		): Observable<IDBOpenDBRequestEventMap[K]>;
	}
	interface IDBRequest {
		on<K extends keyof IDBRequestEventMap>(
			eventType: K,
		): Observable<IDBRequestEventMap[K]>;
	}
	interface IDBTransaction {
		on<K extends keyof IDBTransactionEventMap>(
			eventType: K,
		): Observable<IDBTransactionEventMap[K]>;
	}
	interface MIDIAccess {
		on<K extends keyof MIDIAccessEventMap>(
			eventType: K,
		): Observable<MIDIAccessEventMap[K]>;
	}
	interface MIDIInput {
		on<K extends keyof MIDIInputEventMap>(
			eventType: K,
		): Observable<MIDIInputEventMap[K]>;
	}
	interface MIDIPort {
		on<K extends keyof MIDIPortEventMap>(
			eventType: K,
		): Observable<MIDIPortEventMap[K]>;
	}
	interface MathMLElement {
		on<K extends keyof MathMLElementEventMap>(
			eventType: K,
		): Observable<MathMLElementEventMap[K]>;
	}
	interface MediaDevices {
		on<K extends keyof MediaDevicesEventMap>(
			eventType: K,
		): Observable<MediaDevicesEventMap[K]>;
	}
	interface MediaKeySession {
		on<K extends keyof MediaKeySessionEventMap>(
			eventType: K,
		): Observable<MediaKeySessionEventMap[K]>;
	}
	interface MediaQueryList {
		on<K extends keyof MediaQueryListEventMap>(
			eventType: K,
		): Observable<MediaQueryListEventMap[K]>;
	}
	interface MediaRecorder {
		on<K extends keyof MediaRecorderEventMap>(
			eventType: K,
		): Observable<MediaRecorderEventMap[K]>;
	}
	interface MediaSource {
		on<K extends keyof MediaSourceEventMap>(
			eventType: K,
		): Observable<MediaSourceEventMap[K]>;
	}
	interface MediaStream {
		on<K extends keyof MediaStreamEventMap>(
			eventType: K,
		): Observable<MediaStreamEventMap[K]>;
	}
	interface MediaStreamTrack {
		on<K extends keyof MediaStreamTrackEventMap>(
			eventType: K,
		): Observable<MediaStreamTrackEventMap[K]>;
	}
	interface MessagePort {
		on<K extends keyof MessagePortEventMap>(
			eventType: K,
		): Observable<MessagePortEventMap[K]>;
	}
	interface Notification {
		on<K extends keyof NotificationEventMap>(
			eventType: K,
		): Observable<NotificationEventMap[K]>;
	}
	interface OfflineAudioContext {
		on<K extends keyof OfflineAudioContextEventMap>(
			eventType: K,
		): Observable<OfflineAudioContextEventMap[K]>;
	}
	interface OffscreenCanvas {
		on<K extends keyof OffscreenCanvasEventMap>(
			eventType: K,
		): Observable<OffscreenCanvasEventMap[K]>;
	}
	interface PaymentRequest {
		on<K extends keyof PaymentRequestEventMap>(
			eventType: K,
		): Observable<PaymentRequestEventMap[K]>;
	}
	interface Performance {
		on<K extends keyof PerformanceEventMap>(
			eventType: K,
		): Observable<PerformanceEventMap[K]>;
	}
	interface PermissionStatus {
		on<K extends keyof PermissionStatusEventMap>(
			eventType: K,
		): Observable<PermissionStatusEventMap[K]>;
	}
	interface PictureInPictureWindow {
		on<K extends keyof PictureInPictureWindowEventMap>(
			eventType: K,
		): Observable<PictureInPictureWindowEventMap[K]>;
	}
	interface RTCDTMFSender {
		on<K extends keyof RTCDTMFSenderEventMap>(
			eventType: K,
		): Observable<RTCDTMFSenderEventMap[K]>;
	}
	interface RTCDataChannel {
		on<K extends keyof RTCDataChannelEventMap>(
			eventType: K,
		): Observable<RTCDataChannelEventMap[K]>;
	}
	interface RTCDtlsTransport {
		on<K extends keyof RTCDtlsTransportEventMap>(
			eventType: K,
		): Observable<RTCDtlsTransportEventMap[K]>;
	}
	interface RTCIceTransport {
		on<K extends keyof RTCIceTransportEventMap>(
			eventType: K,
		): Observable<RTCIceTransportEventMap[K]>;
	}
	interface RTCPeerConnection {
		on<K extends keyof RTCPeerConnectionEventMap>(
			eventType: K,
		): Observable<RTCPeerConnectionEventMap[K]>;
	}
	interface RTCSctpTransport {
		on<K extends keyof RTCSctpTransportEventMap>(
			eventType: K,
		): Observable<RTCSctpTransportEventMap[K]>;
	}
	interface RemotePlayback {
		on<K extends keyof RemotePlaybackEventMap>(
			eventType: K,
		): Observable<RemotePlaybackEventMap[K]>;
	}
	interface SharedWorker {
		on<K extends keyof AbstractWorkerEventMap>(
			eventType: K,
		): Observable<AbstractWorkerEventMap[K]>;
	}
	interface SVGElement {
		on<K extends keyof SVGElementEventMap>(
			eventType: K,
		): Observable<SVGElementEventMap[K]>;
	}
	interface SVGSVGElement {
		on<K extends keyof SVGSVGElementEventMap>(
			eventType: K,
		): Observable<SVGSVGElementEventMap[K]>;
	}
	interface ScreenOrientation {
		on<K extends keyof ScreenOrientationEventMap>(
			eventType: K,
		): Observable<ScreenOrientationEventMap[K]>;
	}
	interface ScriptProcessorNode {
		on<K extends keyof ScriptProcessorNodeEventMap>(
			eventType: K,
		): Observable<ScriptProcessorNodeEventMap[K]>;
	}
	interface ServiceWorker {
		on<K extends keyof ServiceWorkerEventMap>(
			eventType: K,
		): Observable<ServiceWorkerEventMap[K]>;
	}
	interface ServiceWorkerContainer {
		on<K extends keyof ServiceWorkerContainerEventMap>(
			eventType: K,
		): Observable<ServiceWorkerContainerEventMap[K]>;
	}
	interface ServiceWorkerRegistration {
		on<K extends keyof ServiceWorkerRegistrationEventMap>(
			eventType: K,
		): Observable<ServiceWorkerRegistrationEventMap[K]>;
	}
	interface ShadowRoot {
		on<K extends keyof ShadowRootEventMap>(
			eventType: K,
		): Observable<ShadowRootEventMap[K]>;
	}
	interface SourceBuffer {
		on<K extends keyof SourceBufferEventMap>(
			eventType: K,
		): Observable<SourceBufferEventMap[K]>;
	}
	interface SourceBufferList {
		on<K extends keyof SourceBufferListEventMap>(
			eventType: K,
		): Observable<SourceBufferListEventMap[K]>;
	}
	interface SpeechSynthesis {
		on<K extends keyof SpeechSynthesisEventMap>(
			eventType: K,
		): Observable<SpeechSynthesisEventMap[K]>;
	}
	interface SpeechSynthesisUtterance {
		on<K extends keyof SpeechSynthesisUtteranceEventMap>(
			eventType: K,
		): Observable<SpeechSynthesisUtteranceEventMap[K]>;
	}
	interface TextTrack {
		on<K extends keyof TextTrackEventMap>(
			eventType: K,
		): Observable<TextTrackEventMap[K]>;
	}
	interface TextTrackCue {
		on<K extends keyof TextTrackCueEventMap>(
			eventType: K,
		): Observable<TextTrackCueEventMap[K]>;
	}
	interface TextTrackList {
		on<K extends keyof TextTrackListEventMap>(
			eventType: K,
		): Observable<TextTrackListEventMap[K]>;
	}
	interface VideoDecoder {
		on<K extends keyof VideoDecoderEventMap>(
			eventType: K,
		): Observable<VideoDecoderEventMap[K]>;
	}
	interface VideoEncoder {
		on<K extends keyof VideoEncoderEventMap>(
			eventType: K,
		): Observable<VideoEncoderEventMap[K]>;
	}
	interface VisualViewport {
		on<K extends keyof VisualViewportEventMap>(
			eventType: K,
		): Observable<VisualViewportEventMap[K]>;
	}
	interface WakeLockSentinel {
		on<K extends keyof WakeLockSentinelEventMap>(
			eventType: K,
		): Observable<WakeLockSentinelEventMap[K]>;
	}
	interface WebSocket {
		on<K extends keyof WebSocketEventMap>(
			eventType: K,
		): Observable<WebSocketEventMap[K]>;
	}
	interface Window {
		on<K extends keyof WindowEventMap>(
			eventType: K,
		): Observable<WindowEventMap[K]>;
	}
	interface WindowEventHandlers {
		on<K extends keyof WindowEventHandlersEventMap>(
			eventType: K,
		): Observable<WindowEventHandlersEventMap[K]>;
	}
	interface Worker {
		on<K extends keyof WorkerEventMap>(
			eventType: K,
		): Observable<WorkerEventMap[K]>;
	}
	interface XMLHttpRequest {
		on<K extends keyof XMLHttpRequestEventMap>(
			eventType: K,
		): Observable<XMLHttpRequestEventMap[K]>;
	}
	interface XMLHttpRequestEventTarget {
		on<K extends keyof XMLHttpRequestEventTargetEventMap>(
			eventType: K,
		): Observable<XMLHttpRequestEventTargetEventMap[K]>;
	}
}

export {};
