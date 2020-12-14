ARG CUDA_VERSION=11.0
ARG NODE_VERSION=14.10.1
ARG LINUX_VERSION=ubuntu18.04
ARG CUDA_SHORT_VERSION=${CUDA_VERSION}

FROM node:$NODE_VERSION-stretch-slim as node

FROM nvidia/cudagl:${CUDA_VERSION}-devel-${LINUX_VERSION}

ARG PARALLEL_LEVEL=4
ENV CMAKE_VERSION=3.18.5
ENV CCACHE_VERSION=4.1
ENV DEBIAN_FRONTEND=noninteractive

# Install dev dependencies and tools
RUN apt update -y && apt upgrade -y \
 && apt install -y software-properties-common \
 && add-apt-repository -y ppa:git-core/ppa \
 && apt install -y \
    git nano sudo wget ninja-build bash-completion \
    # ccache dependencies
    unzip automake autoconf libb2-dev libzstd-dev \
    # CMake dependencies
    curl libssl-dev libcurl4-openssl-dev zlib1g-dev \
    # X11 dependencies
    libxrandr-dev libxinerama-dev libxcursor-dev \
    # node-canvas dependencies
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    # GLEW dependencies
    build-essential libxmu-dev libxi-dev libgl-dev libgl1-mesa-dev libglu1-mesa-dev \
    # cuDF dependencies
    libboost-filesystem1.71-dev \
 && apt autoremove -y \
 && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install CMake
RUN cd /tmp \
 && curl -fsSLO --compressed "https://github.com/Kitware/CMake/releases/download/v$CMAKE_VERSION/cmake-$CMAKE_VERSION.tar.gz" -o /tmp/cmake-$CMAKE_VERSION.tar.gz \
 && tar -xvzf /tmp/cmake-$CMAKE_VERSION.tar.gz && cd /tmp/cmake-$CMAKE_VERSION \
 && /tmp/cmake-$CMAKE_VERSION/bootstrap \
    --system-curl \
    --parallel=$PARALLEL_LEVEL \
 && make install -j$PARALLEL_LEVEL \
 && cd /tmp && rm -rf /tmp/cmake-$CMAKE_VERSION*

 # Install ccache
RUN cd /tmp \
 && curl -fsSLO --compressed https://github.com/ccache/ccache/releases/download/v$CCACHE_VERSION/ccache-$CCACHE_VERSION.tar.gz -o /tmp/ccache-$CCACHE_VERSION.tar.gz \
 && tar -xvzf /tmp/ccache-$CCACHE_VERSION.tar.gz && cd /tmp/ccache-$CCACHE_VERSION \
 && mkdir -p /tmp/ccache-$CCACHE_VERSION/build \
 && cd /tmp/ccache-$CCACHE_VERSION/build \
 && cmake \
    -DCMAKE_BUILD_TYPE=Release \
    -DZSTD_FROM_INTERNET=ON \
    -DENABLE_TESTING=OFF \
    /tmp/ccache-$CCACHE_VERSION \
 && make install -j$PARALLEL_LEVEL \
 && cd /tmp && rm -rf /tmp/ccache-$CCACHE_VERSION*

ENV NODE_VERSION=$NODE_VERSION
ENV YARN_VERSION=1.22.5

# Install node
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/include/node /usr/local/include/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
# Install yarn
COPY --from=node /opt/yarn-v$YARN_VERSION/bin/yarn /usr/local/bin/yarn
COPY --from=node /opt/yarn-v$YARN_VERSION/bin/yarn.js /usr/local/bin/yarn.js
COPY --from=node /opt/yarn-v$YARN_VERSION/bin/yarn.cmd /usr/local/bin/yarn.cmd
COPY --from=node /opt/yarn-v$YARN_VERSION/bin/yarnpkg /usr/local/bin/yarnpkg
COPY --from=node /opt/yarn-v$YARN_VERSION/bin/yarnpkg.cmd /usr/local/bin/yarnpkg.cmd
COPY --from=node /opt/yarn-v$YARN_VERSION/lib/cli.js /usr/local/lib/cli.js
COPY --from=node /opt/yarn-v$YARN_VERSION/lib/v8-compile-cache.js /usr/local/lib/v8-compile-cache.js
# Copy entrypoint
COPY --from=node /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ARG UID=1000
ARG GID=1000

RUN groupadd --gid $GID node \
 && useradd --uid $UID --gid node -G sudo --shell /bin/bash --create-home node \
 && echo node:node | chpasswd \
 && ln -s /usr/local/bin/node /usr/local/bin/nodejs \
 && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 # smoke tests
 && node --version && npm --version && yarn --version \
 && sed -ri "s/32m/33m/g" /home/node/.bashrc \
 && sed -ri "s/34m/36m/g" /home/node/.bashrc \
 && mkdir -p /etc/bash_completion.d \
 && npm completion > /etc/bash_completion.d/npm

# avoid "OSError: library nvvm not found" error
ENV CUDA_HOME="/usr/local/cuda-$CUDA_SHORT_VERSION"

SHELL ["/bin/bash", "-l"]

ENTRYPOINT ["docker-entrypoint.sh"]

CMD ["/bin/bash", "-l"]
