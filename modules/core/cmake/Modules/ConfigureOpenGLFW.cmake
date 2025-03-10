#=============================================================================
# Copyright (c) 2020, NVIDIA CORPORATION.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#=============================================================================

include(get_cpm)

if(GLFW_VERSION VERSION_EQUAL 3.3)
    set(GLFW_GIT_BRANCH_NAME "3.3-stable")
else()
    set(GLFW_GIT_BRANCH_NAME "${GLFW_VERSION}")
endif()

CPMAddPackage(NAME glfw
    VERSION        ${GLFW_VERSION}
    GIT_REPOSITORY https://github.com/glfw/glfw.git
    GIT_TAG        ${GLFW_GIT_BRANCH_NAME}
    GIT_SHALLOW    TRUE
    GIT_CONFIG     "advice.detachedhead=false"
    OPTIONS        "GLFW_INSTALL OFF"
                   "GLFW_BUILD_DOCS OFF"
                   "GLFW_BUILD_TESTS OFF"
                   "GLFW_BUILD_EXAMPLES OFF"
                   "BUILD_SHARED_LIBS ${GLFW_USE_SHARED_LIBS}"
)

set(GLFW_LIBRARY glfw)
set(GLFW_INCLUDE_DIR "${glfw_SOURCE_DIR}/include")
