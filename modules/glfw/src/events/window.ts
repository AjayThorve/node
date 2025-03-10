// Copyright (c) 2020, NVIDIA CORPORATION.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {merge as mergeObservables} from 'rxjs';
import {map, publish, refCount} from 'rxjs/operators';

import {glfw} from '../glfw';
import {GLFWDOMWindow} from '../jsdom/window';

import {GLFWEvent, windowCallbackAsObservable} from './event';

export function windowEvents(window: GLFWDOMWindow) {
  return mergeObservables(
    moveUpdates(window),
    sizeUpdates(window),
    scaleUpdates(window),
    framebufferSizeUpdates(window),
    closeUpdates(window),
    // refreshUpdates(window),
    focusUpdates(window),
    iconifyUpdates(window),
    maximizeUpdates(window),
  );
}

function moveUpdates(window: GLFWDOMWindow) {
  return windowCallbackAsObservable(glfw.setWindowPosCallback, window)
    .pipe(map(([, ...rest]) => GLFWWindowEvent.fromMove(window, ...rest)))
    .pipe(publish(), refCount());
}

function sizeUpdates(window: GLFWDOMWindow) {
  return windowCallbackAsObservable(glfw.setWindowSizeCallback, window)
    .pipe(map(([, ...rest]) => GLFWWindowEvent.fromResize(window, ...rest)))
    .pipe(publish(), refCount());
}

function scaleUpdates(window: GLFWDOMWindow) {
  return windowCallbackAsObservable(glfw.setWindowContentScaleCallback, window)
    .pipe(map(([, ...rest]) => GLFWWindowEvent.fromScale(window, ...rest)))
    .pipe(publish(), refCount());
}

function framebufferSizeUpdates(window: GLFWDOMWindow) {
  return windowCallbackAsObservable(glfw.setFramebufferSizeCallback, window)
    .pipe(map(([, ...rest]) => GLFWWindowEvent.fromFramebufferResize(window, ...rest)))
    .pipe(publish(), refCount());
}

function closeUpdates(window: GLFWDOMWindow) {
  return windowCallbackAsObservable(glfw.setWindowCloseCallback, window)
    .pipe(map(([, ...rest]) => GLFWWindowEvent.fromClose(window, ...rest)))
    .pipe(publish(), refCount());
}

// function refreshUpdates(window: GLFWDOMWindow) {
//     return windowCallbackAsObservable(glfw.setWindowRefreshCallback, window)
//         .pipe(map(([_, ...rest]) => GLFWWindowEvent.fromRefresh(window, ...rest)))
//         .pipe(publish(), refCount());
// }

function focusUpdates(window: GLFWDOMWindow) {
  return windowCallbackAsObservable(glfw.setWindowFocusCallback, window)
    .pipe(map(([, ...rest]) => GLFWWindowEvent.fromFocus(window, ...rest)))
    .pipe(publish(), refCount());
}

function iconifyUpdates(window: GLFWDOMWindow) {
  return windowCallbackAsObservable(glfw.setWindowIconifyCallback, window)
    .pipe(map(([, ...rest]) => GLFWWindowEvent.fromIconify(window, ...rest)))
    .pipe(publish(), refCount());
}

function maximizeUpdates(window: GLFWDOMWindow) {
  return windowCallbackAsObservable(glfw.setWindowMaximizeCallback, window)
    .pipe(map(([, ...rest]) => GLFWWindowEvent.fromMaximize(window, ...rest)))
    .pipe(publish(), refCount());
}

export class GLFWWindowEvent extends GLFWEvent {
  private static create(window: GLFWDOMWindow, type: string) {
    const evt              = new GLFWWindowEvent(type);
    evt.target             = window;
    evt._x                 = window.x;
    evt._y                 = window.y;
    evt._width             = window.width;
    evt._height            = window.height;
    evt._xscale            = window.xscale;
    evt._yscale            = window.yscale;
    evt._focused           = window.focused;
    evt._minimized         = window.minimized;
    evt._maximized         = window.maximized;
    evt._frameBufferWidth  = window.frameBufferWidth;
    evt._frameBufferHeight = window.frameBufferHeight;
    return evt;
  }

  public static fromMove(window: GLFWDOMWindow, x: number, y: number) {
    return Object.assign(GLFWWindowEvent.create(window, 'move'), {_x: x, _y: y});
  }

  public static fromResize(window: GLFWDOMWindow, width: number, height: number) {
    return Object.assign(GLFWWindowEvent.create(window, 'resize'), {
      _width: width,
      _height: height,
      _frameBufferWidth: window.xscale * width,
      _frameBufferHeight: window.yscale * height
    });
  }

  public static fromScale(window: GLFWDOMWindow, xscale: number, yscale: number) {
    return Object.assign(GLFWWindowEvent.create(window, 'contentscale'), {
      _xscale: xscale,
      _yscale: yscale,
      _width: window.frameBufferWidth / xscale,
      _height: window.frameBufferHeight / yscale,
      _frameBufferWidth: xscale * window.width,
      _frameBufferHeight: yscale * window.height,
    });
  }

  public static fromFramebufferResize(window: GLFWDOMWindow,
                                      frameBufferWidth: number,
                                      frameBufferHeight: number) {
    return Object.assign(GLFWWindowEvent.create(window, 'framebufferresize'), {
      _frameBufferWidth: frameBufferWidth,
      _frameBufferHeight: frameBufferHeight,
      _width: frameBufferWidth / window.xscale,
      _height: frameBufferHeight / window.yscale,
    });
  }

  public static fromClose(window: GLFWDOMWindow) { return GLFWWindowEvent.create(window, 'close'); }

  public static fromRefresh(window: GLFWDOMWindow) {
    return GLFWWindowEvent.create(window, 'refresh');
  }

  public static fromFocus(window: GLFWDOMWindow, focused: boolean) {
    return Object.assign(GLFWWindowEvent.create(window, focused ? 'focus' : 'blur'),
                         {_focused: !!focused});
  }

  public static fromIconify(window: GLFWDOMWindow, minimized: boolean) {
    return Object.assign(GLFWWindowEvent.create(window, minimized ? 'minimized' : 'restored'),
                         {_minimized: !!minimized});
  }

  public static fromMaximize(window: GLFWDOMWindow, maximized: boolean) {
    return Object.assign(GLFWWindowEvent.create(window, maximized ? 'maximized' : 'restored'),
                         {_maximized: !!maximized});
  }

  private _x                 = 0;
  private _y                 = 0;
  private _width             = 0;
  private _height            = 0;
  private _xscale            = 0;
  private _yscale            = 0;
  private _focused           = false;
  private _minimized         = false;
  private _maximized         = false;
  private _frameBufferWidth  = 0;
  private _frameBufferHeight = 0;

  public get x() { return this._x; }
  public get y() { return this._y; }
  public get width() { return this._width; }
  public get height() { return this._height; }
  public get xscale() { return this._xscale; }
  public get yscale() { return this._yscale; }
  public get focused() { return this._focused; }
  public get minimized() { return this._minimized; }
  public get maximized() { return this._maximized; }
  public get frameBufferWidth() { return this._frameBufferWidth; }
  public get frameBufferHeight() { return this._frameBufferHeight; }
}
