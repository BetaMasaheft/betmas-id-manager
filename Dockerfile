# syntax=docker/dockerfile:1
# This app has no data dependency on the rest of BetMas (no corpus, no
# betmasweb import) - unlike BetMasApi's Dockerfile, there's no published
# app image to layer onto, so this builds straight onto a bare eXist base.
#
# No "boot once to install" step (unlike BetMas's data.Dockerfile/BetMasApi's
# Dockerfile): those bake a corpus/registry into image layers ahead of a
# read-only mount. Here /exist/data IS the state - a volume mount at
# `docker run` - so anything installed at `docker build` time would just be
# shadowed by the (initially empty) volume anyway. The xar sits in
# /exist/autodeploy/ instead; the base image's own AutoDeploymentTrigger
# installs it on first boot against the real, mounted /exist/data.
#
#   docker compose up --build

ARG EXISTDB_VERSION=release
ARG BUILDER_IMAGE=ghcr.io/eeditiones/builder:latest
# A bare eXist base has no packages beyond the ones it ships with - roaster
# isn't one of them (unlike the betmasweb-derived base images elsewhere in
# this project, which already carry it). Fetch it from eXist's own public
# package repo rather than depending on any BetMas-specific base image, so
# this stays genuinely standalone. Version matches expath-pkg.xml's
# semver-min.
ARG ROASTER_VERSION=1.12.1
ARG PUBLIC_REPO=https://exist-db.org/exist/apps/public-repo/public

FROM ${BUILDER_IMAGE} AS build

WORKDIR /src/betmas-id-manager
COPY . .
RUN ant

FROM duncdrum/existdb:${EXISTDB_VERSION}

ARG ROASTER_VERSION
ARG PUBLIC_REPO

LABEL org.opencontainers.image.source="https://github.com/BetaMasaheft/betmas-id-manager" \
      org.opencontainers.image.description="BetaMasaheft id-management microservice"

ADD ${PUBLIC_REPO}/roaster-${ROASTER_VERSION}.xar /exist/autodeploy/00-roaster.xar
COPY --from=build /src/betmas-id-manager/build/*.xar /exist/autodeploy/01-betmas-id-manager.xar
