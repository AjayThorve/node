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

function(find_and_configure_rmm VERSION)

    include(get_cpm)

    CPMAddPackage(NAME rmm
        VERSION        ${RMM_VERSION}
        # GIT_REPOSITORY https://github.com/rapidsai/rmm.git
        # GIT_TAG        branch-${RMM_VERSION}
        GIT_REPOSITORY https://github.com/trxcllnt/rmm.git
        GIT_TAG        combined-fixes
        GIT_SHALLOW    TRUE
        OPTIONS        "BUILD_TESTS OFF"
                       "BUILD_BENCHMARKS OFF"
                       "CUDA_STATIC_RUNTIME ON"
                       "CMAKE_CUDA_ARCHITECTURES ${CMAKE_CUDA_ARCHITECTURES}"
                       "DISABLE_DEPRECATION_WARNING ${DISABLE_DEPRECATION_WARNINGS}"
    )
endfunction()

find_and_configure_rmm(${RMM_VERSION})
