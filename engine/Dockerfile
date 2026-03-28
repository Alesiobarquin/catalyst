# Stage 1: Build with full JDK + Maven
FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /app

# Resolve dependencies first (layer-cached unless pom.xml changes)
COPY pom.xml .
RUN mvn dependency:go-offline -B -q

# Build the fat JAR, skipping tests (tests run in CI)
COPY src ./src
RUN mvn package -DskipTests -B -q

# Stage 2: Minimal runtime image (JRE only, ~200MB vs ~400MB JDK)
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Non-root user for container security
RUN addgroup -S catalyst && adduser -S catalyst -G catalyst
USER catalyst

COPY --from=build /app/target/*.jar app.jar

EXPOSE 8081

# Virtual thread count hint: let JVM use all available processors
ENTRYPOINT ["java", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", "app.jar"]
