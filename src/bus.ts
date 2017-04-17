import * as EventEmitter from 'events';

export const events = {
  START: Symbol('start'),
  END: Symbol('end'),
  STOP: Symbol('stop'),
  ERROR: Symbol('error'),
  DIAGNOSTICS: Symbol('ts.diagnostics'),
  TRANSFORM: Symbol('transform'),
  TRANSFORM_DONE: Symbol('transform.done'),
  CLEANUP: Symbol('cleanup'),
  CLEANUP_DONE: Symbol('cleanup.done'),
};

export const emitter = new EventEmitter();
