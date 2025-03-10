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

#pragma once

#include <napi.h>

#include <type_traits>

namespace nv {

template <typename T>
struct ValueWrap {
  using value_type = T;

  inline ValueWrap(Napi::Env const& env, value_type const& unwrapped)
    : env_(env), val_(unwrapped) {}

  inline ValueWrap(Napi::CallbackInfo const& info, value_type const& unwrapped)
    : env_(info.Env()), val_(unwrapped) {}

  inline ValueWrap(Napi::Env const& env, value_type&& unwrapped)
    : env_(env), val_(std::move(unwrapped)) {}

  inline ValueWrap(Napi::CallbackInfo const& info, value_type&& unwrapped)
    : env_(info.Env()), val_(std::move(unwrapped)) {}

  inline value_type value() const noexcept { return val_; }

  inline operator value_type() const { return value(); }

  inline operator Napi::Value() const { return Napi::Value::From(env_, val_); }

 private:
  Napi::Env env_;
  value_type val_;
};

template <typename T>
struct ObjectUnwrap {
  using object_type = T;

  inline ObjectUnwrap(Napi::Object const& object) : obj_(object) {}

  inline ObjectUnwrap(Napi::ObjectReference const& ref) : ObjectUnwrap(ref.Value()) {}

  inline ObjectUnwrap(Napi::Value const& object) : ObjectUnwrap(object.As<Napi::Object>()) {}

  inline Napi::Object object() const noexcept { return obj_; }

  inline Napi::ObjectReference reference() const noexcept { return Napi::Persistent(obj_); }

  inline operator Napi::Object() const noexcept { return object(); }

  inline operator Napi::ObjectReference() const noexcept { return reference(); }

  inline operator object_type*() const noexcept { return object_type::Unwrap(object()); }

  inline object_type operator*() const { return std::move(*object_type::Unwrap(object())); }

  inline object_type* operator->() const noexcept { return object_type::Unwrap(object()); }

  inline operator object_type() const noexcept { return std::move(*object_type::Unwrap(object())); }

  template <typename R>
  inline operator R() const {
    static_assert(std::is_convertible<T, R>(), "");
    return static_cast<R>(*object_type::Unwrap(object()));
  }

 private:
  Napi::Object obj_;
};

}  // namespace nv
