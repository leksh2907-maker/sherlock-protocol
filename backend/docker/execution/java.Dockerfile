FROM eclipse-temurin:21-jdk

RUN groupadd --gid 10001 runner && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin runner
USER 10001:10001
WORKDIR /workspace